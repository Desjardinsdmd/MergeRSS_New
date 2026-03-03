import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

// ============================================================
// SECURITY: SSRF Protection
// ============================================================
const PRIVATE_IP_PATTERNS = [
    /^127\./, /^10\./, /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^169\.254\./, /^0\.0\.0\.0/,
    /^::1$/, /^fc00:/, /^fe80:/,
];
const BLOCKED_HOSTNAMES = new Set(['localhost', '169.254.169.254', 'metadata.google.internal', 'metadata.aws.internal']);

function isSsrfTarget(url) {
    try {
        const { hostname } = new URL(url);
        if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true;
        if (PRIVATE_IP_PATTERNS.some(re => re.test(hostname))) return true;
    } catch {}
    return false;
}

// ============================================================
// Social Platform Detection
// ============================================================
const SOCIAL_PLATFORMS = {
    'twitter.com': {
        name: 'Twitter/X',
        guidance: 'Twitter/X requires an API v2 Bearer Token from developer.twitter.com. Personal scraping is not permitted per their ToS.',
        scrape_ok: false,
    },
    'x.com': {
        name: 'Twitter/X',
        guidance: 'Twitter/X requires an API v2 Bearer Token from developer.twitter.com. Personal scraping is not permitted per their ToS.',
        scrape_ok: false,
    },
    'facebook.com': {
        name: 'Facebook',
        guidance: 'Facebook requires a Graph API Page Access Token. Personal profiles and private groups cannot be accessed without user authentication.',
        scrape_ok: false,
    },
    'instagram.com': {
        name: 'Instagram',
        guidance: 'Instagram requires the Instagram Basic Display API. Set up an app at developers.facebook.com to get an access token.',
        scrape_ok: false,
    },
    'linkedin.com': {
        name: 'LinkedIn',
        guidance: 'LinkedIn prohibits scraping per its Terms of Service. Use the official LinkedIn API with OAuth for company page feeds.',
        scrape_ok: false,
    },
    'tiktok.com': {
        name: 'TikTok',
        guidance: 'TikTok requires API access via developers.tiktok.com. Profile HTML scraping is not permitted by their ToS.',
        scrape_ok: false,
    },
    'youtube.com': {
        name: 'YouTube',
        guidance: 'YouTube channel feeds are available via: https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID — find your channel ID in YouTube Studio.',
        scrape_ok: false,
    },
    'reddit.com': {
        name: 'Reddit',
        guidance: 'Reddit has native RSS! Append .rss to any subreddit URL. Example: https://reddit.com/r/news.rss',
        scrape_ok: true,
        suggest_rss: (url) => {
            const u = new URL(url);
            return `${u.origin}${u.pathname.replace(/\/$/, '')}.rss`;
        },
    },
};

function detectSocial(url) {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return SOCIAL_PLATFORMS[hostname] || null;
}

// ============================================================
// Fetch helper with timeout and size limit
// ============================================================
const UA = 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)';
const FETCH_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithTimeout(url, timeoutMs = 15000) {
    return fetch(url, {
        headers: FETCH_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
    });
}

async function fetchText(url, timeoutMs = 15000, maxBytes = 8 * 1024 * 1024) {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new Error(`Response too large (${Math.round(buf.byteLength / 1024 / 1024)}MB)`);
    return { text: new TextDecoder().decode(buf), contentType: res.headers.get('content-type') || '' };
}

// ============================================================
// RSS Detection
// ============================================================
function isRssFeed(text) {
    const t = text.trimStart();
    return (
        (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF')) &&
        (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'))
    );
}

// ============================================================
// HTML helpers
// ============================================================
function decodeHtml(str) {
    return (str || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ').trim();
}

function extractMeta(html, pageUrl) {
    const get = (re) => {
        const m = html.match(re);
        return m ? decodeHtml(m[1]).slice(0, 300) : '';
    };
    const title =
        get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})/i) ||
        get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']{1,200})/i) ||
        get(/<title[^>]*>([^<]{1,200})<\/title>/i) ||
        new URL(pageUrl).hostname;
    const description =
        get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i) ||
        get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})/i) ||
        '';
    return { title, description };
}

