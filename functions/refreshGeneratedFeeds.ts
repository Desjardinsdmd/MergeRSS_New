import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

// SSRF protection
const PRIVATE_IP_PATTERNS = [
    /^127\./, /^10\./, /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./, /^169\.254\./, /^0\.0\.0\.0/,
];
const BLOCKED_HOSTNAMES = new Set(['localhost', '169.254.169.254', 'metadata.google.internal']);
function isSsrf(url) {
    try {
        const { hostname } = new URL(url);
        if (BLOCKED_HOSTNAMES.has(hostname)) return true;
        return PRIVATE_IP_PATTERNS.some(re => re.test(hostname));
    } catch { return true; }
}

const UA = 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)';

// Hard wall-clock budget (ms) — leave headroom before Deno's CPU limit
const WALL_BUDGET_MS = 50000;
// Max feeds to process per invocation (prevents runaway loops on large datasets)
const MAX_FEEDS_PER_RUN = 20;
// Concurrency: process N feeds in parallel
const CONCURRENCY = 3;
// Per-feed fetch timeout (ms) — reduced so slow sites don't monopolize the budget
const FETCH_TIMEOUT_MS = 8000;

function isRss(text) {
    const t = text.trimStart();
    return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF'))
        && (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'));
}

function decodeHtml(str) {
    return (str || '').replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function extractMeta(html, pageUrl) {
    const get = (re) => { const m = html.match(re); return m ? decodeHtml(m[1]).slice(0, 300) : ''; };
    return {
        title: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})/i)
            || get(/<title[^>]*>([^<]{1,200})<\/title>/i)
            || new URL(pageUrl).hostname,
        description: get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i) || '',
    };
}

const ARTICLE_URL_RE = /\/(article|post|blog|news|story|newsletter|\d{4}\/\d{2})\//i;

function extractItems(html, baseUrl, itemLimit = 25) {
    const base = new URL(baseUrl);
    const items = [], seen = new Set();
    const limit = Math.min(Number(itemLimit) || 25, 100);

    // Strategy 1: Semantic <article> blocks
    const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let am;
    while ((am = articleRe.exec(html)) !== null && items.length < limit) {
        const block = am[1];
        const linkM = block.match(/<a[^>]+href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!linkM) continue;
        let href = linkM[1];
        try {
            href = new URL(href, base).href;
            if (new URL(href).hostname !== base.hostname || seen.has(href)) continue;
        } catch { continue; }
        seen.add(href);
        const headM = block.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
        const title = decodeHtml(headM?.[1] || linkM[2]).slice(0, 200);
        if (!title || title.length < 8) continue;
        const timeM = block.match(/<time[^>]+datetime=["']([^"']+)["']/i);
        let pubDate = '';
        if (timeM) { try { pubDate = new Date(timeM[1]).toUTCString(); } catch {} }
        items.push({ title, url: href, description: '', pubDate });
    }

    // Strategy 2: Heading-wrapped links
    if (items.length < 5) {
        const headingRe = /<h[123][^>]*>\s*(<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>)\s*<\/h[123]>/gi;
        let hm;
        while ((hm = headingRe.exec(html)) !== null && items.length < limit) {
            let href = hm[2].trim();
            const rawTitle = decodeHtml(hm[3]);
            if (!rawTitle || rawTitle.length < 8) continue;
            try {
                href = new URL(href, base).href;
                if (new URL(href).hostname !== base.hostname) continue;
            } catch { continue; }
            if (seen.has(href)) continue;
            seen.add(href);
            const surroundStart = Math.max(0, hm.index - 200);
            const surroundEnd = Math.min(html.length, hm.index + hm[0].length + 400);
            const surround = html.slice(surroundStart, surroundEnd);
            const dateM = surround.match(/\b(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/i);
            let pubDate = '';
            if (dateM) {
                const raw = dateM[1];
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
                    const [mm, dd, yyyy] = raw.split('/');
                    try { pubDate = new Date(`${yyyy}-${mm}-${dd}`).toUTCString(); } catch {}
                } else {
                    try { pubDate = new Date(raw).toUTCString(); } catch {}
                }
                if (pubDate === 'Invalid Date') pubDate = '';
            }
            items.push({ title: rawTitle.slice(0, 200), url: href, description: '', pubDate });
        }
    }

    // Strategy 3: Scored link extraction
    if (items.length < 5) {
        const linkRe = /<a\s[^>]*href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let lm;
        const candidates = [];
        while ((lm = linkRe.exec(html)) !== null && candidates.length < 400) {
            let href = lm[1].trim();
            const text = decodeHtml(lm[2]);
            if (!text || text.length < 15 || text.length > 280) continue;
            try {
                const abs = new URL(href, base).href;
                if (new URL(abs).hostname !== base.hostname || seen.has(abs)) continue;
                seen.add(abs);
                const isArticle = ARTICLE_URL_RE.test(abs);
                const wordCount = text.split(/\s+/).length;
                const score = (isArticle ? 3 : 0) + (wordCount > 5 ? 1 : 0);
                candidates.push({ title: text.slice(0, 200), url: abs, description: '', pubDate: '', score });
            } catch {}
        }
        candidates.sort((a, b) => b.score - a.score);
        items.push(...candidates.slice(0, limit - items.length).map(({ score, ...rest }) => rest));
    }
    return items.slice(0, limit);
}

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
    </item>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${esc(title)}]]></title>
    <link>${pageUrl}</link>
    <description><![CDATA[${esc(description || 'Generated by MergeRSS')}]]></description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>MergeRSS (mergerss.app)</generator>
