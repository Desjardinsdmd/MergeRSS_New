import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = String(ip).replace(/^\[|\]$/g, '').toLowerCase().replace(/%.*$/, '');
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (/^198\.1[89]\./.test(h)) return true; // benchmarking 198.18.0.0/15
    const __q = h.match(/^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    if (__q && Number(__q[1]) >= 224) return true; // multicast / reserved 224.0.0.0+
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::[0-9a-f]{1,4}$/.test(h)) return true; // ::x  == 0.0.x.x
    if (/^64:ff9b:1:/.test(h)) return true; // local-use NAT64 64:ff9b:1::/48
    // IPv4 embedded in IPv6: ::ffff:a.b.c.d, ::ffff:XXXX:YYYY, ::ffff:0:..., NAT64 64:ff9b::/96,
    // IPv4-compatible ::a.b.c.d / ::XXXX:YYYY (plus expanded zero forms). Extract and re-check.
    const __m = h.match(/^(?:::ffff:(?:0{1,4}:)?|64:ff9b::|64:ff9b:(?:0{1,4}:){4}|(?:0{1,4}:){5}ffff:|(?:0{1,4}:){4}ffff:0{1,4}:|(?:0{1,4}:){6}|::)((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/);
    if (__m) {
        let v4 = __m[1];
        if (v4.includes(':')) {
            const [a, b] = v4.split(':').map(x => parseInt(x, 16));
            v4 = [a >> 8, a & 255, b >> 8, b & 255].join('.');
        }
        return __isPrivateIp(v4);
    }
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

const CATEGORY_MAP = {
  'Technology': 'Tech', 'Science': 'Tech', 'Programming': 'Tech', 'Coding': 'Tech',
  'Business': 'Finance', 'Economy': 'Finance', 'Finance': 'Finance', 'Startups': 'Finance',
  'World News': 'News', 'News': 'News', 'US News': 'News', 'Politics': 'News',
  'Markets': 'Markets', 'Investing': 'Markets', 'Stocks': 'Markets',
  'Cryptocurrency': 'Crypto', 'Crypto': 'Crypto', 'Bitcoin': 'Crypto',
  'Artificial Intelligence': 'AI', 'Machine Learning': 'AI', 'AI': 'AI',
  'Real Estate': 'CRE', 'CRE': 'CRE',
};

function mapCategory(raw) {
  if (!raw) return 'Other';
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'Other';
}

function parseOpml(xmlText) {
  const feeds = [];

  // Handle nested outlines (grouped by category)
  const categoryBlockRegex = /<outline[^>]+text="([^"]+)"[^>]*>([\s\S]*?)<\/outline>/g;
  let catMatch;
  let found = false;

  while ((catMatch = categoryBlockRegex.exec(xmlText)) !== null) {
    const rawCategory = catMatch[1];
    const block = catMatch[2];
    const category = mapCategory(rawCategory);

    const feedRegex = /<outline[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*text="([^"]*)"[^>]*\/?>/gi;
    const feedRegex2 = /<outline[^>]*text="([^"]*)"[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*\/?>/gi;

    let m;
    while ((m = feedRegex.exec(block)) !== null) {
      feeds.push({ url: m[2], name: m[3] || m[2], category, rawCategory });
      found = true;
    }
    while ((m = feedRegex2.exec(block)) !== null) {
      feeds.push({ url: m[3], name: m[1] || m[3], category, rawCategory });
      found = true;
    }
  }

  // Flat OPML (no categories)
  if (!found) {
    const flatRegex = /<outline[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*text="([^"]*)"[^>]*\/?>/gi;
    const flatRegex2 = /<outline[^>]*text="([^"]*)"[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*\/?>/gi;
    let m;
    while ((m = flatRegex.exec(xmlText)) !== null) {
      feeds.push({ url: m[2], name: m[3] || m[2], category: 'Other', rawCategory: 'Other' });
    }
    if (feeds.length === 0) {
      while ((m = flatRegex2.exec(xmlText)) !== null) {
        feeds.push({ url: m[3], name: m[1] || m[3], category: 'Other', rawCategory: 'Other' });
      }
    }
  }

  return feeds;
}

function parseUrlList(text) {
  return text
    .split(/[\n,]+/)
    .map(l => l.trim())
    .filter(l => l.startsWith('http'))
    .map(url => ({ url, name: url, category: 'Other', rawCategory: 'Other', source_url: url }));
}

