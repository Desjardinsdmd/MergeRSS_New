import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * rollupFeedDays — maintains FeedDailyRollup (one row per feed per UTC day).
 *
 * Why: trend and change-over-time features (risingSignals, reports) used to scan raw
 * FeedItems with hard caps (500 rows), so the baseline window silently emptied as
 * volume grew. Rollups make those reads O(feeds x days) regardless of article volume,
 * and are computed per FEED, so every subscriber of a feed shares the same rows.
 *
 * Modes:
 *   incremental (default, hourly): feeds fetched successfully in the last 3h,
 *                                  recompute today + yesterday.
 *   backfill: { mode: 'backfill', days_back: 28 } for all feeds.
 *
 * Scales by time budget + self-continuation: each invocation works until ~45s, then
 * re-invokes itself with a cursor. No single run grows with the number of feeds.
 */

const TIME_BUDGET_MS = 45_000;
const PAGE = 500;
const MAX_ITEMS_PER_FEED_WINDOW = 10_000;
const MAX_ENTITIES_PER_ROW = 150;
const TOP_ITEMS_PER_ROW = 10;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const dayKey = (iso) => iso.slice(0, 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
    const started = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'backfill' ? 'backfill' : 'incremental';
    const daysBack = Math.min(Math.max(body.days_back || (mode === 'backfill' ? 28 : 2), 1), 90);
    const cursor = body.cursor || 0;
    const hop = body.hop || 0;
    const svc = base44.asServiceRole.entities;

    // Feed list: stable order so the cursor is meaningful across continuations.
    let feedQuery = {};
    if (Array.isArray(body.feed_ids) && body.feed_ids.length) {
        feedQuery = { id: { $in: body.feed_ids } };
    } else if (mode === 'incremental') {
        feedQuery = { last_successful_fetch_at: { $gte: new Date(Date.now() - 3 * 3600 * 1000).toISOString() } };
    }
    const feeds = [];
    for (let skip = 0; skip < 50_000; skip += PAGE) {
        const page = extractItems(await svc.Feed.filter(feedQuery, 'created_date', PAGE, skip));
        feeds.push(...page);
        if (page.length < PAGE) break;
    }

    const nowMs = Date.now();
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const windowStartIso = new Date(todayStart - (daysBack - 1) * 86400_000).toISOString();
    const futureGuardIso = new Date(nowMs + 3600_000).toISOString(); // ignore future-dated "articles" (event calendars)

    let i = cursor, rowsWritten = 0, itemsRead = 0;
    for (; i < feeds.length; i++) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const feed = feeds[i];

        // Load this feed's items in the window (paged).
        const items = [];
        for (let skip = 0; skip < MAX_ITEMS_PER_FEED_WINDOW; skip += PAGE) {
            const page = extractItems(await svc.FeedItem.filter(
                { feed_id: feed.id, published_date: { $gte: windowStartIso, $lte: futureGuardIso } },
                '-published_date', PAGE, skip
            ));
            items.push(...page);
            if (page.length < PAGE) break;
        }
        itemsRead += items.length;

        // Bucket by UTC day.
        const byDay = {};
        for (const it of items) {
            if (!it.published_date) continue;
            (byDay[dayKey(it.published_date)] ||= []).push(it);
        }

        // Existing rows for this feed in the window (one read).
        const existing = extractItems(await svc.FeedDailyRollup.filter(
            { feed_id: feed.id, day: { $gte: dayKey(windowStartIso) } }, 'day', 100
        ));
        const existingByDay = Object.fromEntries(existing.map(r => [r.day, r]));

        for (const [day, dayItems] of Object.entries(byDay)) {
            const counts = new Map(); // key -> { e, n }
            let enriched = 0, impSum = 0, impN = 0;
            for (const it of dayItems) {
                if (it.enrichment_status === 'done') enriched++;
                if (typeof it.importance_score === 'number') { impSum += it.importance_score; impN++; }
                const seen = new Set();
                for (const raw of (it.entities || [])) {
                    const e = String(raw || '').trim();
                    const k = e.toLowerCase();
                    if (k.length < 2 || seen.has(k)) continue; // count once per article
                    seen.add(k);
                    const c = counts.get(k);
                    if (c) c.n++; else counts.set(k, { e, k, n: 1 });
                }
            }
            const entity_counts = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, MAX_ENTITIES_PER_ROW);
            const top_items = [...dayItems]
                .sort((a, b) => (b.importance_score ?? -1) - (a.importance_score ?? -1))
                .slice(0, TOP_ITEMS_PER_ROW)
                .map(it => ({
                    id: it.id, title: it.title || '', url: it.url || '',
                    importance_score: it.importance_score ?? null,
                    entity_keys: [...new Set((it.entities || []).map(x => String(x).trim().toLowerCase()).filter(k => k.length >= 2))].slice(0, 12),
                }));
            const row = {
                feed_id: feed.id, day, category: feed.category || null,
                item_count: dayItems.length, enriched_count: enriched,
                avg_importance: impN ? Math.round(impSum / impN) : null,
                entity_counts, top_items, computed_at: new Date().toISOString(),
            };
            try {
                if (existingByDay[day]) await svc.FeedDailyRollup.update(existingByDay[day].id, row);
                else await svc.FeedDailyRollup.create(row);
                rowsWritten++;
            } catch (e) {
                console.warn(`[rollupFeedDays] write failed feed=${feed.id} day=${day}: ${e.message}`);
                if (/429|rate/i.test(e.message)) await sleep(1000);
            }
            await sleep(40);
        }
    }

    const done = i >= feeds.length;
    let continued = false;
    if (!done && hop < 200) {
        // Self-continuation keeps every invocation inside the time budget.
        base44.asServiceRole.functions.invoke('rollupFeedDays', {
            ...body, mode, days_back: daysBack, cursor: i, hop: hop + 1,
        }).catch(e => console.warn(`[rollupFeedDays] continuation failed: ${e.message}`));
        continued = true;
    }

    return Response.json({
        mode, days_back: daysBack, feeds_total: feeds.length, processed_from: cursor, processed_to: i,
        rows_written: rowsWritten, items_read: itemsRead, done, continued, hop,
        duration_ms: Date.now() - started,
    });
});