// ============================================================
// Feed URL Discovery
// ============================================================
function discoverFeedUrls(html, pageUrl) {
    const base = new URL(pageUrl);
    const fromTags = [];
    const fromPaths = [];

    // <link rel="alternate" type="application/rss+xml|atom+xml">
    const re = /<link[^>]+>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        if (!tag.toLowerCase().includes('alternate')) continue;
        const typeM = tag.match(/type=["']([^"']+)["']/i);
        const hrefM = tag.match(/href=["']([^"']+)["']/i);
        if (!hrefM) continue;
        const type = (typeM?.[1] || '').toLowerCase();
        if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
            try { fromTags.push(new URL(hrefM[1], base).href); } catch {}
        }
    }

    // Common feed paths on same origin
    for (const path of ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml', '/blog/feed', '/news/feed', '/feed/rss2', '/?feed=rss2']) {
        try { fromPaths.push(new URL(path, base).href); } catch {}
    }

    return {
        priority: [...new Set(fromTags)],
        probes: [...new Set(fromPaths)],
    };
}

// ============================================================
// HTML Item Extraction
// ============================================================
const ARTICLE_URL_RE = /\/(article|post|blog|news|story|\d{4}\/\d{2})\//i;

function extractItems(html, baseUrl, itemLimit = 25) {
    const base = new URL(baseUrl);
    const items = [];
    const seen = new Set();
    const limit = Math.min(Number(itemLimit) || 25, 100);

    // --- Strategy 1: Semantic <article> blocks ---
    const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let am;
    while ((am = articleRe.exec(html)) !== null && items.length < limit) {
        const block = am[1];

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
        const title = decodeHtml(headM?.[1] || linkM[2]).slice(0, 200);
        if (!title || title.length < 8) continue;

        const timeM = block.match(/<time[^>]+datetime=["']([^"']+)["']/i);
        let pubDate = '';
        if (timeM) {
            try { pubDate = new Date(timeM[1]).toUTCString(); } catch {}
        }

        const authorM = block.match(/class=["'][^"']*(?:author|byline)[^"']*["'][^>]*>([\s\S]*?)<\//i);
        const author = authorM ? decodeHtml(authorM[1]).slice(0, 100) : '';

        const descM = block.match(/<p[^>]*>([\s\S]{20,400}?)<\/p>/i);
        const description = descM ? decodeHtml(descM[1]).slice(0, 400) : '';

        items.push({ title, url: href, description, pubDate, author });
    }

    // --- Strategy 2: Scored link extraction ---
    if (items.length < 5) {
        const linkRe = /<a\s[^>]*href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let lm;
        const candidates = [];

        while ((lm = linkRe.exec(html)) !== null && candidates.length < 400) {
            let href = lm[1].trim();
            const text = decodeHtml(lm[2]);
            if (!href || href.startsWith('javascript') || href.startsWith('mailto')) continue;
            if (!text || text.length < 15 || text.length > 280) continue;

            try {
                const abs = new URL(href, base).href;
                if (new URL(abs).hostname !== base.hostname) continue;
                if (seen.has(abs)) continue;
                seen.add(abs);
                const isArticle = ARTICLE_URL_RE.test(abs);
                const wordCount = text.split(/\s+/).length;
                const score = (isArticle ? 3 : 0) + (wordCount > 5 ? 1 : 0);
                candidates.push({ title: text.slice(0, 200), url: abs, description: '', pubDate: '', author: '', score });
            } catch {}
        }

        candidates.sort((a, b) => b.score - a.score);
        items.push(...candidates.slice(0, limit - items.length).map(({ score, ...rest }) => rest));
    }

    return items.slice(0, limit);
}

// ============================================================
// UTM parameter appending
// ============================================================
function appendUtm(url, utmParams) {
    if (!utmParams) return url;
    try {
        const u = new URL(url);
        new URLSearchParams(utmParams).forEach((v, k) => u.searchParams.set(k, v));
        return u.href;
    } catch { return url; }
}

// ============================================================
// RSS 2.0 XML Builder
// ============================================================
function buildRss(title, description, pageUrl, items) {
    const now = new Date().toUTCString();
    const esc = (s) => (s || '').replace(/]]>/g, ']]]]><![CDATA[>');

    const itemsXml = items.map(item => `
    <item>
      <title><![CDATA[${esc(item.title)}]]></title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <description><![CDATA[${esc(item.description || '')}]]></description>
      <pubDate>${item.pubDate || now}</pubDate>
      ${item.author ? `<dc:creator><![CDATA[${esc(item.author)}]]></dc:creator>` : ''}
    </item>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title><![CDATA[${esc(title)}]]></title>
    <link>${pageUrl}</link>
    <description><![CDATA[${esc(description || 'Generated by MergeRSS')}]]></description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>MergeRSS (mergerss.app)</generator>
    <atom:link href="${pageUrl}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;
}

// ============================================================
// Entity persistence helper
// ============================================================
async function saveGeneratedFeed(base44, existing, data) {
    try {
        if (existing) {
            await base44.entities.GeneratedFeed.update(existing.id, data);
        } else {
            await base44.entities.GeneratedFeed.create(data);
        }
    } catch (e) {
        // Non-fatal — don't let storage failures block the user response
        console.error('GeneratedFeed save error:', e.message);
    }
}

// ============================================================
// Parse RSS title from XML
// ============================================================
function parseFeedTitle(xml) {
    try {
        const parser = new XMLParser({ ignoreAttributes: false });
        const p = parser.parse(xml);
        const raw = p.rss?.channel?.title || p.feed?.title || p['rdf:RDF']?.channel?.title || 'RSS Feed';
        return typeof raw === 'string' ? raw : (raw?.['#text'] || 'RSS Feed');
    } catch {
        return 'RSS Feed';
    }
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req) => {
    const startMs = Date.now();

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const {
            url,
            feed_type = 'auto',
            refresh_frequency = '1hour',
            item_limit = 25,
            include_full_content = false,
            utm_params = '',
        } = body;

        if (!url) return Response.json({ error: 'URL is required.' }, { status: 400 });

        // --- Normalize & validate URL ---
        let pageUrl;
        try {
            const raw = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
            const parsed = new URL(raw);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return Response.json({ error: 'Only HTTP and HTTPS URLs are supported.' }, { status: 400 });
            }
            pageUrl = parsed.href;
        } catch {
            return Response.json({ error: 'Invalid URL. Please enter a full URL like https://example.com/blog' }, { status: 400 });
        }

        // --- SSRF protection ---
        if (isSsrfTarget(pageUrl)) {
            return Response.json({
                error: 'This URL resolves to a private or restricted network address and cannot be accessed for security reasons.',
            }, { status: 400 });
        }

        // --- Rate limiting: max 20 generated feeds per user ---
        const existing = await base44.entities.GeneratedFeed.filter({ created_by: user.email });
        const existingForUrl = existing.find(f => f.source_url === pageUrl);
        if (existing.length >= 20 && !existingForUrl) {
            return Response.json({
                error: 'You have reached the limit of 20 generated feeds. Delete an existing one to create more.',
                suggestions: ['Scroll to "Your Generated Feeds" below and remove feeds you no longer need.'],
            }, { status: 429 });
        }

        // --- Social platform detection (always check, even if user picked "domain" etc.) ---
        let social = null;
        try { social = detectSocial(pageUrl); } catch {}

        const isSocialFeedType = feed_type.startsWith('social');

        if (social && !social.scrape_ok) {
            return Response.json({
                error: `Cannot auto-generate a feed for ${social.name}.`,
                guidance: social.guidance,
                is_social: true,
                social_platform: social.name,
            }, { status: 422 });
        }

        // Reddit-style: suggest the native RSS URL
        if (social?.suggest_rss) {
            const suggestedUrl = social.suggest_rss(pageUrl);
            return Response.json({
                is_native_feed: true,
                feed_url: suggestedUrl,
                title: `${social.name} Feed`,
                description: social.guidance,
                item_count: 0,
                method: 'social_native',
                rss_xml: null,
            });
        }

        // If user explicitly chose a social feed type but platform isn't known, warn them
        if (isSocialFeedType) {
            return Response.json({
                error: `Social feed generation requires official API access for this platform.`,
                guidance: `MergeRSS does not scrape social platforms. For ${new URL(pageUrl).hostname}, check if they offer an official API or RSS export. Try their developer portal or help docs.`,
                is_social: true,
                social_platform: new URL(pageUrl).hostname,
            }, { status: 422 });
        }

        // --- Fetch the target URL ---
        let html;
        try {
            const { text } = await fetchText(pageUrl, 18000, 8 * 1024 * 1024);
            html = text;
        } catch (fetchErr) {
            const msg = fetchErr.message || '';
            if (msg.includes('timeout') || msg.includes('abort') || msg.includes('signal')) {
                return Response.json({
                    error: 'The website took too long to respond (>18s). It may be down or blocking automated requests.',
                    suggestions: ['Try again in a few minutes', 'Verify the URL is publicly accessible in a browser'],
                }, { status: 422 });
            }
            if (msg.startsWith('HTTP 4') || msg.startsWith('HTTP 5')) {
                return Response.json({
                    error: `The server rejected the request: ${msg}. The URL may be behind a login wall or the page no longer exists.`,
                    suggestions: ['Try the site homepage or blog index', 'Check the URL resolves in your browser'],
                }, { status: 422 });
            }
            return Response.json({
                error: `Could not reach this URL: ${msg}.`,
                suggestions: ['The site may be blocking automated access', 'Try appending /feed, /rss, or /atom to the domain URL directly'],
            }, { status: 422 });
        }

        // --- Direct RSS/Atom feed ---
        if (isRssFeed(html)) {
            const feedTitle = parseFeedTitle(html);
            const itemCount = (html.match(/<item>/g) || []).length + (html.match(/<entry>/g) || []).length;
            await saveGeneratedFeed(base44, existingForUrl, {
                source_url: pageUrl, title: feedTitle, is_native_feed: true, native_feed_url: pageUrl,
                cached_xml: html.slice(0, 200000), last_fetched: new Date().toISOString(),
                last_success: new Date().toISOString(), error_count: 0, last_error: '',
                refresh_frequency, item_limit, method: 'direct_rss',
                fetch_count: (existingForUrl?.fetch_count || 0) + 1,
                avg_fetch_ms: Date.now() - startMs,
            });
            return Response.json({
                rss_xml: html, is_native_feed: true, feed_url: pageUrl,
                title: feedTitle, item_count: itemCount, method: 'direct_rss',
            });
        }

        // --- Discover embedded feed links ---
        const { priority, probes } = discoverFeedUrls(html, pageUrl);
        const candidates = [...priority, ...probes.slice(0, 6)];

        for (const candidateUrl of candidates.slice(0, 12)) {
            try {
                const res = await fetchWithTimeout(candidateUrl, 7000);
                if (!res.ok) continue;
                const feedText = await res.text();
                if (!isRssFeed(feedText)) continue;

                const feedTitle = parseFeedTitle(feedText);
                const itemCount = (feedText.match(/<item>/g) || []).length + (feedText.match(/<entry>/g) || []).length;

                await saveGeneratedFeed(base44, existingForUrl, {
                    source_url: pageUrl, title: feedTitle, is_native_feed: true, native_feed_url: candidateUrl,
                    cached_xml: feedText.slice(0, 200000), last_fetched: new Date().toISOString(),
                    last_success: new Date().toISOString(), error_count: 0, last_error: '',
                    refresh_frequency, item_limit, method: 'discovered_rss',
                    fetch_count: (existingForUrl?.fetch_count || 0) + 1,
                    avg_fetch_ms: Date.now() - startMs,
                });

                return Response.json({
                    rss_xml: feedText, is_native_feed: true, feed_url: candidateUrl,
                    title: feedTitle, item_count: itemCount, method: 'discovered_rss', discovered_from: pageUrl,
                });
            } catch {}
        }

        // --- Scrape & generate RSS ---
        const { title, description } = extractMeta(html, pageUrl);
        let items = extractItems(html, pageUrl, item_limit);

        if (items.length === 0) {
            // Only update if it's an existing feed — don't create a new record for a failed generation
            if (existingForUrl) {
                await saveGeneratedFeed(base44, existingForUrl, {
                    source_url: pageUrl, title: title || pageUrl, is_native_feed: false,
                    last_fetched: new Date().toISOString(), last_error: 'No items could be extracted',
                    error_count: (existingForUrl?.error_count || 0) + 1, refresh_frequency,
                });
            }
            return Response.json({
                error: 'No article links could be extracted from this page.',
                suggestions: [
                    'Try the blog/news index URL (e.g., /blog, /articles, /news)',
                    'Check if the domain has a /feed, /rss, or /atom endpoint',
                    'JavaScript-heavy SPAs (React, Angular) require a headless browser — not yet supported',
                    'Try adding the URL directly to "My Feeds" — MergeRSS will monitor it for new content',
                ],
            }, { status: 422 });
        }

        // Apply UTM parameters
        if (utm_params) {
            items = items.map(i => ({ ...i, url: appendUtm(i.url, utm_params) }));
        }

        const rssXml = buildRss(title, description, pageUrl, items);

        await saveGeneratedFeed(base44, existingForUrl, {
            source_url: pageUrl, title, description, is_native_feed: false,
            cached_xml: rssXml.slice(0, 200000),
            items_cache: items.slice(0, 50),
            last_fetched: new Date().toISOString(), last_success: new Date().toISOString(),
            error_count: 0, last_error: '',
            refresh_frequency, item_limit: items.length, include_full_content, utm_params,
            method: 'scraped',
            fetch_count: (existingForUrl?.fetch_count || 0) + 1,
            avg_fetch_ms: Date.now() - startMs,
        });

        return Response.json({
            rss_xml: rssXml, is_native_feed: false, feed_url: pageUrl,
            title, description, item_count: items.length, items, method: 'scraped',
        });

    } catch (err) {
        return Response.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
    }
});