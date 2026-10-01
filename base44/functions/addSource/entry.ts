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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      url,
      name,
      feed_id = null,          // edit mode: re-resolve URL and update this (owned) feed in place
      sourced_from_directory = false,
      directory_feed_id = null,
      skip_fetch = false,
      category = 'Other',
      tags = [],
      refresh_frequency = '1hour',
      item_limit = 25,
      include_full_content = false,
      utm_params = '',
    } = body;

    if (!url || !url.trim()) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    let normalizedUrl;
    try {
      const raw = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
      const parsed = new URL(raw);
      normalizedUrl = parsed.href;
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Caller's existing feeds: used for dedupe, plan limit and edit-mode ownership.
    const ownFeeds = await listOwnFeeds(base44, user.email);
    let editTarget = null;
    if (feed_id) {
      editTarget = ownFeeds.find(f => f.id === feed_id) || null;
      if (!editTarget) return Response.json({ error: 'Feed not found' }, { status: 404 });
    } else {
      const dup = findDuplicate(ownFeeds, [normalizedUrl, url.trim()]);
      if (dup) return duplicateResponse(dup);
      const isPremium = user.plan === 'premium' || user.role === 'admin';
      if (!isPremium && ownFeeds.length >= FREE_FEED_LIMIT) {
        return Response.json({
          error: `Free plan limit reached: you can have up to ${FREE_FEED_LIMIT} sources. Upgrade to Premium for unlimited sources.`,
          limit_reached: true,
          limit: FREE_FEED_LIMIT,
        }, { status: 403 });
      }
    }
    const extra = { editTarget, ownFeeds, skipFetch: !!skip_fetch, sourcedFromDirectory: !!sourced_from_directory, directoryFeedId: directory_feed_id };

    // Step 1: Try native RSS detection
    // This reuses the existing RSS detection logic from generateRssFeed
    const rssResult = await tryNativeRss(normalizedUrl);
    if (rssResult.success) {
      return createSource({
        ...extra,
        base44,
        user,
        originalUrl: normalizedUrl,
        sourceType: rssResult.method,
        feedName: name || rssResult.title,
        feedUrl: rssResult.feedUrl,
        category,
        tags,
        metadata: {
          isNative: true,
          itemCount: rssResult.itemCount,
          method: rssResult.method,
        }
      });
    }

    // Step 2: Try RSS discovery (check embedded feed links)
    const discoveryResult = await discoverRssFeeds(normalizedUrl);
    if (discoveryResult.success) {
      return createSource({
        ...extra,
        base44,
        user,
        originalUrl: normalizedUrl,
        sourceType: 'rss_discovered',
        feedName: name || discoveryResult.title,
        feedUrl: discoveryResult.feedUrl,
        category,
        tags,
        metadata: {
          isNative: true,
          itemCount: discoveryResult.itemCount,
          discoveredFrom: normalizedUrl,
          method: 'discovered_rss',
        }
      });
    }

    // Step 3: Fallback to generator (scraping)
    const generatorResult = await generateSourceFeed(normalizedUrl, {
      item_limit,
      include_full_content,
      utm_params,
    });

    if (!generatorResult.success) {
      return Response.json({
        error: generatorResult.error,
        guidance: generatorResult.guidance,
        is_social: generatorResult.is_social,
        social_platform: generatorResult.social_platform,
      }, { status: 422 });
    }

    return createSource({
      ...extra,
      base44,
      user,
      originalUrl: normalizedUrl,
      sourceType: 'generated',
      feedName: name || generatorResult.title,
      feedUrl: normalizedUrl,
      category,
      tags,
      metadata: {
        isNative: false,
        itemCount: generatorResult.itemCount,
        method: 'scraped',
        rssXml: generatorResult.rssXml,
      }
    });

  } catch (error) {
    console.error('[addSource] Error:', error);
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

const FREE_FEED_LIMIT = 50;

function extractItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

async function listOwnFeeds(base44, email) {
  const out = [];
  for (let skip = 0; skip < 5000; skip += 500) {
    const page = extractItems(await base44.asServiceRole.entities.Feed.filter(
      { created_by: email }, '-created_date', 500, skip, ['id', 'name', 'url', 'resolved_url', 'original_submitted_url', 'status']));
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

// Loose URL key: scheme, leading www., trailing slash and case are ignored.
function urlKey(u) {
  if (!u) return '';
  try {
    const p = new URL(String(u).trim().startsWith('http') ? String(u).trim() : `https://${String(u).trim()}`);
    return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '') + p.search).toLowerCase();
  } catch {
    return String(u).trim().toLowerCase();
  }
}

function findDuplicate(feeds, urls, excludeId = null) {
  const keys = new Set(urls.map(urlKey).filter(Boolean));
  if (!keys.size) return null;
  return feeds.find(f => f.id !== excludeId &&
    [f.url, f.resolved_url, f.original_submitted_url].some(u => u && keys.has(urlKey(u)))) || null;
}

function duplicateResponse(feed) {
  return Response.json({
    success: true,
    duplicate: true,
    source_id: feed.id,
    feed,
    name: feed.name,
    url: feed.url,
    status: feed.status,
    message: 'You already follow this source.',
  });
}

// Kick off the first fetch so a new source shows articles right away. Scraped (generated)
// sources have no parseable feed URL, so they are left to the scheduled pipeline.
async function firstFetch(base44, feedId, sourceType) {
  if (sourceType === 'generated') return { skipped: true };
  try {
    const res = await Promise.race([
      base44.functions.invoke('fetchSingleFeed', { feed_id: feedId }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('first fetch timed out')), 25000)),
    ]);
    return res?.data || { success: true };
  } catch (e) {
    console.warn('[addSource] first fetch failed:', e?.message);
    return { success: false, error: e?.message || 'first fetch failed' };
  }
}