${itemsXml}
  </channel>
</rss>`;
}

// Frequency → min age in hours before re-fetching
const FREQ_HOURS = { '5min': 0.08, '15min': 0.25, '1hour': 1, '6hours': 6, 'daily': 24 };

async function processOneFeed(feed, base44, now) {
    const targetUrl = feed.native_feed_url || feed.source_url;
    const res = await fetch(targetUrl, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xml,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    let newXml = null, newItems = null;

    if (isRss(text)) {
        newXml = text.slice(0, 200000);
    } else {
        const { title, description } = extractMeta(text, feed.source_url);
        const items = extractItems(text, feed.source_url, feed.item_limit || 25);
        if (items.length > 0) {
            newXml = buildRss(title, description, feed.source_url, items).slice(0, 200000);
            newItems = items.slice(0, 50);
        }
    }

    const MAX_CACHED_XML = 180000;
    if (newXml && newXml.length > MAX_CACHED_XML) {
        const truncated = newXml.slice(0, MAX_CACHED_XML);
        const lastItem = truncated.lastIndexOf('</item>');
        const lastEntry = truncated.lastIndexOf('</entry>');
        const cutoff = Math.max(lastItem, lastEntry);
        if (cutoff > 0) {
            const base_ = truncated.slice(0, cutoff + (lastItem > lastEntry ? 7 : 8));
            newXml = base_ + '\n  </channel>\n</rss>';
        } else {
            newXml = truncated;
        }
    }

    if (newXml) {
        await base44.asServiceRole.entities.GeneratedFeed.update(feed.id, {
            cached_xml: newXml,
            items_cache: newItems || feed.items_cache,
            last_fetched: now.toISOString(),
            last_success: now.toISOString(),
            error_count: 0,
            last_error: '',
            fetch_count: (feed.fetch_count || 0) + 1,
        });
        return { id: feed.id, status: 'refreshed' };
    } else {
        await base44.asServiceRole.entities.GeneratedFeed.update(feed.id, {
            last_fetched: now.toISOString(),
            error_count: (feed.error_count || 0) + 1,
            last_error: 'No extractable content',
        });
        return { id: feed.id, status: 'no_content' };
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const startTime = Date.now();
        const now = new Date();

        // Fetch all feeds but only process up to MAX_FEEDS_PER_RUN that are due
        const allFeeds = await base44.asServiceRole.entities.GeneratedFeed.list();

        // Filter to only feeds that need refreshing right now
        const dueFeeds = allFeeds.filter(feed => {
            if (feed.is_disabled) return false;
            const minAgeHours = FREQ_HOURS[feed.refresh_frequency] || 1;
            if (feed.last_fetched) {
                const hoursSince = (now - new Date(feed.last_fetched)) / 3600000;
                if (hoursSince < minAgeHours) return false;
            }
            // Backoff: 5+ errors → skip for 24h
            if ((feed.error_count || 0) >= 5) {
                if (feed.last_fetched && (now - new Date(feed.last_fetched)) < 86400000) return false;
            }
            if (isSsrf(feed.source_url)) return false;
            return true;
        });

        // Sort by oldest last_fetched first so stale feeds get priority
        dueFeeds.sort((a, b) => {
            const aTime = a.last_fetched ? new Date(a.last_fetched).getTime() : 0;
            const bTime = b.last_fetched ? new Date(b.last_fetched).getTime() : 0;
            return aTime - bTime;
        });

        // Cap at MAX_FEEDS_PER_RUN to stay within time budget
        const toProcess = dueFeeds.slice(0, MAX_FEEDS_PER_RUN);

        const results = [];
        const skipped = allFeeds.length - dueFeeds.length;

        // Process in concurrent batches of CONCURRENCY
        for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
            // Check wall-clock budget before each batch
            if (Date.now() - startTime > WALL_BUDGET_MS) {
                const remaining = toProcess.length - i;
                results.push({ status: 'budget_exceeded', remaining_skipped: remaining });
                break;
            }

            const batch = toProcess.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async (feed) => {
                    try {
                        return await processOneFeed(feed, base44, now);
                    } catch (err) {
                        await base44.asServiceRole.entities.GeneratedFeed.update(feed.id, {
                            last_fetched: now.toISOString(),
                            error_count: (feed.error_count || 0) + 1,
                            last_error: err.message?.slice(0, 200) || 'Fetch failed',
                        });
                        return { id: feed.id, status: 'error', error: err.message };
                    }
                })
            );
            results.push(...batchResults);
        }

        const elapsed = Date.now() - startTime;
        return Response.json({
            success: true,
            total: allFeeds.length,
            skipped_not_due: skipped,
            processed: toProcess.length,
            elapsed_ms: elapsed,
            results,
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});