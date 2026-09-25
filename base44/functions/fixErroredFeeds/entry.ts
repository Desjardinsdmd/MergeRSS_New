import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = ip.replace(/^\[|\]$/g, '').toLowerCase();
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::ffff:/.test(h)) return __isPrivateIp(h.replace(/^::ffff:/, ''));
    return false;
}
async function __assertPublicUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('SSRF_BLOCKED: invalid URL'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('SSRF_BLOCKED: scheme');
    const host = u.hostname.toLowerCase();
    if (__BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || __isPrivateIp(host)) {
        throw new Error('SSRF_BLOCKED: private host');
    }
    if (!/^[\d.]+$/.test(host) && !host.includes(':')) {
        for (const type of ['A', 'AAAA']) {
            let answers = [];
            try { answers = await Deno.resolveDns(host, type); } catch { answers = []; }
            if (answers.some(__isPrivateIp)) throw new Error('SSRF_BLOCKED: resolves to private address');
        }
    }
    return u;
}
async function safeFetch(url, init = {}) {
    let current = String(url);
    for (let hop = 0; hop <= 5; hop++) {
        await __assertPublicUrl(current);
        const res = await fetch(current, { ...init, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            current = new URL(res.headers.get('location'), current).toString();
            continue;
        }
        return res;
    }
    throw new Error('SSRF_BLOCKED: too many redirects');
}
// ───────────────────────────────────────────────────────────────────────────────

/**
 * fixErroredFeeds — for each feed in error state, tries common RSS paths
 * (/feed, /feed/, /rss, /feed.xml, etc.) and if one works, updates the feed
 * with the correct URL and resets it to active.
 * 
 * Also recreates feeds that were accidentally deleted by a previous run.
 */

function extractItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRssFeed(text) {
  const t = (text || '').trimStart();
  return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF'))
    && (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'));
}

async function findRssFeed(baseUrl) {
  const base = new URL(baseUrl);

  // Try standard feed paths
  const paths = ['/feed', '/feed/', '/rss', '/rss/', '/atom', '/feed.xml', '/rss.xml',
    '/atom.xml', '/blog/feed', '/news/feed', '/?feed=rss2', '/feed/rss2',
    '/feeds/feed.rss', '/feeds/feed.atom'];

  const candidates = paths.map(p => {
    try { return new URL(p, base).href; } catch { return null; }
  }).filter(Boolean);

  // Also try discovering from HTML
  try {
    const res = await safeFetch(baseUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (res.ok) {
      const html = await res.text();
      // Check if URL itself is RSS
      if (isRssFeed(html)) return { url: baseUrl, method: 'direct' };

      // Extract feed links from HTML
      const linkRe = /<link[^>]+>/gi;
      let m;
      while ((m = linkRe.exec(html)) !== null) {
        const tag = m[0];
        if (!tag.toLowerCase().includes('alternate')) continue;
        const typeM = tag.match(/type=["']([^"']+)["']/i);
        const hrefM = tag.match(/href=["']([^"']+)["']/i);
        if (!hrefM) continue;
        const type = (typeM?.[1] || '').toLowerCase();
        if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
          try { candidates.unshift(new URL(hrefM[1], base).href); } catch {}
        }
      }
    }
  } catch {}

  // Filter out comment feeds — they're never what we want
  const deduped = [...new Set(candidates)].filter(u => !u.includes('/comments/feed'));
  for (const candidate of deduped.slice(0, 15)) {
    try {
      const res = await safeFetch(candidate, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
          'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (isRssFeed(text)) {
        return { url: candidate, method: 'discovered' };
      }
    } catch {}
  }

  return null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { dry_run = false, recreate_deleted = [] } = body;

  // Step 1: Fix existing errored feeds
  const errored = extractItems(await base44.asServiceRole.entities.Feed.filter(
    { status: 'error' }, '-created_date', 200
  ));

  const results = [];

  for (const feed of errored) {
    const baseUrl = feed.original_submitted_url || feed.url;
    console.log(`[fixFeeds] Checking "${feed.name}" → ${baseUrl}`);

    const found = await findRssFeed(baseUrl);

    if (found) {
      console.log(`[fixFeeds] ✓ Found RSS for "${feed.name}" → ${found.url} (${found.method})`);
      if (!dry_run) {
        await base44.asServiceRole.entities.Feed.update(feed.id, {
          url: found.url,
          resolved_url: found.url,
          status: 'active',
          source_type: found.method === 'direct' ? 'rss_native' : 'rss_discovered',
          fetch_error: null,
          consecutive_errors: 0,
          last_failure_reason: null,
          validation_confidence: found.method === 'direct' ? 100 : 90,
        });
      }
      results.push({ name: feed.name, baseUrl, status: 'fixed', rssUrl: found.url, method: found.method });
    } else {
      results.push({ name: feed.name, baseUrl, status: 'no_rss_found' });
    }

    await sleep(500);
  }

  // Step 2: Recreate deleted feeds
  const recreated = [];
  for (const del of recreate_deleted) {
    const baseUrl = del.url;
    console.log(`[fixFeeds] Attempting to recreate "${del.name}" → ${baseUrl}`);

    const found = await findRssFeed(baseUrl);

    if (found) {
      if (!dry_run) {
        await base44.asServiceRole.entities.Feed.create({
          name: del.name,
          url: found.url,
          category: del.category || 'CRE',
          tags: del.tags || [],
          status: 'active',
          source_type: found.method === 'direct' ? 'rss_native' : 'rss_discovered',
          original_submitted_url: baseUrl,
          resolved_url: found.url,
          validation_confidence: found.method === 'direct' ? 100 : 90,
          item_count: 0,
          consecutive_errors: 0,
        });
      }
      recreated.push({ name: del.name, status: 'recreated', rssUrl: found.url });
    } else {
      recreated.push({ name: del.name, status: 'no_rss_found', url: baseUrl });
    }

    await sleep(500);
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  const notFixed = results.filter(r => r.status === 'no_rss_found').length;

  return Response.json({
    dry_run,
    errored_total: errored.length,
    fixed,
    no_rss_found: notFixed,
    recreated: recreated.filter(r => r.status === 'recreated').length,
    recreate_failed: recreated.filter(r => r.status === 'no_rss_found').length,
    results,
    recreated_results: recreated,
  });
});