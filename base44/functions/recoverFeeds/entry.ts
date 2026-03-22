/**
 * recoverFeeds — Isolated recovery runner for system-paused feeds.
 *
 * Feed parsing and dedup logic are intentionally kept in sync with fetchFeeds.js.
 * Base44 does not support shared imports between function files, so both files
 * carry the same canonical parseFeed / dedup implementations.
 *
 * MAINTENANCE NOTE: If parseFeed or dedup logic changes in fetchFeeds.js,
 * update the matching sections here (marked CANONICAL COPY).
 *
 * Cap: RECOVERY_CAP feeds per run (default 20).
 * Schedule: every 30–60 min, separate automation from fetchFeeds.
 * Must NEVER compete with the main fetchFeeds run for quota.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

// ─── Infrastructure helpers (see functions/lib.js for canonical reference) ────
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
        return { user: null };
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function makeRunId() { return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

const RECOVERY_CAP             = 20;
const WRITE_DELAY_MS           = 200;
const EXTENDED_COOLDOWN_HOURS  = 6;
const MAX_RECOVERY_ATTEMPTS    = 3;
const RECOVERY_LOCK_WINDOW_MS  = 20 * 60 * 1000;
const ZOMBIE_TTL_MS            = 25 * 60 * 1000;

// ─── CANONICAL COPY: HTML entity decoder ─────────────────────────────────────
// Keep in sync with fetchFeeds.js
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

// ─── CANONICAL COPY: Feed parser ─────────────────────────────────────────────
// Supports RSS 2.0, Atom, RDF/RSS 1.0.
// Keep in sync with fetchFeeds.js parseFeed().
async function parseFeed(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
    });
    if (response.status === 429) throw new Error('HTTP_429: Source rate-limited us');
    if (!response.ok) throw new Error(`HTTP_${response.status}: ${response.statusText}`);
    const contentType = response.headers.get('content-type') || '';
    const xml = await response.text();
    if (contentType.includes('text/html') && !contentType.includes('xml') && xml.trimStart().toLowerCase().startsWith('<!doctype html')) {
        throw new Error('FEED_HTML: Feed returned HTML');
    }
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (n) => ['item', 'entry'].includes(n),
        allowBooleanAttributes: true,
    });
    const parsed = parser.parse(xml);

    // RSS 2.0
    if (parsed.rss?.channel) {
        const items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : (parsed.rss.channel.item ? [parsed.rss.channel.item] : []);
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

    // Atom
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

    // RDF / RSS 1.0
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

    throw new Error(`FEED_UNKNOWN_FORMAT: ${xml.substring(0, 80).replace(/\s+/g, ' ').trim()}`);
}

// ─── CANONICAL COPY: Dedup helpers ───────────────────────────────────────────
// Keep in sync with fetchFeeds.js buildDedupSets / isDuplicate / buildFeedItemRecord.
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

// ─── Main handler ─────────────────────────────────────────────────────────────
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

    const instanceId = makeRunId();
    const startedAt = new Date().toISOString();
    const runStartMs = Date.now();

    // ── Lock check ─────────────────────────────────────────────────────────────
    let activeLocks = [];
    try {
        activeLocks = extractItems(await base44.asServiceRole.entities.SystemHealth.filter(
            { status: 'running' }, '-started_at', 10
        ));
    } catch (e) {
        console.warn(`[recoverFeeds][${instanceId}] Could not query locks (non-fatal):`, e.message);
    }

    for (const stale of activeLocks) {
        const age = Date.now() - new Date(stale.started_at).getTime();
        const lastHb = stale.metadata?.last_heartbeat_at ? Date.now() - new Date(stale.metadata.last_heartbeat_at).getTime() : age;
        if (age >= ZOMBIE_TTL_MS || lastHb > ZOMBIE_TTL_MS) {
            await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                status: 'failed', completed_at: new Date().toISOString(),
                error_message: `Zombie reclaimed by recovery ${instanceId}`,
            }).catch(() => {});
        }
    }

    const mainRunActive = activeLocks.find(r => {
        if (r.job_type !== 'feed_fetch') return false;
        const age = Date.now() - new Date(r.started_at).getTime();
        const lastHb = r.metadata?.last_heartbeat_at ? Date.now() - new Date(r.metadata.last_heartbeat_at).getTime() : age;
        return age < RECOVERY_LOCK_WINDOW_MS && lastHb < ZOMBIE_TTL_MS;
    });
    if (mainRunActive) {
        return Response.json({ skipped: true, reason: 'Main fetch run is active — recovery deferred', main_run_owner: mainRunActive.metadata?.instance_id });
    }

    const recoveryRunActive = activeLocks.find(r => {
        if (r.job_type !== 'feed_recovery') return false;
        const age = Date.now() - new Date(r.started_at).getTime();
        const lastHb = r.metadata?.last_heartbeat_at ? Date.now() - new Date(r.metadata.last_heartbeat_at).getTime() : age;
        return age < RECOVERY_LOCK_WINDOW_MS && lastHb < ZOMBIE_TTL_MS;
    });
    if (recoveryRunActive) {
        return Response.json({ skipped: true, reason: 'Another recovery run is active' });
    }

    let lockRecord = null;
    try {
        lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'feed_recovery',
            status: 'running',
            started_at: startedAt,
            metadata: { instance_id: instanceId, last_heartbeat_at: startedAt, run_type: 'recovery' },
        });
    } catch (e) {
        console.warn(`[recoverFeeds][${instanceId}] Could not create lock:`, e.message);
    }

    const heartbeatTimer = lockRecord?.id ? setInterval(() => {
        base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString(), run_type: 'recovery' },
        }).catch(() => {});
    }, 60000) : null;

    // ── Load system-paused feeds past cooldown ─────────────────────────────────
    let pausedFeeds = [];
    try {
        const all = extractItems(await base44.asServiceRole.entities.Feed.filter(
            { status: 'paused', paused_by_system: true }, 'retry_after_at', 200
        ));
        const now = Date.now();
        pausedFeeds = all.filter(f => !f.retry_after_at || new Date(f.retry_after_at).getTime() <= now);
    } catch (e) {
        clearInterval(heartbeatTimer);
        console.error(`[recoverFeeds][${instanceId}] Failed to load paused feeds:`, e.message);
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord?.id, {
            status: 'failed', completed_at: new Date().toISOString(), error_message: e.message,
        }).catch(() => {});
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }

    const feedsToRecover = pausedFeeds.slice(0, RECOVERY_CAP);
    console.log(`[recoverFeeds][${instanceId}] ${pausedFeeds.length} eligible — attempting ${feedsToRecover.length}`);

    const results = { recovered: 0, re_paused: 0, escalated: 0, skipped: 0 };
    const recoveredFeeds = [];
    const escalatedFeeds = [];

    for (const feed of feedsToRecover) {
        try {
            const now = new Date().toISOString();
            let items = [];
            let fetchError = null;

            try {
                items = await parseFeed(feed.url);
            } catch (err) {
                fetchError = err.message;
            }

            if (fetchError) {
                const attemptCount = (feed.repair_attempt_count || 0) + 1;
                const shouldEscalate = attemptCount >= MAX_RECOVERY_ATTEMPTS;
                const backoffHours = attemptCount >= 2 ? EXTENDED_COOLDOWN_HOURS : 2;

                if (shouldEscalate) {
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        status: 'paused',
                        paused_by_system: true,
                        repair_status: 'failed',
                        repair_attempt_count: attemptCount,
                        last_repair_attempt_at: now,
                        escalation_reason: `Recovery exhausted after ${attemptCount} attempts. Last error: ${fetchError.slice(0, 200)}`,
                        retry_after_at: null,
                    }).catch(() => {});
                    escalatedFeeds.push({ name: feed.name, reason: fetchError });
                    results.escalated++;
                    console.warn(`[recoverFeeds][${instanceId}] ESCALATED "${feed.name}" — ${attemptCount} attempts`);
                } else {
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        status: 'paused',
                        paused_by_system: true,
                        repair_status: 'retrying',
                        repair_attempt_count: attemptCount,
                        last_repair_attempt_at: now,
                        last_failure_at: now,
                        last_failure_reason: fetchError.slice(0, 300),
                        paused_reason: `Recovery attempt ${attemptCount} failed: ${fetchError.slice(0, 200)}`,
                        retry_after_at: new Date(Date.now() + backoffHours * 3600 * 1000).toISOString(),
                    }).catch(() => {});
                    results.re_paused++;
                }
            } else {
                // Success — dedup + write items using canonical helpers
                const existing = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
                    { feed_id: feed.id }, '-created_date', 300
                ).catch(() => []));

                const dedupSets = buildDedupSets(existing);
                const itemsToCreate = [];
                for (const item of items.slice(0, 50)) {
                    if (!isDuplicate(item, dedupSets)) {
                        itemsToCreate.push(buildFeedItemRecord(item, feed));
                    }
                }

                if (itemsToCreate.length > 0) {
                    await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate).catch(() => {});
                }

                await base44.asServiceRole.entities.Feed.update(feed.id, {
                    status: 'active',
                    paused_by_system: false,
                    paused_reason: null,
                    retry_after_at: null,
                    fetch_error: '',
                    consecutive_errors: 0,
                    last_failure_reason: null,
                    repair_status: 'resolved',
                    last_repair_attempt_at: now,
                    last_fetched: now,
                    last_successful_fetch_at: now,
                    item_count: (feed.item_count || 0) + itemsToCreate.length,
                }).catch(() => {});

                recoveredFeeds.push({ name: feed.name, new_items: itemsToCreate.length });
                results.recovered++;
                console.log(`[recoverFeeds][${instanceId}] RECOVERED "${feed.name}" +${itemsToCreate.length} items`);
            }
        } catch (unexpectedErr) {
            console.error(`[recoverFeeds][${instanceId}] UNEXPECTED error for "${feed.name}":`, unexpectedErr.message);
            results.skipped++;
        }

        await sleep(WRITE_DELAY_MS);
    }

    const runDurationMs = Date.now() - runStartMs;
    const finalSummary = {
        instance_id: instanceId,
        run_type: 'recovery',
        total_paused_eligible: pausedFeeds.length,
        attempted: feedsToRecover.length,
        recovered: results.recovered,
        re_paused: results.re_paused,
        escalated: results.escalated,
        skipped: results.skipped,
        recovered_feeds: recoveredFeeds,
        escalated_feeds: escalatedFeeds,
        run_duration_ms: runDurationMs,
    };

    console.log(`[recoverFeeds][${instanceId}] DONE — ${JSON.stringify(finalSummary)}`);

    clearInterval(heartbeatTimer);
    if (lockRecord?.id) {
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            metadata: finalSummary,
        }).catch(() => {});
    }

    return Response.json({ success: true, ...finalSummary });
});