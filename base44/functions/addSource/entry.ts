import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      url,
      name,
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

    // Step 1: Try native RSS detection
    // This reuses the existing RSS detection logic from generateRssFeed
    const rssResult = await tryNativeRss(normalizedUrl);
    if (rssResult.success) {
      return createSource({
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

// Helper: Create source in database
async function createSource({ base44, user, originalUrl, sourceType, feedName, feedUrl, category, tags, metadata }) {
  try {
    const newFeed = await base44.entities.Feed.create({
      name: feedName || new URL(originalUrl).hostname,
      url: feedUrl,
      category,
      tags: tags || [],
      status: 'active',
      item_count: 0,
      source_type: sourceType,
      original_submitted_url: originalUrl,
      resolved_url: feedUrl,
      validation_confidence: sourceType === 'rss_native' ? 100 : (sourceType === 'rss_discovered' ? 95 : 70),
      metadata_json: JSON.stringify(metadata || {}),
    });

    return Response.json({
      success: true,
      source_id: newFeed.id,
      name: feedName,
      url: feedUrl,
      sourceType,
      status: 'active',
    });
  } catch (error) {
    console.error('[createSource] Error:', error);
    return Response.json({ error: 'Failed to save source' }, { status: 500 });
  }
}

// Helper: Try native RSS
async function tryNativeRss(url) {
  try {
    const res = await fetch(url, {
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
    const res = await fetch(url, {
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
        const feedRes = await fetch(candidateUrl, {
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
    const res = await fetch(url, {
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
    const m = xml.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].slice(0, 100) : 'Feed';
  } catch {
    return 'Feed';
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