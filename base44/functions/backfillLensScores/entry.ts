/**
 * backfillLensScores — scores FeedItems under a specific CustomLens.
 *
 * Does the LLM scoring directly (no enrichFeedItems call) to avoid
 * function-to-function auth issues and unwanted per-batch clustering.
 *
 * Params:
 *   lens_id        — CustomLens ID to score against (required)
 *   batch_size     — items per LLM call (default 10)
 *   max_batches    — how many batches per invocation (default 5)
 *   pause_ms       — ms to wait between batches (default 3000)
 *   days_back      — look-back window (default 30)
 *   dry_run        — if true, just count items (default false)
 *   rescore        — if true, rescore items that already have this lens (default false)
 *   score_range    — if set, only rescore items whose existing score is within [min, max]
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

    // Allow admin users and scheduler (no user session)
    let user = null;
    try {
        user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch {
        // Scheduler call — no user session, proceed with service role
    }

    let body = {};
    try { body = await req.json(); } catch {}

    const LENS_ID = body.lens_id || '69ef5ba155799e3773e6eab1';
    const BATCH_SIZE = body.batch_size || 10;
    const MAX_BATCHES = body.max_batches || 5;
    const PAUSE_MS = body.pause_ms || 3000;
    const DRY_RUN = body.dry_run === true;
    const DAYS_BACK = body.days_back || 30;
    const RESCORE = body.rescore === true;
    const SCORE_RANGE = body.score_range || null; // e.g. [30, 60]

    // Load the lens
    const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ id: LENS_ID }, '-created_date', 1));
    const lens = lenses[0];
    if (!lens) return Response.json({ error: 'Lens not found' }, { status: 404 });

    // Find matching feeds
    let feedFilter = {};
    if (lens.feed_filter_tags?.length > 0) {
        feedFilter.tags = { $in: lens.feed_filter_tags };
    }
    const allFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter(
        Object.keys(feedFilter).length ? feedFilter : {},
        '-created_date', 200
    ));
    // If categories filter is set, narrow further
    let matchingFeeds = allFeeds;
    if (lens.feed_filter_categories?.length > 0) {
        matchingFeeds = allFeeds.filter(f => lens.feed_filter_categories.includes(f.category));
    }
    const feedIds = matchingFeeds.map(f => f.id);
    const feedMap = {};
    for (const f of matchingFeeds) feedMap[f.id] = f;

    if (!feedIds.length) return Response.json({ error: 'No feeds match lens filters', feeds_checked: allFeeds.length });

    const cutoffDate = new Date(Date.now() - DAYS_BACK * 24 * 3600 * 1000).toISOString();

    // Load all items from matching feeds
    const allItems = extractItems(
        await base44.asServiceRole.entities.FeedItem.filter(
            { feed_id: { $in: feedIds }, published_date: { $gte: cutoffDate } },
            '-published_date', 500
        )
    );

    // Determine which items need scoring
    let needsScoring;
    if (RESCORE) {
        if (SCORE_RANGE) {
            // Only rescore items with existing lens score in the given range
            needsScoring = allItems.filter(item => {
                const scores = item.custom_lens_scores || [];
                const lensScore = scores.find(s => s.lens_id === LENS_ID);
                if (!lensScore) return false;
                return lensScore.importance_score >= SCORE_RANGE[0] && lensScore.importance_score <= SCORE_RANGE[1];
            });
        } else {
            // Rescore all items that have this lens
            needsScoring = allItems.filter(item => {
                const scores = item.custom_lens_scores || [];
                return scores.some(s => s.lens_id === LENS_ID);
            });
        }
    } else {
        // Only items that DON'T have this specific lens scored
        needsScoring = allItems.filter(item => {
            const scores = item.custom_lens_scores || [];
            return !scores.some(s => s.lens_id === LENS_ID);
        });
    }

    const alreadyScored = allItems.length - needsScoring.length;

    if (DRY_RUN) {
        return Response.json({
            dry_run: true,
            lens: lens.name,
            total_items: allItems.length,
            needs_scoring: needsScoring.length,
            already_scored: RESCORE ? 'n/a (rescore mode)' : alreadyScored,
            feeds_matched: feedIds.length,
            mode: RESCORE ? (SCORE_RANGE ? `rescore range ${SCORE_RANGE[0]}-${SCORE_RANGE[1]}` : 'rescore all') : 'new only',
        });
    }

    // Process in batches
    const toProcess = needsScoring.slice(0, MAX_BATCHES * BATCH_SIZE);
    const batches = [];
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        batches.push(toProcess.slice(i, i + BATCH_SIZE));
    }

    let totalScored = 0;
    let totalFailed = 0;
    const batchResults = [];
    const scoreChanges = []; // track before/after for rescore mode

    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        console.log(`[backfill] Batch ${bi + 1}/${batches.length}: ${batch.length} items`);

        const articlesPayload = batch.map((item, idx) => ({
            index: idx,
            title: (item.title || '').slice(0, 200),
            description: (item.description || '').slice(0, 500),
            content: (item.content || '').slice(0, 800),
            category: item.category || '',
            source: feedMap[item.feed_id]?.name || '',
        }));

        try {
            const lensResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: `${lens.scoring_prompt}

For each article below, return the JSON object specified in the prompt above. If the prompt specifies fields like vectom_relevance, audience_relevance, content_type, entities — include them. Always include importance_score, intelligence_tag, and ai_summary.

Articles:
${JSON.stringify(articlesPayload, null, 2)}`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        results: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    index: { type: "number" },
                                    importance_score: { type: "number" },
                                    intelligence_tag: { type: "string", enum: ["Trending", "Risk", "Opportunity", "Neutral"] },
                                    ai_summary: { type: "string" },
                                },
                                required: ["index", "importance_score", "intelligence_tag", "ai_summary"]
                            }
                        }
                    },
                    required: ["results"]
                }
            });

            let batchScored = 0;
            let batchFailed = 0;

            for (const r of (lensResult?.results || [])) {
                const item = batch[r.index];
                if (!item) continue;

                const newScore = Math.min(100, Math.max(0, Math.round(r.importance_score || 0)));
                const existingScores = item.custom_lens_scores || [];
                const oldEntry = existingScores.find(s => s.lens_id === LENS_ID);
                const filtered = existingScores.filter(s => s.lens_id !== LENS_ID);
                filtered.push({
                    lens_id: LENS_ID,
                    importance_score: newScore,
                    intelligence_tag: r.intelligence_tag || 'Neutral',
                    ai_summary: r.ai_summary || '',
                    scored_at: new Date().toISOString(),
                });

                let writeOk = false;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await base44.asServiceRole.entities.FeedItem.update(item.id, { custom_lens_scores: filtered });
                        writeOk = true;
                        break;
                    } catch (updateErr) {
                        if (updateErr.message?.includes('Rate limit') || updateErr.message?.includes('429')) {
                            console.warn(`[backfill] Rate-limited on ${item.id}, waiting 5s (attempt ${attempt + 1}/3)`);
                            await sleep(5000);
                        } else {
                            console.error(`[backfill] Failed to update ${item.id}: ${updateErr.message}`);
                            break;
                        }
                    }
                }
                if (writeOk) {
                    batchScored++;
                    if (RESCORE && oldEntry) {
                        scoreChanges.push({
                            item_id: item.id,
                            title: (item.title || '').slice(0, 80),
                            old_score: oldEntry.importance_score,
                            new_score: newScore,
                            delta: newScore - oldEntry.importance_score,
                        });
                    }
                } else {
                    batchFailed++;
                }
                await sleep(200);
            }

            totalScored += batchScored;
            totalFailed += batchFailed;
            batchResults.push({ batch: bi + 1, scored: batchScored, failed: batchFailed });
            console.log(`[backfill] Batch ${bi + 1} done: scored=${batchScored}, failed=${batchFailed}`);

        } catch (llmErr) {
            console.error(`[backfill] Batch ${bi + 1} LLM error: ${llmErr.message}`);
            batchResults.push({ batch: bi + 1, error: llmErr.message });
            totalFailed += batch.length;
            // If rate limited, stop early
            if (llmErr.message?.includes('429') || llmErr.message?.includes('rate') || llmErr.message?.includes('quota')) {
                console.log('[backfill] Rate limit hit — stopping early.');
                break;
            }
        }

        if (bi < batches.length - 1) {
            await sleep(PAUSE_MS);
        }
    }

    const remaining = needsScoring.length - toProcess.length;

    const response = {
        lens: lens.name,
        total_items: allItems.length,
        processed_this_run: toProcess.length,
        total_scored: totalScored,
        total_failed: totalFailed,
        remaining_count: remaining + (toProcess.length - totalScored - totalFailed),
        batches: batchResults,
        message: remaining > 0 ? `Call again to process ${remaining} more items` : 'All items processed!',
    };

    if (RESCORE && scoreChanges.length > 0) {
        response.score_changes = scoreChanges;
        response.threshold_flips = {
            dropped_below_50: scoreChanges.filter(c => c.old_score >= 50 && c.new_score < 50).length,
            rose_above_50: scoreChanges.filter(c => c.old_score < 50 && c.new_score >= 50).length,
        };
    }

    return Response.json(response);
});