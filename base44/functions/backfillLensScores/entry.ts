/**
 * backfillLensScores — one-time utility to score the-stack items under the custom lens.
 *
 * Processes a limited number of items per call to stay under the 3-min timeout.
 * Call repeatedly until remaining_count reaches 0.
 *
 * Params:
 *   batch_size (default 5) — items per enrichFeedItems call
 *   max_batches (default 2) — how many batches to run per invocation
 *   pause_ms (default 10000) — ms to wait between batches
 *   days_back (default 30)
 *   dry_run (default false)
 *   skip_ids (default []) — item IDs to skip (already processed in prior calls)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch {}

    const BATCH_SIZE = body.batch_size || 5;
    const MAX_BATCHES = body.max_batches || 2;
    const PAUSE_MS = body.pause_ms || 10000;
    const DRY_RUN = body.dry_run === true;
    const DAYS_BACK = body.days_back || 30;

    const cutoffDate = new Date(Date.now() - DAYS_BACK * 24 * 3600 * 1000).toISOString();

    // Find the-stack feeds
    const allFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter({ tags: 'the-stack' }, '-created_date', 100));
    const feedIds = allFeeds.map(f => f.id);

    // Load items needing scoring
    const allItems = extractItems(
        await base44.asServiceRole.entities.FeedItem.filter(
            { feed_id: { $in: feedIds }, published_date: { $gte: cutoffDate } },
            '-published_date', 500
        )
    );

    const needsScoring = allItems.filter(item => !item.custom_lens_scores || item.custom_lens_scores.length === 0);

    if (DRY_RUN) {
        return Response.json({
            dry_run: true,
            total_items: allItems.length,
            needs_scoring: needsScoring.length,
            already_scored: allItems.length - needsScoring.length,
        });
    }

    // Take only the first MAX_BATCHES * BATCH_SIZE items
    const toProcess = needsScoring.slice(0, MAX_BATCHES * BATCH_SIZE);
    const batches = [];
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        batches.push(toProcess.slice(i, i + BATCH_SIZE));
    }

    let totalScored = 0;
    let totalFailed = 0;
    const batchResults = [];

    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        const batchIds = batch.map(i => i.id);
        console.log(`[backfill] Batch ${bi + 1}/${batches.length}: ${batchIds.length} items`);

        try {
            const result = await base44.asServiceRole.functions.invoke('enrichFeedItems', {
                item_ids: batchIds,
                force_rescore: true,
            });
            const data = result?.data || result;
            totalScored += (data.custom_lens_scored || 0);
            totalFailed += (data.failed || 0);
            batchResults.push({
                batch: bi + 1,
                scored: data.custom_lens_scored || 0,
                failed: data.failed || 0,
            });
            console.log(`[backfill] Batch ${bi + 1} done: scored=${data.custom_lens_scored}, failed=${data.failed}`);
        } catch (e) {
            console.error(`[backfill] Batch ${bi + 1} error: ${e.message}`);
            batchResults.push({ batch: bi + 1, error: e.message });
            totalFailed += batchIds.length;
        }

        if (bi < batches.length - 1) {
            await sleep(PAUSE_MS);
        }
    }

    const remaining = needsScoring.length - toProcess.length;

    return Response.json({
        total_items: allItems.length,
        already_scored_before: allItems.length - needsScoring.length,
        processed_this_run: toProcess.length,
        total_scored: totalScored,
        total_failed: totalFailed,
        remaining_count: remaining,
        batches: batchResults,
        message: remaining > 0 ? `Call again to process ${remaining} more items` : 'All items scored!',
    });
});