const detectRssFeedUrl = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await safeFetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0; +https://mergerss.com)' },
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const html = await response.text();

    // Look for RSS/Atom feed links in HTML head
    const feedLinkRegex = /<link[^>]*(rel=["']?(alternate|feed)["']?)[^>]*(href=["']([^"']+)["'])[^>]*\/?>/gi;
    const typeRegex = /type=["']?application\/(rss|atom)\+xml["']?/i;
    
    let match;
    while ((match = feedLinkRegex.exec(html)) !== null) {
      if (typeRegex.test(match[0])) {
        let feedUrl = match[4];
        if (feedUrl.startsWith('/')) {
          const base = new URL(url);
          feedUrl = `${base.protocol}//${base.host}${feedUrl}`;
        } else if (!feedUrl.startsWith('http')) {
          feedUrl = new URL(feedUrl, url).href;
        }
        return feedUrl;
      }
    }

    // Common feed paths
    const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml'];
    const baseUrl = new URL(url);
    for (const path of commonPaths) {
      const testUrl = `${baseUrl.origin}${path}`;
      const testRes = await safeFetch(testUrl, { signal: AbortSignal.timeout(3000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (testRes.ok) {
        const content = await testRes.text();
        if (content.includes('<rss') || content.includes('<feed') || content.includes('<?xml')) {
          return testUrl;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { content, format, mode, digest_name, category = 'Other', add_to_directory = false } = body;
    // format: 'opml' | 'urls'
    // mode: 'feeds' | 'digest'

    // Admin-only guard for directory writes
    if (add_to_directory && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    let parsedFeeds = [];

    if (format === 'opml') {
      parsedFeeds = parseOpml(content);
    } else {
      parsedFeeds = parseUrlList(content);
    }

    if (parsedFeeds.length === 0) {
      return Response.json({ error: 'No RSS feeds found in the provided content.' }, { status: 400 });
    }

    // Auto-discover RSS feeds from website URLs (only for URL list format)
    if (format === 'urls') {
      const discovered = [];
      for (const feed of parsedFeeds) {
        const feedUrl = feed.source_url;
        if (feedUrl && !feedUrl.includes('/feed') && !feedUrl.includes('/rss') && !feedUrl.endsWith('.xml')) {
          const rssUrl = await detectRssFeedUrl(feedUrl);
          if (rssUrl) {
            discovered.push({ ...feed, url: rssUrl });
          } else {
            discovered.push(feed);
          }
        } else {
          discovered.push(feed);
        }
      }
      parsedFeeds = discovered;
    }

    if (mode === 'digest') {
      // Create feeds silently then create a digest referencing them
      const feedIds = [];
      for (const feed of parsedFeeds) {
        const existing = await base44.entities.Feed.filter({ url: feed.url });
        let feedRecord;
        if (existing.length > 0) {
          feedRecord = existing[0];
        } else {
          feedRecord = await base44.entities.Feed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || mapCategory(category),
            status: 'active',
          });
        }
        feedIds.push(feedRecord.id);
      }

      const digest = await base44.entities.Digest.create({
        name: digest_name || 'Imported Digest',
        frequency: 'daily',
        feed_ids: feedIds,
        delivery_web: true,
        status: 'active',
      });

      return Response.json({
        success: true,
        mode: 'digest',
        feeds_count: feedIds.length,
        digest_id: digest.id,
        digest_name: digest.name,
      });
    } else {
      // Mode: individual feeds — enforce free plan limit server-side
      if (!add_to_directory) {
        const FREE_FEED_LIMIT = 50; // sync with lib/planLimits.js PLAN_LIMITS.free.feeds
        const isPremium = user.plan === 'premium';
        if (!isPremium) {
          const existingFeeds = await base44.entities.Feed.filter({ created_by: user.email });
          const remaining = FREE_FEED_LIMIT - existingFeeds.length;
          if (remaining <= 0) {
            return Response.json({ error: `Source limit reached. The Free plan allows ${FREE_FEED_LIMIT} sources. Upgrade to Premium for unlimited sources.` }, { status: 403 });
          }
          // Trim import to what's allowed
          parsedFeeds = parsedFeeds.slice(0, remaining);
        }
      }

      const created = [];
      const skipped = [];

      for (const feed of parsedFeeds) {
        const checkEntity = add_to_directory ? 'DirectoryFeed' : 'Feed';
        const existing = await base44.entities[checkEntity].filter({ url: feed.url });
        if (existing.length > 0) {
          skipped.push(feed.name);
          continue;
        }

        if (add_to_directory) {
          await base44.entities.DirectoryFeed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || mapCategory(category),
            description: '',
            added_count: 0,
            upvotes: 0,
            downvotes: 0,
          });
        } else {
          await base44.entities.Feed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || mapCategory(category),
            status: 'active',
          });
        }
        created.push(feed.name);
      }

      return Response.json({
        success: true,
        mode: 'feeds',
        created: created.length,
        skipped: skipped.length,
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});