import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

// ─── Infrastructure helpers ───────────────────────────────────────────────────
// NOTE: Base44 does not support shared imports between function files.
// These helpers are intentionally inlined here. Canonical versions are documented
// in functions/lib.js. Keep these in sync with that reference when editing.

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'object') return [];
    if (Array.isArray(raw.items))   return raw.items;
    if (Array.isArray(raw.data))    return raw.data;
    if (Array.isArray(raw.results)) return raw.results;
    const found = Object.values(raw).find(v => Array.isArray(v));
    return found || [];
}

async function requireAdminOrScheduler(base44) {
    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
        }
        return { user: user || null };
    } catch {
        return { user: null }; // scheduler context — allow
    }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function makeRunId() { return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CONSECUTIVE_ERRORS   = 5;
const COOLDOWN_HOURS           = 2;
const FEED_FETCH_CONCURRENCY   = 5;
const WRITE_DELAY_MS           = 150;
const BATCH_DELAY_MS           = 300;
const RUN_INTERVAL_MINUTES     = 10;
const LOCK_WINDOW_MS           = 8 * 60 * 1000;
const ZOMBIE_TTL_MS            = 15 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS    = 60 * 1000;

// ─── HTML entity decoder ──────────────────────────────────────────────────────
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

// ─── Canonical feed parser ────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for RSS/Atom/RDF parsing across the entire codebase.
// recoverFeeds calls this function via base44.functions.invoke('fetchFeeds') — do not degrade it.
// Supports: RSS 2.0, Atom, RDF/RSS 1.0
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

    // ── RSS 2.0 ──────────────────────────────────────────────────────────────
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

    // ── Atom ──────────────────────────────────────────────────────────────────
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

    // ── RDF / RSS 1.0 ─────────────────────────────────────────────────────────
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
            guid: item['@_rdf:about'] || (typeof item.link === 'string' ? item.link : ''),
        }));
    }

    throw new Error(`FEED_UNKNOWN_FORMAT: ${xml.substring(0, 120).replace(/\s+/g, ' ').trim()}`);
}

// ─── Canonical dedup helper ───────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for article deduplication logic.
// Used by both the main fetch path and the recovery path (via recoverFeeds calling this function).
// Multi-signal: guid, url, AND normalized title+date composite.
function buildDedupSets(existingItems) {
    const guids = new Set(existingItems.map(i => i.guid).filter(Boolean));
    const urls  = new Set(existingItems.map(i => i.url).filter(Boolean));
    const titleKeys = new Set(
        existingItems
            .filter(i => i.title && i.published_date)
            .map(i => `${i.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}|${i.published_date?.slice(0, 10)}`)
    );
    return { guids, urls, titleKeys };
}

function isDuplicate(item, dedupSets) {
    if (!item.guid && !item.url) return true;
    if (item.guid && dedupSets.guids.has(item.guid)) return true;
    if (item.url && dedupSets.urls.has(item.url)) return true;
    if (item.title && item.published_date) {
        const key = `${item.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}|${item.published_date.slice(0, 10)}`;
        if (dedupSets.titleKeys.has(key)) return true;
    }
    return false;
}