// Helper: Create (or, in edit mode, update) source in database
async function createSource({ base44, user, originalUrl, sourceType, feedName, feedUrl, category, tags, metadata,
  editTarget = null, ownFeeds = [], skipFetch = false, sourcedFromDirectory = false, directoryFeedId = null }) {
  try {
    const resolvedFields = {
      url: feedUrl,
      source_type: sourceType,
      original_submitted_url: originalUrl,
      resolved_url: feedUrl,
      validation_confidence: sourceType === 'rss_native' ? 100 : (sourceType === 'rss_discovered' ? 95 : 70),
      metadata_json: JSON.stringify(metadata || {}),
    };

    if (editTarget) {
      const dup = findDuplicate(ownFeeds, [feedUrl], editTarget.id);
      if (dup) {
        return Response.json({ error: `You already follow this feed as "${dup.name}".`, duplicate: true, source_id: dup.id }, { status: 409 });
      }
      await base44.asServiceRole.entities.Feed.update(editTarget.id, {
        ...resolvedFields,
        status: 'active',
        fetch_error: '',
        consecutive_errors: 0,
      });
      const fetchResult = skipFetch ? null : await firstFetch(base44, editTarget.id, sourceType);
      return Response.json({ success: true, updated: true, source_id: editTarget.id, url: feedUrl, sourceType, first_fetch: fetchResult });
    }

    // Discovery may have resolved to a feed URL the caller already has.
    const dup = findDuplicate(ownFeeds, [feedUrl]);
    if (dup) return duplicateResponse(dup);

    const cleanTitle = (feedName || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const finalName = cleanTitle || new URL(originalUrl).hostname.replace(/^www\./, '');
    const newFeed = await base44.entities.Feed.create({
      name: finalName,
      category,
      tags: tags || [],
      status: 'active',
      item_count: 0,
      ...resolvedFields,
      ...(sourcedFromDirectory ? { sourced_from_directory: true } : {}),
      ...(directoryFeedId ? { directory_feed_id: String(directoryFeedId) } : {}),
    });

    const fetchResult = skipFetch ? null : await firstFetch(base44, newFeed.id, sourceType);

    return Response.json({
      success: true,
      source_id: newFeed.id,
      feed: newFeed,
      name: finalName,
      url: feedUrl,
      sourceType,
      status: 'active',
      first_fetch: fetchResult,
    });
  } catch (error) {
    console.error('[createSource] Error:', error);
    return Response.json({ error: 'Failed to save source' }, { status: 500 });
  }
}

// Helper: Try native RSS
async function tryNativeRss(url) {
  try {
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
        'Accept': 'application/rss+xml,application/atom+xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { success: false };

    const text = await res.text();
    if (!isRssFeed(text)) return { success: false };

    const title = extractFeedTitle(text);
    const itemCount = (text.match(/<item>/g) || []).length + (text.match(/<entry>/g) || []).length;

    return {
      success: true,
      method: 'rss_native',
      feedUrl: url,
      title,
      itemCount,
    };
  } catch {
    return { success: false };
  }
}

// Helper: Discover RSS feeds
async function discoverRssFeeds(url) {
  try {
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { success: false };

    const html = await res.text();
    const feedUrls = extractFeedLinks(html, url);

    for (const candidateUrl of feedUrls.slice(0, 8)) {
      try {
        const feedRes = await safeFetch(candidateUrl, {
          signal: AbortSignal.timeout(5000),
        });

        if (!feedRes.ok) continue;
        const feedText = await feedRes.text();
        if (!isRssFeed(feedText)) continue;

        const title = extractFeedTitle(feedText);
        const itemCount = (feedText.match(/<item>/g) || []).length + (feedText.match(/<entry>/g) || []).length;

        return {
          success: true,
          feedUrl: candidateUrl,
          title,
          itemCount,
        };
      } catch {}
    }

    return { success: false };
  } catch {
    return { success: false };
  }
}

// Helper: Generate source feed (wrapper around generateRssFeed logic)
async function generateSourceFeed(url, options) {
  try {
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Server returned ${res.status}. The URL may be behind a login or no longer exists.`,
      };
    }

    const html = await res.text();

    // Check for social platforms
    const social = detectSocialPlatform(url);
    if (social && !social.scrape_ok) {
      return {
        success: false,
        error: `Cannot auto-generate feed for ${social.name}`,
        guidance: social.guidance,
        is_social: true,
        social_platform: social.name,
      };
    }

    // Extract items
    const items = extractArticleItems(html, url, options.item_limit || 25);

    if (items.length === 0) {
      return {
        success: false,
        error: 'No articles could be extracted from this page',
        guidance: 'Try a different page or check if the site offers an official RSS feed',
      };
    }

    const metadata = extractMetadata(html, url);
    const rssXml = buildRssXml(metadata.title, metadata.description, url, items);

    return {
      success: true,
      rssXml,
      title: metadata.title,
      itemCount: items.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Could not reach this URL: ${error.message}`,
    };
  }
}

