import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Decode common HTML entities from feed text so titles and snippets display correctly */
function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&ndash;/g, '–')
        .replace(/&mdash;/g, '—')
        .replace(/&lsquo;/g, '\u2018')
        .replace(/&rsquo;/g, '\u2019')
        .replace(/&ldquo;/g, '\u201C')
        .replace(/&rdquo;/g, '\u201D')
        .replace(/&hellip;/g, '…')
        .replace(/&copy;/g, '©')
        .replace(/&reg;/g, '®')
        .replace(/&trade;/g, '™')
        .replace(/&bull;/g, '•')
        .replace(/&amp;/g, '&');
}

async function parseFeed(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
    });

    if (response.status === 429) throw new Error('Rate limit exceeded — try again later');
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';
    const xml = await response.text();

    // Detect HTML responses (redirects to login pages, error pages, etc.)
    if (
        contentType.includes('text/html') &&
        !contentType.includes('xml') &&
        xml.trimStart().toLowerCase().startsWith('<!doctype html')
    ) {
        throw new Error('Feed returned HTML instead of XML — URL may have changed or requires auth');
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
        allowBooleanAttributes: true,
    });

    const parsed = parser.parse(xml);

    // RSS 2.0
    if (parsed.rss?.channel) {
        const channel = parsed.rss.channel;
        const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
        return items.map(item => ({
            title: decodeHtml(item.title) || 'Untitled',
            url: item.link || (typeof item.guid === 'string' ? item.guid : item.guid?.['#text']) || '',
            description: decodeHtml(item.description) || '',
            content: decodeHtml(item['content:encoded'] || item.description) || '',
            author: decodeHtml(item.author || item['dc:creator']) || '',
            published_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            guid: typeof item.guid === 'string' ? item.guid : (item.guid?.['#text'] || item.link || ''),
        }));
    }

    // Atom 1.0
    if (parsed.feed) {
        const entries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : (parsed.feed.entry ? [parsed.feed.entry] : []);
        return entries.map(entry => {
            const links = Array.isArray(entry.link) ? entry.link : (entry.link ? [entry.link] : []);
            const link = links.find(l => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href'] || links[0]?.['@_href'] || '';
            return {
                title: decodeHtml(typeof entry.title === 'string' ? entry.title : (entry.title?.['#text'] || 'Untitled')),
                url: link,
                description: decodeHtml(typeof entry.summary === 'string' ? entry.summary : (entry.summary?.['#text'] || '')),
                content: decodeHtml(typeof entry.content === 'string' ? entry.content : (entry.content?.['#text'] || '')),
                author: decodeHtml(entry.author?.name || ''),
                published_date: entry.updated || entry.published ? new Date(entry.updated || entry.published).toISOString() : new Date().toISOString(),
                guid: entry.id || link,
            };
        });
    }

    // RDF/RSS 1.0
    if (parsed['rdf:RDF'] || parsed.RDF) {
        const rdf = parsed['rdf:RDF'] || parsed.RDF;
        const items = Array.isArray(rdf.item) ? rdf.item : (rdf.item ? [rdf.item] : []);
        return items.map(item => ({
            title: typeof item.title === 'string' ? item.title : (item.title?.['#text'] || 'Untitled'),
            url: typeof item.link === 'string' ? item.link : (item.link?.['#text'] || ''),
            description: typeof item.description === 'string' ? item.description : (item.description?.['#text'] || ''),
            content: typeof item['content:encoded'] === 'string' ? item['content:encoded'] : '',
            author: item['dc:creator'] || '',
            published_date: item['dc:date'] ? new Date(item['dc:date']).toISOString() : new Date().toISOString(),
            guid: item['@_rdf:about'] || typeof item.link === 'string' ? item.link : '',
        }));
    }

    // Dump first 200 chars of response for debugging
    throw new Error(`Unrecognized feed format — starts with: ${xml.substring(0, 120).replace(/\s+/g, ' ').trim()}`);
}

const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
};