function buildFeedItemRecord(item, feed) {
    return {
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
        enrichment_status: 'pending',
    };
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

// ─── Per-feed write handlers ───────────────────────────────────────────────────
// These are the two canonical write paths: one for fetch failures, one for success.
// The batch runner calls these after pre-fetching all HTTP results concurrently.

async function handleFeedError(feed, fetchError, summary, base44) {
    const now = new Date().toISOString();
    const newConsecutive = (feed.consecutive_errors || 0) + 1;
    const isRateLimit = fetchError.includes('429') || fetchError.toLowerCase().includes('rate limit');
    const isRecoverable = fetchError.startsWith('FEED_HTML') || fetchError.includes('404') || fetchError.startsWith('FEED_UNKNOWN');
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
        fetch_error: fetchError.slice(0, 500),
        consecutive_errors: newConsecutive,
        last_failure_at: now,
        last_failure_reason: fetchError.slice(0, 300),
    };
    if (shouldPause) {
        feedUpdate.status = 'paused';
        feedUpdate.paused_by_system = true;
        feedUpdate.paused_reason = `Auto-paused after ${newConsecutive} failures: ${fetchError.slice(0, 200)}`;
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

    return {
        feed_id: feed.id, feed: feed.name,
        status: shouldPause ? 'auto_paused' : (isRateLimit ? 'rate_limited' : 'error'),
        error: fetchError,
    };
}

async function handleFeedSuccess(feed, items, existingItems, alertsByFeedId, summary, base44) {
    const now = new Date().toISOString();

    const dedupSets = buildDedupSets(existingItems);
    const itemsToCreate = [];
    let duplicatesSkipped = 0;

    for (const item of items.slice(0, 50)) {
        if (isDuplicate(item, dedupSets)) { duplicatesSkipped++; continue; }
        itemsToCreate.push(buildFeedItemRecord(item, feed));
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

    return { feed_id: feed.id, feed: feed.name, status: 'ok', new_items: newCount, duplicates_skipped: duplicatesSkipped };
}

// ─── Alert dispatcher ─────────────────────────────────────────────────────────
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

// ─── Main batch runner ────────────────────────────────────────────────────────
// Phase A: concurrent HTTP fetches (FEED_FETCH_CONCURRENCY parallel)
// Phase B: batched DB reads for dedup
// Phase C: sequential DB writes (WRITE_DELAY_MS between each) to avoid rate-limiting
async function runFeedBatches(feeds, alertsByFeedId, base44) {
    const summary = { ok: 0, error: 0, auto_paused: 0, rate_limited: 0, new_items: 0, duplicates: 0, db_write_errors: 0 };
    const BATCH_SIZE = 10;

    for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
        const batch = feeds.slice(i, i + BATCH_SIZE);

        // Phase A: fetch all feeds in batch concurrently
        const fetchTasks = batch.map(feed => async () => {
            try {
                const items = await parseFeed(feed.url);
                return { feed, items, fetchError: null };
            } catch (err) {
                return { feed, items: [], fetchError: err.message };
            }
        });
        const fetchResults = await withConcurrency(fetchTasks, FEED_FETCH_CONCURRENCY);

        // Phase B: fetch existing items for dedup (parallel DB reads)
        const dedupResults = await Promise.allSettled(
            batch.map(feed =>
                base44.asServiceRole.entities.FeedItem.filter({ feed_id: feed.id }, '-created_date', 300)
                    .then(existing => ({ feed_id: feed.id, existing: extractItems(existing) }))
                    .catch(() => ({ feed_id: feed.id, existing: [] }))
            )
        );
        const dedupMap = {};
        for (const r of dedupResults) {
            if (r.status === 'fulfilled') dedupMap[r.value.feed_id] = r.value.existing;
        }

        // Phase C: process results sequentially (controlled DB write rate)
        for (let j = 0; j < fetchResults.length; j++) {
            const { feed, items, fetchError, __err } = fetchResults[j];
            const existingItems = dedupMap[feed.id] || [];
            const effectiveFetchError = __err || fetchError;

            let result;
            try {
                if (effectiveFetchError) {
                    result = await handleFeedError(feed, effectiveFetchError, summary, base44);
                } else {
                    result = await handleFeedSuccess(feed, items, existingItems, alertsByFeedId, summary, base44);
                }
            } catch (unexpectedErr) {
                console.error(`[fetchFeeds] UNEXPECTED per-feed error for "${feed.name}": ${unexpectedErr.message}`);
                summary.error++;
                result = { feed_id: feed.id, feed: feed.name, status: 'error', error: `unexpected: ${unexpectedErr.message}` };
            }

            console.log(`[fetchFeeds] ${result.status.toUpperCase()} "${result.feed}" ${result.new_items ? `+${result.new_items} items` : result.error ? `— ${result.error.slice(0, 80)}` : ''}`);

            if (j < fetchResults.length - 1) await sleep(WRITE_DELAY_MS);
        }

        if (i + BATCH_SIZE < feeds.length) await sleep(BATCH_DELAY_MS);
    }

    return summary;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    let base44;
    try {
        base44 = createClientFromRequest(req);
    } catch {
        try {
            const { createClient } = await import('npm:@base44/sdk@0.8.21');
            base44 = createClient();
        } catch (bootErr) {
            return Response.json({ error: `SDK boot failed: ${bootErr.message}` }, { status: 500 });
        }
    }

    const { error: authError } = await requireAdminOrScheduler(base44);
    if (authError) return authError;

    const startedAt = new Date().toISOString();
    const runStartMs = Date.now();
    const instanceId = makeRunId();

    // ── Distributed run lock ───────────────────────────────────────────────────
    let recentRuns = [];
    try {
        recentRuns = extractItems(await base44.asServiceRole.entities.SystemHealth.filter(
            { job_type: 'feed_fetch', status: 'running' }, '-started_at', 5
        ));
    } catch (lockErr) {
        console.warn(`[fetchFeeds][${instanceId}] Could not query lock (non-fatal):`, lockErr.message);
    }

    for (const stale of recentRuns) {
        const age = Date.now() - new Date(stale.started_at).getTime();
        const lastHeartbeat = stale.metadata?.last_heartbeat_at
            ? Date.now() - new Date(stale.metadata.last_heartbeat_at).getTime()
            : age;
        if (age >= ZOMBIE_TTL_MS || lastHeartbeat > ZOMBIE_TTL_MS) {
            console.warn(`[fetchFeeds][${instanceId}] Reclaiming zombie lock ${stale.id}`);
            await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                status: 'failed', completed_at: new Date().toISOString(),
                error_message: `Zombie lock reclaimed by ${instanceId} after ${Math.round(age/60000)}min`,
            }).catch(() => {});
        }
    }

    const activeLock = recentRuns.find(r => {
        const age = Date.now() - new Date(r.started_at).getTime();
        const lastHeartbeat = r.metadata?.last_heartbeat_at
            ? Date.now() - new Date(r.metadata.last_heartbeat_at).getTime()
            : age;
        return age < LOCK_WINDOW_MS && lastHeartbeat < ZOMBIE_TTL_MS;
    });
    if (activeLock) {
        return Response.json({
            skipped: true,
            reason: 'Another run is actively in progress',
            active_owner: activeLock.metadata?.instance_id || activeLock.id,
            running_since: activeLock.started_at,
        });
    }

    let lockRecord = null;
    try {
        lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'feed_fetch',
            status: 'running',
            started_at: startedAt,
            metadata: { instance_id: instanceId, last_heartbeat_at: startedAt, run_type: 'main' },
        });
        console.log(`[fetchFeeds][${instanceId}] Lock ACQUIRED — id=${lockRecord.id}`);
    } catch (e) {
        console.warn(`[fetchFeeds][${instanceId}] Could not create lock:`, e.message);
    }

    let heartbeatTimer = null;
    if (lockRecord?.id) {
        heartbeatTimer = setInterval(() => {
            base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString(), run_type: 'main' },
            }).catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);
    }

    // ── Load feeds ─────────────────────────────────────────────────────────────
    let allFeeds = [];
    try {
        allFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter(
            { status: { $in: ['active', 'error'] } }, 'last_fetched', 2000
        ));
    } catch (feedErr) {
        clearInterval(heartbeatTimer);
        console.error(`[fetchFeeds][${instanceId}] Failed to load feeds:`, feedErr.message);
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord?.id, {
            status: 'failed', completed_at: new Date().toISOString(), error_message: feedErr.message,
        }).catch(() => {});
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

    console.log(`[fetchFeeds][${instanceId}] total=${allFeeds.length} overdue=${overdueFeeds.length} processing=${feeds.length} p50=${p50lag}min p95=${p95lag}min max=${maxLagMin}min`);

    // ── Load alerts once ───────────────────────────────────────────────────────
    let alertsByFeedId = {};
    try {
        const allAlerts = extractItems(await base44.asServiceRole.entities.FeedAlert.filter({ is_active: true }));
        for (const alert of allAlerts) {
            if (!alertsByFeedId[alert.feed_id]) alertsByFeedId[alert.feed_id] = [];
            alertsByFeedId[alert.feed_id].push(alert);
        }
    } catch (e) {
        console.warn('[fetchFeeds] Could not load alerts (non-fatal):', e.message);
    }

    // ── Run batches ────────────────────────────────────────────────────────────
    const summary = await runFeedBatches(feeds, alertsByFeedId, base44).catch(batchErr => {
        console.error(`[fetchFeeds][${instanceId}] runFeedBatches threw unexpectedly:`, batchErr.message);
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

    console.log(`[fetchFeeds][${instanceId}] DONE — ${JSON.stringify(finalSummary)}`);

    clearInterval(heartbeatTimer);
    if (lockRecord?.id) {
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            metadata: { ...finalSummary, instance_id: instanceId, run_type: 'main' },
        }).catch(() => {});
    }

    return Response.json({ success: true, instance_id: instanceId, ...finalSummary });
});