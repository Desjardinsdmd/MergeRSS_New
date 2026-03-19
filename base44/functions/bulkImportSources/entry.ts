import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
    .map(url => ({ url, name: url, category: 'Other', rawCategory: 'Other' }));
}

// ─── Unified Source Ingestion Pipeline (reused from addSource) ───

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

async function generateSourceFeed(url) {
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
        is_social: true,
      };
    }

    // Extract items
    const items = extractArticleItems(html, url, 25);

    if (items.length === 0) {
      return {
        success: false,
        error: 'No articles could be extracted from this page',
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

// ─── Helper Functions ───

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
    'twitter.com': { name: 'Twitter/X', scrape_ok: false },
    'x.com': { name: 'Twitter/X', scrape_ok: false },
    'instagram.com': { name: 'Instagram', scrape_ok: false },
    'linkedin.com': { name: 'LinkedIn', scrape_ok: false },
    'facebook.com': { name: 'Facebook', scrape_ok: false },
    'tiktok.com': { name: 'TikTok', scrape_ok: false },
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

// ─── Main Handler ───

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { content, format, digest_name, category = 'Other', add_to_directory = false } = body;

    if (add_to_directory && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    let parsedSources = [];

    if (format === 'opml') {
      parsedSources = parseOpml(content);
    } else {
      parsedSources = parseUrlList(content);
    }

    if (parsedSources.length === 0) {
      return Response.json({ error: 'No sources found in the provided content.' }, { status: 400 });
    }

    // Plan limit check
    const FREE_FEED_LIMIT = 50;
    const isPremium = user.plan === 'premium';
    if (!isPremium && !add_to_directory) {
      const existingFeeds = await base44.entities.Feed.filter({ created_by: user.email });
      const remaining = FREE_FEED_LIMIT - existingFeeds.length;
      if (remaining <= 0) {
        return Response.json({ error: `Feed limit reached. Free plan allows ${FREE_FEED_LIMIT} feeds. Upgrade to Premium for unlimited feeds.` }, { status: 403 });
      }
      parsedSources = parsedSources.slice(0, remaining);
    }

    // Process each source through unified ingestion pipeline
    const results = [];
    for (const source of parsedSources) {
      let normalizedUrl;
      try {
        const raw = source.url.trim().startsWith('http') ? source.url.trim() : `https://${source.url.trim()}`;
        normalizedUrl = new URL(raw).href;
      } catch {
        results.push({
          url: source.url,
          status: 'failed',
          sourceType: null,
          reason: 'Invalid URL format',
        });
        continue;
      }

      try {
        // Step 1: Try native RSS
        const nativeRss = await tryNativeRss(normalizedUrl);
        if (nativeRss.success) {
          const feed = await createSourceRecord(base44, user, {
            originalUrl: normalizedUrl,
            sourceType: 'rss_native',
            feedName: source.name || nativeRss.title,
            feedUrl: nativeRss.feedUrl,
            category: source.category || category,
            addToDirectory: add_to_directory,
          });
          results.push({
            url: source.url,
            status: 'created',
            sourceType: 'rss_native',
            feedId: feed.id,
            name: feed.name,
          });
          continue;
        }

        // Step 2: Try RSS discovery
        const discovered = await discoverRssFeeds(normalizedUrl);
        if (discovered.success) {
          const feed = await createSourceRecord(base44, user, {
            originalUrl: normalizedUrl,
            sourceType: 'rss_discovered',
            feedName: source.name || discovered.title,
            feedUrl: discovered.feedUrl,
            category: source.category || category,
            addToDirectory: add_to_directory,
          });
          results.push({
            url: source.url,
            status: 'created',
            sourceType: 'rss_discovered',
            feedId: feed.id,
            name: feed.name,
          });
          continue;
        }

        // Step 3: Fallback to generator (scraping)
        const generated = await generateSourceFeed(normalizedUrl);
        if (generated.success) {
          const feed = await createSourceRecord(base44, user, {
            originalUrl: normalizedUrl,
            sourceType: 'generated',
            feedName: source.name || generated.title,
            feedUrl: normalizedUrl,
            category: source.category || category,
            addToDirectory: add_to_directory,
            metadata: {
              rssXml: generated.rssXml,
              itemCount: generated.itemCount,
            }
          });
          results.push({
            url: source.url,
            status: 'created',
            sourceType: 'generated',
            feedId: feed.id,
            name: feed.name,
          });
          continue;
        }

        // All steps failed
        results.push({
          url: source.url,
          status: 'failed',
          sourceType: null,
          reason: generated.error || 'Could not ingest source',
        });
      } catch (error) {
        results.push({
          url: source.url,
          status: 'failed',
          sourceType: null,
          reason: error.message,
        });
      }
    }

    // Summary stats
    const summary = {
      total: parsedSources.length,
      created: results.filter(r => r.status === 'created').length,
      rss_native: results.filter(r => r.sourceType === 'rss_native').length,
      rss_discovered: results.filter(r => r.sourceType === 'rss_discovered').length,
      generated: results.filter(r => r.sourceType === 'generated').length,
      failed: results.filter(r => r.status === 'failed').length,
    };

    // If digest mode, create digest from created sources
    let digest = null;
    if (digest_name && !add_to_directory) {
      const feedIds = results.filter(r => r.status === 'created').map(r => r.feedId);
      if (feedIds.length > 0) {
        digest = await base44.entities.Digest.create({
          name: digest_name,
          frequency: 'daily',
          feed_ids: feedIds,
          delivery_web: true,
          status: 'active',
        });
      }
    }

    return Response.json({
      success: true,
      summary,
      digest: digest ? { id: digest.id, name: digest.name } : null,
      results,
    });

  } catch (error) {
    console.error('[bulkImportSources] Error:', error);
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

// Helper: Create source in database
async function createSourceRecord(base44, user, { originalUrl, sourceType, feedName, feedUrl, category, addToDirectory, metadata }) {
  const entity = addToDirectory ? 'DirectoryFeed' : 'Feed';
  const createData = {
    name: feedName || new URL(originalUrl).hostname,
    url: feedUrl,
    category,
    tags: [],
    status: 'active',
  };

  if (!addToDirectory) {
    createData.source_type = sourceType;
    createData.original_submitted_url = originalUrl;
    createData.resolved_url = feedUrl;
    createData.validation_confidence = sourceType === 'rss_native' ? 100 : (sourceType === 'rss_discovered' ? 95 : 70);
    createData.metadata_json = JSON.stringify(metadata || {});
  } else {
    createData.description = '';
    createData.added_count = 0;
    createData.upvotes = 0;
    createData.downvotes = 0;
  }

  return base44.entities[entity].create(createData);
}