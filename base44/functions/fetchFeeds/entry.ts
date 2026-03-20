import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CONSECUTIVE_ERRORS = 5;      // failures before auto-pause
const COOLDOWN_HOURS = 2;              // hours before paused feed is retried
const FEED_FETCH_CONCURRENCY = 5;      // parallel HTTP fetches (not DB writes)
const WRITE_DELAY_MS = 150;            // delay between sequential DB writes
const BATCH_DELAY_MS = 300;            // delay between processing batches
const RUN_INTERVAL_MINUTES = 10;
const LOCK_WINDOW_MS = 8 * 60 * 1000;
const ZOMBIE_TTL_MS  = 15 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // update lock every 60s to prove liveness

// Generate a short run instance ID for lock ownership tracking
function makeRunId() {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
        .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
        .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
        .replace(/&hellip;/g, '…').replace(/&copy;/g, '©').replace(/&reg;/g, '®')
        .replace(/&trade;/g, '™').replace(/&bull;/g, '•').replace(/&amp;/g, '&');
}

// ─── Feed Parsing ─────────────────────────────────────────────────────────────
async function parseFeed(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
    });

    if (response.status === 429) throw new Error('HTTP_429: Source rate-limited us');
    if (!response.ok) throw new Error(`HTTP_${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';
    const xml = await response.text();

    if (
        contentType.includes('text/html') &&
        !contentType.includes('xml') &&
        xml.trimStart().toLowerCase().startsWith('<!doctype html')
    ) {
        throw new Error('FEED_HTML: Feed returned HTML — URL may have changed or requires auth');
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
        allowBooleanAttributes: true,
    });
    const parsed = parser.parse(xml);

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

    throw new Error(`FEED_UNKNOWN_FORMAT: ${xml.substring(0, 120).replace(/\s+/g, ' ').trim()}`);
}

// ─── URL Recovery ─────────────────────────────────────────────────────────────
const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
};

function isRssFeed(text) {
    const t = text.trimStart();
    return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF'))
        && (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'));
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

async function recoverFeedUrl(originalUrl) {
    const candidates = discoverFeedUrls('', originalUrl);
    try {
        const res = await fetch(originalUrl, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12000) });
        if (res.ok) {
            const html = await res.text();
            if (isRssFeed(html)) return originalUrl;
            candidates.unshift(...discoverFeedUrls(html, originalUrl));
        }
    } catch {}
    const deduped = [...new Set(candidates)];
    for (const candidate of deduped.slice(0, 12)) {
        if (candidate === originalUrl) continue;
        try {
            const res = await fetch(candidate, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const text = await res.text();
            if (isRssFeed(text)) return candidate;
        } catch {}
    }
    return null;
}

// ─── Concurrency helper ───────────────────────────────────────────────────────
// Run tasks with a max concurrency limit (for HTTP fetches only)
async function withConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]().catch(err => ({ __err: err.message }));
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

// ─── Per-feed isolated processor ─────────────────────────────────────────────
// This is the core isolation unit. Every feed is processed here.
// It NEVER throws — all errors are caught and returned as a result object.
async function processSingleFeed(feed, existingItems, alertsByFeedId, base44) {
    const now = new Date().toISOString();
    const consecutiveErrors = (feed.consecutive_errors || 0);

    // ── Step 1: Fetch & parse (isolated) ──────────────────────────────────────
    let items = [];
    let fetchError = null;
    try {
        items = await parseFeed(feed.url);
    } catch (err) {
        fetchError = err.message;
    }

    // ── Step 2: Handle fetch failure ──────────────────────────────────────────
    if (fetchError) {
        const newConsecutive = consecutiveErrors + 1;
        const isRateLimit = fetchError.includes('429') || fetchError.toLowerCase().includes('rate limit');
        const isRecoverable = fetchError.startsWith('FEED_HTML') || fetchError.includes('404') || fetchError.startsWith('FEED_UNKNOWN');
        const shouldPause = newConsecutive >= MAX_CONSECUTIVE_ERRORS;

        // Attempt URL recovery in background (fire-and-forget, doesn't block)
        if (isRecoverable && newConsecutive >= 2 && !shouldPause) {
            recoverFeedUrl(feed.url).then(async newUrl => {
                if (newUrl) {
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        url: newUrl, status: 'active', fetch_error: '', consecutive_errors: 0,
                        last_failure_reason: null, paused_by_system: false,
                    }).catch(() => {});
                    console.log(`[fetchFeeds] Auto-recovered ${feed.name} → ${newUrl}`);
                }
            }).catch(() => {});
        }

        const feedUpdate = {
            last_fetched: now,
            fetch_error: fetchError.slice(0, 500),
            consecutive_errors: newConsecutive,
            last_failure_at: now,
            last_failure_reason: fetchError.slice(0, 300),
        };

        if (shouldPause) {
            feedUpdate.status = 'paused';
            feedUpdate.paused_by_system = true;
            feedUpdate.paused_reason = `Auto-paused after ${newConsecutive} consecutive failures: ${fetchError.slice(0, 200)}`;
            feedUpdate.retry_after_at = new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString();
            console.warn(`[fetchFeeds] AUTO-PAUSED feed "${feed.name}" (${feed.id}) after ${newConsecutive} failures: ${fetchError}`);
        } else {
            feedUpdate.status = isRateLimit ? feed.status : 'error'; // don't escalate on rate-limit
        }

        // Write is isolated — failure here only loses this one feed update
        await base44.asServiceRole.entities.Feed.update(feed.id, feedUpdate).catch(dbErr => {
            console.warn(`[fetchFeeds] DB write failed for errored feed "${feed.name}": ${dbErr.message}`);
        });

        return {
            feed_id: feed.id,
            feed: feed.name,
            status: shouldPause ? 'auto_paused' : (isRateLimit ? 'rate_limited' : 'error'),
            error: fetchError,
            consecutive_errors: newConsecutive,
        };
    }

    // ── Step 3: Deduplicate ───────────────────────────────────────────────────
    const existingGuids = new Set((existingItems || []).map(i => i.guid).filter(Boolean));
    const existingUrls  = new Set((existingItems || []).map(i => i.url).filter(Boolean));

    const itemsToCreate = [];
    let duplicatesSkipped = 0;
    for (const item of items.slice(0, 50)) {
        if (!item.guid && !item.url) continue;
        if (existingGuids.has(item.guid) || existingUrls.has(item.url)) {
            duplicatesSkipped++;
            continue;
        }
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

    // ── Step 4: Write new items (isolated) ───────────────────────────────────
    let created = [];
    if (newCount > 0) {
        try {
            created = await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
        } catch (bulkErr) {
            console.warn(`[fetchFeeds] bulkCreate failed for "${feed.name}" (non-fatal): ${bulkErr.message}`);
            // Items lost this run but feed itself not broken — continue
        }
    }

    // ── Step 5: Fire-and-forget enrichment ───────────────────────────────────
    const createdIds = (Array.isArray(created) ? created : []).filter(i => i?.id).map(i => i.id).slice(0, 20);
    if (createdIds.length > 0) {
        base44.asServiceRole.functions.invoke('enrichFeedItems', { item_ids: createdIds }, {
            headers: { 'x-internal-secret': Deno.env.get('INTERNAL_SECRET') || '' }
        }).catch(e => console.warn(`[fetchFeeds] enrichFeedItems fire-and-forget failed for "${feed.name}": ${e.message}`));
    }

    // ── Step 6: Fire-and-forget alerts ───────────────────────────────────────
    const feedAlerts = alertsByFeedId[feed.id];
    if (feedAlerts?.length && created.length > 0) {
        const alertItems = (Array.isArray(created) ? created : itemsToCreate).filter(i => i?.id).slice(0, 10);
        Promise.allSettled(
            alertItems.flatMap(newItem =>
                feedAlerts.map(async alert => {
                    const title = newItem.title || 'New article';
                    const url = newItem.url || '';
                    const description = (newItem.description || '').slice(0, 200);
                    const category = newItem.category || '';
                    try {
                        let delivered = false;
                        if (alert.channel_type === 'slack') {
                            const text = `*${title}*${category ? ` [${category}]` : ''}\n${description ? description + '\n' : ''}<${url}|Read more>`;
                            const res = await fetch(alert.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mrkdwn: true }), signal: AbortSignal.timeout(8000) });
                            delivered = res.ok;
                        } else if (alert.channel_type === 'discord') {
                            const content = `**${title}**${category ? ` \`${category}\`` : ''}\n${description ? description + '\n' : ''}${url}`;
                            const res = await fetch(alert.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 2000) }), signal: AbortSignal.timeout(8000) });
                            delivered = res.ok || res.status === 204;
                        }
                        if (delivered) base44.asServiceRole.entities.FeedAlert.update(alert.id, { last_sent: now }).catch(() => {});
                    } catch {}
                })
            )
        ).catch(() => {});
    }

    // ── Step 7: Update feed record (isolated) ─────────────────────────────────
    await base44.asServiceRole.entities.Feed.update(feed.id, {
        last_fetched: now,
        last_successful_fetch_at: now,
        item_count: (feed.item_count || 0) + newCount,
        status: 'active',
        fetch_error: '',
        consecutive_errors: 0,
        last_failure_reason: null,
        paused_by_system: false,
        paused_reason: null,
        retry_after_at: null,
    }).catch(dbErr => {
        console.warn(`[fetchFeeds] Feed status update failed for "${feed.name}": ${dbErr.message}`);
        // Non-fatal — articles were still written
    });

    return {
        feed_id: feed.id,
        feed: feed.name,
        status: 'ok',
        new_items: newCount,
        duplicates_skipped: duplicatesSkipped,
    };
}

// ─── Main batch runner ────────────────────────────────────────────────────────
// Processes feeds in small batches:
// - HTTP fetches run with FEED_FETCH_CONCURRENCY concurrency
// - DB writes are sequential with WRITE_DELAY_MS between them
// - Each feed is fully isolated — one failure cannot affect others
async function runFeedBatches(feeds, alertsByFeedId, base44) {
    const summary = { ok: 0, error: 0, auto_paused: 0, rate_limited: 0, new_items: 0, duplicates: 0, db_write_errors: 0 };
    const BATCH_SIZE = 10;

    for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
        const batch = feeds.slice(i, i + BATCH_SIZE);

        // ── Phase A: Fetch all feeds in this batch concurrently ────────────────
        // HTTP fetches are cheap on the DB; run them in parallel with a concurrency cap
        const fetchTasks = batch.map(feed => async () => {
            try {
                const items = await parseFeed(feed.url);
                return { feed, items, fetchError: null };
            } catch (err) {
                return { feed, items: [], fetchError: err.message };
            }
        });
        const fetchResults = await withConcurrency(fetchTasks, FEED_FETCH_CONCURRENCY);

        // ── Phase B: Fetch existing items for dedup (batched DB read) ──────────
        const dedupResults = await Promise.allSettled(
            batch.map(feed =>
                base44.asServiceRole.entities.FeedItem.filter({ feed_id: feed.id }, '-created_date', 100)
                    .then(existing => ({ feed_id: feed.id, existing: existing || [] }))
                    .catch(() => ({ feed_id: feed.id, existing: [] }))
            )
        );
        const dedupMap = {};
        for (const r of dedupResults) {
            if (r.status === 'fulfilled') dedupMap[r.value.feed_id] = r.value.existing;
        }

        // ── Phase C: Write results SEQUENTIALLY to avoid DB rate-limiting ──────
        for (let j = 0; j < fetchResults.length; j++) {
            const { feed, items, fetchError, __err } = fetchResults[j];
            const existingItems = dedupMap[feed.id] || [];

            // Guard: withConcurrency error wrapper
            const effectiveFetchError = __err || fetchError;

            // Inject pre-fetched items/error into a mock feed result for processSingleFeed
            // We override parseFeed by passing pre-fetched data directly
            let result;
            try {
                if (effectiveFetchError) {
                    // Simulate the failure path of processSingleFeed
                    const now = new Date().toISOString();
                    const newConsecutive = (feed.consecutive_errors || 0) + 1;
                    const isRateLimit = effectiveFetchError.includes('429') || effectiveFetchError.toLowerCase().includes('rate limit');
                    const isRecoverable = effectiveFetchError.startsWith('FEED_HTML') || effectiveFetchError.includes('404') || effectiveFetchError.startsWith('FEED_UNKNOWN');
                    const shouldPause = newConsecutive >= MAX_CONSECUTIVE_ERRORS;

                    if (isRecoverable && newConsecutive >= 2 && !shouldPause) {
                        recoverFeedUrl(feed.url).then(async newUrl => {
                            if (newUrl) {
                                await base44.asServiceRole.entities.Feed.update(feed.id, {
                                    url: newUrl, status: 'active', fetch_error: '', consecutive_errors: 0,
                                    paused_by_system: false,
                                }).catch(() => {});
                                console.log(`[fetchFeeds] Auto-recovered "${feed.name}" → ${newUrl}`);
                            }
                        }).catch(() => {});
                    }

                    const feedUpdate = {
                        last_fetched: now,
                        fetch_error: effectiveFetchError.slice(0, 500),
                        consecutive_errors: newConsecutive,
                        last_failure_at: now,
                        last_failure_reason: effectiveFetchError.slice(0, 300),
                    };
                    if (shouldPause) {
                        feedUpdate.status = 'paused';
                        feedUpdate.paused_by_system = true;
                        feedUpdate.paused_reason = `Auto-paused after ${newConsecutive} failures: ${effectiveFetchError.slice(0, 200)}`;
                        feedUpdate.retry_after_at = new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString();
                        console.warn(`[fetchFeeds] AUTO-PAUSED "${feed.name}" after ${newConsecutive} failures`);
                        summary.auto_paused++;
                    } else {
                        feedUpdate.status = isRateLimit ? feed.status : 'error';
                        if (isRateLimit) summary.rate_limited++; else summary.error++;
                    }

                    await base44.asServiceRole.entities.Feed.update(feed.id, feedUpdate).catch(dbErr => {
                        console.warn(`[fetchFeeds] DB write failed for errored feed "${feed.name}": ${dbErr.message}`);
                        summary.db_write_errors++;
                    });

                    result = {
                        feed_id: feed.id, feed: feed.name,
                        status: shouldPause ? 'auto_paused' : (isRateLimit ? 'rate_limited' : 'error'),
                        error: effectiveFetchError,
                    };
                } else {
                    // ── Success path: dedup + write ──────────────────────────────
                    const existingGuids = new Set(existingItems.map(i => i.guid).filter(Boolean));
                    const existingUrls  = new Set(existingItems.map(i => i.url).filter(Boolean));
                    const itemsToCreate = [];
                    let duplicatesSkipped = 0;

                    for (const item of items.slice(0, 50)) {
                        if (!item.guid && !item.url) continue;
                        if (existingGuids.has(item.guid) || existingUrls.has(item.url)) { duplicatesSkipped++; continue; }
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
                    let created = [];

                    if (newCount > 0) {
                        try {
                            created = await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
                        } catch (bulkErr) {
                            console.warn(`[fetchFeeds] bulkCreate failed for "${feed.name}": ${bulkErr.message}`);
                            summary.db_write_errors++;
                        }
                    }

                    // Enrichment fire-and-forget
                    const createdIds = (Array.isArray(created) ? created : []).filter(i => i?.id).map(i => i.id).slice(0, 20);
                    if (createdIds.length > 0) {
                        base44.asServiceRole.functions.invoke('enrichFeedItems', { item_ids: createdIds }, {
                            headers: { 'x-internal-secret': Deno.env.get('INTERNAL_SECRET') || '' }
                        }).catch(() => {});
                    }

                    // Alerts fire-and-forget
                    const feedAlerts = alertsByFeedId[feed.id];
                    if (feedAlerts?.length && created.length > 0) {
                        dispatchAlerts(created, feedAlerts, feed, base44).catch(() => {});
                    }

                    // Update feed status
                    const now = new Date().toISOString();
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        last_fetched: now,
                        last_successful_fetch_at: now,
                        item_count: (feed.item_count || 0) + newCount,
                        status: 'active',
                        fetch_error: '',
                        consecutive_errors: 0,
                        last_failure_reason: null,
                        paused_by_system: false,
                        paused_reason: null,
                        retry_after_at: null,
                    }).catch(dbErr => {
                        console.warn(`[fetchFeeds] Feed status update failed for "${feed.name}": ${dbErr.message}`);
                        summary.db_write_errors++;
                    });

                    summary.ok++;
                    summary.new_items += newCount;
                    summary.duplicates += duplicatesSkipped;

                    result = { feed_id: feed.id, feed: feed.name, status: 'ok', new_items: newCount, duplicates_skipped: duplicatesSkipped };
                }
            } catch (unexpectedErr) {
                // Absolute last-resort catch — should never reach here
                console.error(`[fetchFeeds] UNEXPECTED per-feed error for "${feed.name}": ${unexpectedErr.message}`);
                summary.error++;
                result = { feed_id: feed.id, feed: feed.name, status: 'error', error: `unexpected: ${unexpectedErr.message}` };
            }

            console.log(`[fetchFeeds] ${result.status.toUpperCase()} "${result.feed}" ${result.new_items ? `+${result.new_items} items` : result.error ? `— ${result.error.slice(0, 80)}` : ''}`);

            // Controlled delay between sequential DB writes to avoid rate-limiting
            if (j < fetchResults.length - 1) await sleep(WRITE_DELAY_MS);
        }

        if (i + BATCH_SIZE < feeds.length) await sleep(BATCH_DELAY_MS);
    }

    return summary;
}

async function dispatchAlerts(created, feedAlerts, feed, base44) {
    const alertItems = created.filter(i => i?.id).slice(0, 10);
    return Promise.allSettled(
        alertItems.flatMap(newItem =>
            feedAlerts.map(async alert => {
                const title = newItem.title || 'New article';
                const url = newItem.url || '';
                const description = (newItem.description || '').slice(0, 200);
                const category = newItem.category || '';
                try {
                    let delivered = false;
                    if (alert.channel_type === 'slack') {
                        const text = `*${title}*${category ? ` [${category}]` : ''}\n${description ? description + '\n' : ''}<${url}|Read more>`;
                        const res = await fetch(alert.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mrkdwn: true }), signal: AbortSignal.timeout(8000) });
                        delivered = res.ok;
                    } else if (alert.channel_type === 'discord') {
                        const content = `**${title}**${category ? ` \`${category}\`` : ''}\n${description ? description + '\n' : ''}${url}`;
                        const res = await fetch(alert.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 2000) }), signal: AbortSignal.timeout(8000) });
                        delivered = res.ok || res.status === 204;
                    }
                    if (delivered) await base44.asServiceRole.entities.FeedAlert.update(alert.id, { last_sent: new Date().toISOString() }).catch(() => {});
                } catch {}
            })
        )
    );
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    // ── Boot: initialize SDK ───────────────────────────────────────────────────
    // Only a failure here can fail the whole job — everything else is isolated
    let base44;
    try {
        base44 = createClientFromRequest(req);
    } catch {
        try {
            const { createClient } = await import('npm:@base44/sdk@0.8.21');
            base44 = createClient();
        } catch (bootErr) {
            // True boot failure — cannot proceed
            return Response.json({ error: `SDK boot failed: ${bootErr.message}` }, { status: 500 });
        }
    }

    const startedAt = new Date().toISOString();
    const runStartMs = Date.now();

    // ── Overlap lock ───────────────────────────────────────────────────────────
    let recentRuns = [];
    try {
        recentRuns = await base44.asServiceRole.entities.SystemHealth.filter(
            { job_type: 'feed_fetch', status: 'running' }, '-started_at', 5
        ) || [];
    } catch (lockErr) {
        console.warn('[fetchFeeds] Could not query lock (non-fatal):', lockErr.message);
    }

    for (const stale of recentRuns) {
        const age = Date.now() - new Date(stale.started_at).getTime();
        if (age >= ZOMBIE_TTL_MS) {
            await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                status: 'failed', completed_at: new Date().toISOString(),
                error_message: `Zombie lock expired after ${Math.round(age/60000)}min`,
            }).catch(() => {});
        }
    }

    const overlapping = recentRuns.find(r => {
        const age = Date.now() - new Date(r.started_at).getTime();
        return age < LOCK_WINDOW_MS && age < ZOMBIE_TTL_MS;
    });
    if (overlapping) {
        return Response.json({ skipped: true, reason: 'Another run in progress', running_since: overlapping.started_at });
    }

    let lockRecord = null;
    try {
        lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'feed_fetch', status: 'running', started_at: startedAt,
        });
    } catch (e) {
        console.warn('[fetchFeeds] Could not create lock:', e.message);
    }

    // ── Load feeds ─────────────────────────────────────────────────────────────
    // Include paused_by_system feeds that are past their retry_after_at cooldown
    let allFeeds = [];
    try {
        const [activeFeeds, cooldownFeeds] = await Promise.all([
            base44.asServiceRole.entities.Feed.filter({ status: { $in: ['active', 'error'] } }, 'last_fetched', 2000),
            base44.asServiceRole.entities.Feed.filter({ status: 'paused', paused_by_system: true }, 'last_fetched', 200),
        ]);
        const now = Date.now();
        const retryableFeeds = (cooldownFeeds || []).filter(f =>
            !f.retry_after_at || new Date(f.retry_after_at).getTime() <= now
        );
        if (retryableFeeds.length > 0) {
            console.log(`[fetchFeeds] ${retryableFeeds.length} system-paused feeds are past cooldown — retrying`);
        }
        allFeeds = [...(activeFeeds || []), ...retryableFeeds];
    } catch (feedErr) {
        // If we can't load feeds at all, that's a system-level failure worth reporting
        console.error('[fetchFeeds] Failed to load feeds:', feedErr.message);
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord?.id, {
            status: 'failed', completed_at: new Date().toISOString(), error_message: feedErr.message,
        }).catch(() => {});
        // Return 500 — unable to load feeds is a true system failure, not a feed-level failure.
        // This is intentional: the scheduler SHOULD surface this as a job failure so the admin knows.
        return Response.json({ success: false, error: `Feed load failed: ${feedErr.message}`, feeds_processed: 0 }, { status: 500 });
    }

    // ── Telemetry ──────────────────────────────────────────────────────────────
    const feedAgesMs = allFeeds.map(f => f.last_fetched ? Date.now() - new Date(f.last_fetched).getTime() : Infinity);
    const finiteAges = feedAgesMs.filter(isFinite).sort((a, b) => a - b);
    const p50lag = finiteAges.length ? Math.round(finiteAges[Math.floor(0.50 * finiteAges.length)] / 60000) : 0;
    const p95lag = finiteAges.length ? Math.round(finiteAges[Math.floor(0.95 * finiteAges.length)] / 60000) : 0;
    const maxLagMin = finiteAges.length ? Math.round(finiteAges[finiteAges.length - 1] / 60000) : 0;
    const overdueThreshMs = RUN_INTERVAL_MINUTES * 60 * 1000;
    const overdueFeeds = allFeeds.filter(f => !f.last_fetched || (Date.now() - new Date(f.last_fetched).getTime()) > overdueThreshMs);
    const feeds = overdueFeeds.slice(0, 120);

    console.log(`[fetchFeeds] total=${allFeeds.length} overdue=${overdueFeeds.length} processing=${feeds.length} p50=${p50lag}min p95=${p95lag}min max=${maxLagMin}min`);

    // ── Load alerts once ───────────────────────────────────────────────────────
    let alertsByFeedId = {};
    try {
        const allAlerts = await base44.asServiceRole.entities.FeedAlert.filter({ is_active: true });
        for (const alert of (allAlerts || [])) {
            if (!alertsByFeedId[alert.feed_id]) alertsByFeedId[alert.feed_id] = [];
            alertsByFeedId[alert.feed_id].push(alert);
        }
    } catch (e) {
        console.warn('[fetchFeeds] Could not load alerts (non-fatal):', e.message);
    }

    // ── Run batches ────────────────────────────────────────────────────────────
    // This function absorbs ALL per-feed errors internally and NEVER throws
    const summary = await runFeedBatches(feeds, alertsByFeedId, base44).catch(batchErr => {
        // runFeedBatches itself should never throw, but if it does — log and continue
        console.error('[fetchFeeds] runFeedBatches threw unexpectedly:', batchErr.message);
        return { ok: 0, error: feeds.length, auto_paused: 0, rate_limited: 0, new_items: 0, duplicates: 0, db_write_errors: 1 };
    });

    const runDurationMs = Date.now() - runStartMs;

    const finalSummary = {
        feeds_attempted: feeds.length,
        feeds_ok: summary.ok,
        feeds_error: summary.error,
        feeds_auto_paused: summary.auto_paused,
        feeds_rate_limited: summary.rate_limited,
        new_items_total: summary.new_items,
        duplicates_skipped: summary.duplicates,
        db_write_errors: summary.db_write_errors,
        total_feeds_in_system: allFeeds.length,
        skipped_recently_fetched: allFeeds.length - feeds.length,
        p50_lag_min: p50lag,
        p95_lag_min: p95lag,
        max_lag_min: maxLagMin,
        run_duration_ms: runDurationMs,
    };

    console.log(`[fetchFeeds] DONE — ${JSON.stringify(finalSummary)}`);

    // Update lock to completed
    if (lockRecord?.id) {
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            metadata: finalSummary,
        }).catch(() => {});
    }

    // ── Always return 200 ──────────────────────────────────────────────────────
    // The scheduler should NEVER be disabled due to feed-level failures.
    // Only true boot errors (SDK init) return 500.
    return Response.json({ success: true, ...finalSummary });
});