// Helpers: RSS detection
function isRssFeed(text) {
  const t = (text || '').trimStart();
  return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF')) &&
    (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'));
}

function extractFeedTitle(xml) {
  try {
    const m = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return '';
    const t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
    return t.slice(0, 100);
  } catch {
    return '';
  }
}

function extractFeedLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = [];

  // Extract <link rel="alternate" type="application/rss+xml|atom+xml">
  const linkRe = /<link[^>]+>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!tag.includes('alternate')) continue;
    const typeM = tag.match(/type=["']([^"']+)["']/i);
    const hrefM = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefM) continue;
    const type = (typeM?.[1] || '').toLowerCase();
    if (type.includes('rss') || type.includes('atom')) {
      try {
        links.push(new URL(hrefM[1], base).href);
      } catch {}
    }
  }

  // Common feed paths
  for (const path of ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml']) {
    try {
      links.push(new URL(path, base).href);
    } catch {}
  }

  return [...new Set(links)];
}

function detectSocialPlatform(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const socials = {
    'twitter.com': { name: 'Twitter/X', scrape_ok: false, guidance: 'Twitter requires API access' },
    'x.com': { name: 'Twitter/X', scrape_ok: false, guidance: 'Twitter requires API access' },
    'instagram.com': { name: 'Instagram', scrape_ok: false, guidance: 'Instagram requires API access' },
    'linkedin.com': { name: 'LinkedIn', scrape_ok: false, guidance: 'LinkedIn prohibits scraping' },
    'facebook.com': { name: 'Facebook', scrape_ok: false, guidance: 'Facebook requires API access' },
    'tiktok.com': { name: 'TikTok', scrape_ok: false, guidance: 'TikTok requires API access' },
  };
  return socials[hostname] || null;
}

function extractMetadata(html, pageUrl) {
  const get = (re) => {
    const m = html.match(re);
    return m ? (m[1] || '').slice(0, 300) : '';
  };
  const title = get(/<title[^>]*>([^<]{1,200})<\/title>/i) || new URL(pageUrl).hostname;
  const description = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i) || '';
  return { title, description };
}

function extractArticleItems(html, baseUrl, limit = 25) {
  const base = new URL(baseUrl);
  const items = [];
  const seen = new Set();

  // Strategy 1: <article> blocks
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null && items.length < limit) {
    const block = m[1];
    const linkM = block.match(/<a[^>]+href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkM) continue;

    let href = linkM[1];
    try {
      href = new URL(href, base).href;
      if (new URL(href).hostname !== base.hostname) continue;
    } catch { continue; }

    if (seen.has(href)) continue;
    seen.add(href);

    const headM = block.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
    const title = (headM?.[1] || linkM[2] || '').replace(/<[^>]+>/g, '').slice(0, 200);
    if (!title || title.length < 8) continue;

    items.push({ title, url: href, description: '', pubDate: '', author: '' });
  }

  // Strategy 2: Scored links (fallback)
  if (items.length < 5) {
    const linkRe = /<a\s[^>]*href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    const candidates = [];

    while ((lm = linkRe.exec(html)) !== null && candidates.length < 100) {
      let href = lm[1].trim();
      const text = (lm[2] || '').replace(/<[^>]+>/g, '');
      if (!href || href.startsWith('javascript') || !text || text.length < 15 || text.length > 280) continue;

      try {
        const abs = new URL(href, base).href;
        if (new URL(abs).hostname !== base.hostname) continue;
        if (seen.has(abs)) continue;
        seen.add(abs);
        candidates.push({ title: text.slice(0, 200), url: abs, description: '', pubDate: '', author: '' });
      } catch {}
    }

    items.push(...candidates.slice(0, limit - items.length));
  }

  return items.slice(0, limit);
}

function buildRssXml(title, description, pageUrl, items) {
  const now = new Date().toUTCString();
  const esc = (s) => (s || '').replace(/]]>/g, ']]]]><![CDATA[>');

  const itemsXml = items.map(item => `
    <item>
      <title><![CDATA[${esc(item.title)}]]></title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <description><![CDATA[${esc(item.description || '')}]]></description>
      <pubDate>${item.pubDate || now}</pubDate>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${esc(title)}]]></title>
    <link>${pageUrl}</link>
    <description><![CDATA[${esc(description || 'Feed generated by MergeRSS')}]]></description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>MergeRSS (mergerss.app)</generator>
${itemsXml}
  </channel>
</rss>`;
}