function isRssFeed(text) {
    const t = text.trimStart();
    return (
        (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF')) &&
        (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'))
    );
}

function discoverFeedUrls(html, pageUrl) {
    const base = new URL(pageUrl);
    const fromTags = [];
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
    const probes = ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml', '/blog/feed', '/news/feed', '/feed/rss2', '/?feed=rss2']
        .map(p => { try { return new URL(p, base).href; } catch { return null; } })
        .filter(Boolean);
    return [...new Set([...fromTags, ...probes])];
}

/**
 * Attempts to find a working RSS/Atom URL for a feed that is erroring.
 * Returns the discovered URL string, or null if nothing found.
 */
async function recoverFeedUrl(originalUrl) {
    const candidates = discoverFeedUrls('', originalUrl); // probe common paths first

    // Also try fetching the page itself to discover <link rel="alternate"> tags
    try {
        const res = await fetch(originalUrl, {
            headers: FETCH_HEADERS,
            redirect: 'follow',
            signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
            const html = await res.text();
            if (isRssFeed(html)) return originalUrl; // it IS a feed, just was temporarily down
            const discovered = discoverFeedUrls(html, originalUrl);
            candidates.unshift(...discovered); // prioritise discovered over probes
        }
    } catch {}

    const deduped = [...new Set(candidates)];
    for (const candidate of deduped.slice(0, 12)) {
        if (candidate === originalUrl) continue;
        try {
            const res = await fetch(candidate, {
                headers: FETCH_HEADERS,
                redirect: 'follow',
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;
            const text = await res.text();
            if (isRssFeed(text)) return candidate;
        } catch {}
    }
    return null;
}

async function fetchFeedsWithThrottling(feeds, base44, batchSize = 10, delayBetweenBatches = 200) {
    const results = [];
    
    for (let i = 0; i < feeds.length; i += batchSize) {
        const batch = feeds.slice(i, i + batchSize);
        
        // Fetch all feeds in batch in parallel
        const batchResults = await Promise.allSettled(
            batch.map(feed => 
                parseFeed(feed.url)
                    .then(items => ({ feed, items, error: null }))
                    .catch(err => ({ feed, items: [], error: err.message }))
            )
        );

        // Process results per feed — dedup read happens immediately before insert
        // to minimize the race window (Priority 3 fix)
        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            const feed = batch[j];
            
            if (result.status === 'rejected' || result.value.error) {
                const error = result.status === 'rejected' ? result.reason.message : result.value.error;
                const isRateLimit = error.includes('429') || error.toLowerCase().includes('rate limit');

                if (isRateLimit) {
                    results.push({ feed: feed.name, error, status: 'rate_limited' });
                    continue;
                }

                const consecutiveErrors = (feed.consecutive_errors || 0) + 1;
                const shouldPause = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;

                const isRecoverable = error.includes('HTML') || error.includes('404') || error.includes('Unrecognized feed');
                if (isRecoverable && consecutiveErrors >= 2) {
                    (async () => {
                        try {
                            const newUrl = await recoverFeedUrl(feed.url);
                            if (newUrl) {
                                await base44.asServiceRole.entities.Feed.update(feed.id, {
                                    url: newUrl, status: 'active', fetch_error: '', consecutive_errors: 0,
                                });
                                console.log(`[fetchFeeds] Recovered ${feed.name} → ${newUrl}`);
                            } else if (shouldPause) {
                                await base44.asServiceRole.entities.Feed.update(feed.id, {
                                    status: 'paused', fetch_error: error, consecutive_errors: consecutiveErrors,
                                });
                            }
                        } catch {}
                    })();
                } else {
                    base44.asServiceRole.entities.Feed.update(feed.id, {
                        status: shouldPause ? 'paused' : 'error',
                        fetch_error: error,
                        consecutive_errors: consecutiveErrors,
                    }).catch(() => {});
                }

                results.push(shouldPause
                    ? { feed: feed.name, error, status: 'paused', note: `Auto-paused after ${consecutiveErrors} consecutive failures` }
                    : { feed: feed.name, error, status: isRecoverable && consecutiveErrors >= 2 ? 'recovering' : 'error', consecutive_errors: consecutiveErrors }
                );
                continue;
            }

            const items = result.value.items;

            // ── Narrowed race window: re-fetch existing guids immediately before insert ──
            // This moves the dedup read as close to the bulkCreate as possible,
            // reducing the race window from O(entire_batch_parse_time) to ~10ms.
            let existingGuids = new Set();
            let existingUrls = new Set();
            try {
                const existing = await base44.asServiceRole.entities.FeedItem.filter(
                    { feed_id: feed.id }, '-created_date', 300
                );
                existingGuids = new Set((existing || []).map(i => i.guid).filter(Boolean));
                existingUrls  = new Set((existing || []).map(i => i.url).filter(Boolean));
            } catch {}

            const itemsToCreate = [];
            for (const item of items.slice(0, 50)) {
                if (!item.guid && !item.url) continue;
                if (existingGuids.has(item.guid) || existingUrls.has(item.url)) continue;
                itemsToCreate.push({
                    feed_id: feed.id,
                    title: String(item.title || '').slice(0, 500),
                    url: String(item.url || ''),
                    description: String(item.description || '').slice(0, 2000),
                    content: String(item.content || '').slice(0, 5000),
                    author: String(item.author || '').slice(0, 200),
                    published_date: item.published_date,
                    guid: String(item.guid || item.url || ''),
                    category: feed.category,
                    tags: feed.tags || [],
                    is_read: false,
                });
            }

            const newCount = itemsToCreate.length;

            if (newCount > 0) {
                const created = await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
                // Send alerts — fire in parallel, capped to 10
                try {
                    const allAlerts = await base44.asServiceRole.entities.FeedAlert.filter({ is_active: true });
                    const alertFeedIds = new Set(allAlerts.map(a => a.feed_id));
                    const itemsNeedingAlerts = (Array.isArray(created) ? created : itemsToCreate)
                        .filter(i => alertFeedIds.has(i.feed_id) && i.id)
                        .slice(0, 10);
                    await Promise.allSettled(
                        itemsNeedingAlerts.map(item =>
                            base44.asServiceRole.functions.invoke('sendFeedAlerts', { feed_item_id: item.id })
                        )
                    );
                } catch (alertErr) {
                    console.warn('[fetchFeeds] Alert sending failed (non-fatal):', alertErr.message);
                }
            }

            // Don't compute item_count from capped list — just increment by newCount
            base44.asServiceRole.entities.Feed.update(feed.id, {
                last_fetched: new Date().toISOString(),
                item_count: (feed.item_count || 0) + newCount,
                status: 'active',
                fetch_error: '',
                consecutive_errors: 0,
            }).catch(() => {});

            results.push({ feed: feed.name, new_items: newCount, status: 'ok' });
        } // end per-feed for loop

        // Delay between batches to avoid rate limiting
        if (i + batchSize < feeds.length) {
            await sleep(delayBetweenBatches);
        }
    } // end batch for loop
    
    return results;
}

const MAX_CONSECUTIVE_ERRORS = 5;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const startedAt = new Date().toISOString();

        // ── Overlap prevention lock with zombie TTL ──────────────────────────────
        const LOCK_WINDOW_MS = 8 * 60 * 1000;
        const ZOMBIE_TTL_MS  = 15 * 60 * 1000;

        let recentRuns = [];
        try {
            recentRuns = await base44.asServiceRole.entities.SystemHealth.filter(
                { job_type: 'feed_fetch', status: 'running' }, '-started_at', 5
            ) || [];
        } catch (lockErr) {
            console.warn('[fetchFeeds] Could not query lock (non-fatal):', lockErr.message);
        }
        for (const stale of (recentRuns || [])) {
            const age = Date.now() - new Date(stale.started_at).getTime();
            if (age >= ZOMBIE_TTL_MS) {
                console.warn(`[fetchFeeds] Expiring zombie lock ${stale.id} — started ${Math.round(age/60000)}min ago`);
                await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    error_message: `Zombie lock expired after ${Math.round(age/60000)}min`,
                }).catch(() => {});
            }
        }
        const overlapping = (recentRuns || []).find(r => {
            const age = Date.now() - new Date(r.started_at).getTime();
            return age < LOCK_WINDOW_MS && age < ZOMBIE_TTL_MS;
        });
        if (overlapping) {
            console.warn(`[fetchFeeds] Skipping — another run is already in progress (started ${overlapping.started_at})`);
            return Response.json({
                skipped: true,
                reason: 'Another fetchFeeds run is already in progress',
                running_since: overlapping.started_at,
            });
        }

        // Write running lock
        let lockRecord = null;
        try {
            lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
                job_type: 'feed_fetch',
                status: 'running',
                started_at: startedAt,
            });
            console.log('[fetchFeeds] Lock created:', lockRecord?.id);
        } catch (createErr) {
            console.warn('[fetchFeeds] Could not create lock (non-fatal):', createErr.message);
        }

        const runStartMs = Date.now();
        const RUN_INTERVAL_MINUTES = 10; // matches automation schedule

        // Load feeds sorted by oldest last_fetched first so every feed gets rotated through
        console.log('[fetchFeeds] Loading feeds...');
        let allFeedsRaw;
        try {
            allFeedsRaw = await base44.asServiceRole.entities.Feed.filter(
                { status: { $in: ['active', 'error'] } },
                'last_fetched',
                2000
            );
            console.log('[fetchFeeds] Loaded', allFeedsRaw?.length, 'feeds');
        } catch (feedErr) {
            console.error('[fetchFeeds] Failed to load feeds:', feedErr.message);
            throw feedErr;
        }
        const allFeeds = Array.isArray(allFeedsRaw) ? allFeedsRaw : [];

        // ── P0 Telemetry: compute fetch-lag distribution across ALL feeds ────────
        const feedAgesMs = allFeeds.map(f =>
            f.last_fetched ? Date.now() - new Date(f.last_fetched).getTime() : Infinity
        );
        const finiteAges = feedAgesMs.filter(isFinite).sort((a, b) => a - b);
        const p50lag  = finiteAges.length ? Math.round(finiteAges[Math.floor(0.50 * finiteAges.length)] / 60000) : 0;
        const p95lag  = finiteAges.length ? Math.round(finiteAges[Math.floor(0.95 * finiteAges.length)] / 60000) : 0;
        const p99lag  = finiteAges.length ? Math.round(finiteAges[Math.floor(0.99 * finiteAges.length)] / 60000) : 0;
        const maxLagMin = finiteAges.length ? Math.round(finiteAges[finiteAges.length - 1] / 60000) : 0;
        const overdueThreshMs = RUN_INTERVAL_MINUTES * 60 * 1000;
        const overdueCount = feedAgesMs.filter(a => a > overdueThreshMs).length;

        console.log(`[fetchFeeds] lag p50=${p50lag}min p95=${p95lag}min p99=${p99lag}min max=${maxLagMin}min overdue=${overdueCount}/${allFeeds.length}`);

        if (maxLagMin > 30) {
            const staleFeeds = allFeeds.filter(f => f.last_fetched && (Date.now() - new Date(f.last_fetched).getTime()) > 30 * 60 * 1000);
            console.warn(`[fetchFeeds] STARVATION_ALERT: ${staleFeeds.length} feed(s) unfetched >30min. Max lag: ${maxLagMin}min`);
        }

        // ── Phase 1: Overdue filter — skip feeds fetched within the last interval ─
        // This prevents recently-refreshed feeds from consuming cap slots,
        // freeing capacity for feeds that are actually due.
        const overdueFeeds = allFeeds.filter(f =>
            !f.last_fetched || (Date.now() - new Date(f.last_fetched).getTime()) > overdueThreshMs
        );
        const feeds = overdueFeeds.slice(0, 150);
        const skippedCount = allFeeds.length - feeds.length;

        if (skippedCount > 0) {
            console.warn(`[fetchFeeds] ${allFeeds.length} total — ${overdueFeeds.length} overdue — processing ${feeds.length} — skipping ${skippedCount} (recently fetched or beyond cap)`);
        }
        console.log(`[fetchFeeds] Starting — processing ${feeds.length} of ${allFeeds.length} feeds this run`);
        const results = await fetchFeedsWithThrottling(feeds, base44, 10, 200);

        const runDurationMs = Date.now() - runStartMs;

        // Summarize results — don't store full array to avoid payload size limits
        const resultSummary = {
            ok: results.filter(r => r.status === 'ok').length,
            error: results.filter(r => r.status === 'error').length,
            paused: results.filter(r => r.status === 'paused').length,
            recovering: results.filter(r => r.status === 'recovering').length,
            rate_limited: results.filter(r => r.status === 'rate_limited').length,
            new_items_total: results.reduce((s, r) => s + (r.new_items || 0), 0),
        };

        // Update lock record to completed
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            metadata: {
                total_feeds: allFeeds.length,
                overdue_feeds: overdueFeeds.length,
                feeds_processed: feeds.length,
                feeds_skipped: skippedCount,
                p50_lag_min: p50lag,
                p95_lag_min: p95lag,
                p99_lag_min: p99lag,
                max_lag_min: maxLagMin,
                overdue_count: overdueCount,
                run_duration_ms: runDurationMs,
                ...resultSummary,
            },
        });

        return Response.json({ success: true, total_feeds: allFeeds.length, overdue_feeds: overdueFeeds.length, feeds_processed: feeds.length, feeds_skipped: skippedCount, p50_lag_min: p50lag, p95_lag_min: p95lag, p99_lag_min: p99lag, max_lag_min: maxLagMin, run_duration_ms: runDurationMs, ...resultSummary });
    } catch (error) {
        // Best-effort: mark lock as failed so next run isn't blocked
        try {
            const base44Cleanup = createClientFromRequest(req);
            const stuckRuns = await base44Cleanup.asServiceRole.entities.SystemHealth.filter(
                { job_type: 'feed_fetch', status: 'running' }, '-started_at', 1
            );
            if (stuckRuns?.[0]?.id) {
                await base44Cleanup.asServiceRole.entities.SystemHealth.update(stuckRuns[0].id, {
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    error_message: error.message,
                });
            }
        } catch {}
        return Response.json({ error: error.message }, { status: 500 });
    }
});