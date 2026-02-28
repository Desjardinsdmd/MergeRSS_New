import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { XMLParser, XMLBuilder } from 'npm:fast-xml-parser@4.3.6';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml,*/*',
};

async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.text();
}

function isRss(text) {
  const t = text.trimStart().toLowerCase();
  return t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf');
}

function findEmbeddedFeedUrls(html, baseUrl) {
  const base = new URL(baseUrl);
  const candidates = [];

  // <link rel="alternate" type="application/rss+xml" ...>
  const linkRe = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const type = typeMatch?.[1]?.toLowerCase() || '';
    if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
      try {
        candidates.push(new URL(hrefMatch[1], base).href);
      } catch {}
    }
  }

  // Also look for common feed URL patterns mentioned in the HTML
  const patterns = [/href=["']([^"']*\/feed\/?["'])/gi, /href=["']([^"']*\.rss["'])/gi, /href=["']([^"']*\/rss\/?["'])/gi, /href=["']([^"']*\/atom\/?["'])/gi];
  for (const re of patterns) {
    let pm;
    while ((pm = re.exec(html)) !== null) {
      try {
        candidates.push(new URL(pm[1].replace(/["']$/, ''), base).href);
      } catch {}
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}

function extractMetaFromHtml(html, pageUrl) {
  const get = (re) => (html.match(re) || [])[1]?.trim() || '';

  const title = get(/<title[^>]*>([^<]+)<\/title>/i)
    || get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
    || new URL(pageUrl).hostname;

  const description = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
    || get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)
    || '';

  return { title, description };
}

function extractLinksFromHtml(html, baseUrl) {
  const base = new URL(baseUrl);
  const articles = [];
  const seen = new Set();

  // Match <a> tags - look for article-like links
  const linkRe = /<a\s[^>]*href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    let href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (!href || href.startsWith('javascript') || href.startsWith('mailto')) continue;
    if (!text || text.length < 15 || text.length > 200) continue;

    try {
      const abs = new URL(href, base).href;
      // Only include links on the same domain
      if (new URL(abs).hostname !== base.hostname) continue;
      if (seen.has(abs)) continue;
      seen.add(abs);

      articles.push({ title: text, url: abs, description: '' });
    } catch {}
  }

  // Score links: prefer paths with article-like patterns
  const articlePatterns = /\/(article|post|blog|news|story|content|[0-9]{4}\/[0-9]{2})\//i;
  articles.sort((a, b) => {
    const aScore = articlePatterns.test(a.url) ? 1 : 0;
    const bScore = articlePatterns.test(b.url) ? 1 : 0;
    return bScore - aScore;
  });

  return articles.slice(0, 20);
}

function buildRssXml(title, description, pageUrl, items) {
  const pubDate = new Date().toUTCString();

  const itemsXml = items.map(item => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <description><![CDATA[${item.description || ''}]]></description>
      <pubDate>${pubDate}</pubDate>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${pageUrl}</link>
    <description><![CDATA[${description || 'Generated RSS feed by MergeRSS'}]]></description>
    <language>en</language>
    <lastBuildDate>${pubDate}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 });

    let pageUrl;
    try { pageUrl = new URL(url).href; } catch { return Response.json({ error: 'Invalid URL' }, { status: 400 }); }

    const html = await fetchPage(pageUrl);

    // If the URL itself is an RSS feed, return it directly
    if (isRss(html)) {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = parser.parse(html);
      const feedTitle = parsed.rss?.channel?.title || parsed.feed?.title || 'RSS Feed';
      return Response.json({
        rss_xml: html,
        is_native_feed: true,
        feed_url: pageUrl,
        title: typeof feedTitle === 'string' ? feedTitle : (feedTitle?.['#text'] || 'RSS Feed'),
        item_count: (html.match(/<item>/g) || html.match(/<entry>/g) || []).length,
      });
    }

    // Look for embedded/hidden RSS feed links in the HTML
    const embeddedFeeds = findEmbeddedFeedUrls(html, pageUrl);
    for (const feedUrl of embeddedFeeds) {
      try {
        const feedHtml = await fetchPage(feedUrl);
        if (isRss(feedHtml)) {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const parsed = parser.parse(feedHtml);
          const feedTitle = parsed.rss?.channel?.title || parsed.feed?.title || 'RSS Feed';
          return Response.json({
            rss_xml: feedHtml,
            is_native_feed: true,
            feed_url: feedUrl,
            title: typeof feedTitle === 'string' ? feedTitle : (feedTitle?.['#text'] || 'RSS Feed'),
            item_count: (feedHtml.match(/<item>/g) || feedHtml.match(/<entry>/g) || []).length,
            discovered_from: pageUrl,
          });
        }
      } catch {}
    }

    // Fall back to scraping article links
    const { title, description } = extractMetaFromHtml(html, pageUrl);
    const items = extractLinksFromHtml(html, pageUrl);

    if (items.length === 0) {
      return Response.json({ error: 'Could not extract any article links from this page.' }, { status: 422 });
    }

    const rssXml = buildRssXml(title, description, pageUrl, items);

    return Response.json({
      rss_xml: rssXml,
      is_native_feed: false,
      feed_url: pageUrl,
      title,
      description,
      item_count: items.length,
      items,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});