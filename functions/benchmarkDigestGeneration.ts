import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Benchmark: digest generation performance for heavy users.
 * Simulates the EXACT query + filtering path used in generateDigests,
 * using real DB data scaled by synthetic feed-ID sets.
 *
 * Call with: { dry_run: true } — no LLM calls, pure query/filter bench
 * Call with: { tiers: [50,100,250,500,1000] } to override feed-count tiers
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function percentile(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.floor(p * sorted.length)];
}

function stats(timings) {
    const s = [...timings].sort((a, b) => a - b);
    return {
        min: s[0] ?? 0,
        p50: percentile(s, 0.50),
        p95: percentile(s, 0.95),
        max: s[s.length - 1] ?? 0,
        mean: Math.round(s.reduce((a, b) => a + b, 0) / (s.length || 1)),
    };
}

function estimatePromptTokens(items) {
    // rough: ~250 tokens per item (title + 500-char description + url)
    return items.length * 250;
}

// ── simulate the EXACT query path from generateDigests ───────────────────────

async function simulateTier(base44, feedIds, lookbackDays, categories, tags, label) {
    const t0 = Date.now();
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    // Step 1 – fetch raw items (same cap as production: 500)
    const t_query_start = Date.now();
    let allItems = [];
    if (feedIds.length > 0) {
        allItems = await base44.asServiceRole.entities.FeedItem.filter(
            { feed_id: { $in: feedIds } },
            '-published_date',
            500
        );
    }
    const queryMs = Date.now() - t_query_start;

    // Step 2 – in-memory date filter
    const t_filter_start = Date.now();
    let items = allItems.filter(i => new Date(i.published_date || i.created_date) > since);
    if (categories?.length > 0) items = items.filter(i => categories.includes(i.category));
    if (tags?.length > 0)       items = items.filter(i => i.tags?.some(t => tags.includes(t)));
    const filterMs = Date.now() - t_filter_start;

    // Step 3 – sort + cap (same as prod)
    items.sort((a, b) => new Date(b.published_date || b.created_date) - new Date(a.published_date || a.created_date));
    const topItems = items.slice(0, 20);

    const totalMs = Date.now() - t0;
    const approxMemoryKB = Math.round(JSON.stringify(allItems).length / 1024);
    const promptTokens = estimatePromptTokens(topItems);

    return {
        tier: label,
        feed_count: feedIds.length,
        lookback_days: lookbackDays,
        raw_fetched: allItems.length,
        after_date_filter: items.length,
        after_sort_cap: topItems.length,
        query_ms: queryMs,
        filter_ms: filterMs,
        total_ms: totalMs,
        payload_kb: approxMemoryKB,
        est_prompt_tokens: promptTokens,
        // flags
        hit_500_cap: allItems.length >= 500,
        cap_risk: allItems.length >= 500 ? 'HIGH — items likely truncated before date filter' : 'low',
    };
}

// ── main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Admin only
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const tiers = body.tiers || [50, 100, 250, 500, 1000];
    const lookbackDays = body.lookback_days || 1;

    const benchStart = Date.now();

    // ── Gather real data to work with ────────────────────────────────────────
    const [allFeeds, sampleItems] = await Promise.all([
        base44.asServiceRole.entities.Feed.filter({ status: { $in: ['active', 'error'] } }, 'last_fetched', 2000),
        base44.asServiceRole.entities.FeedItem.filter({}, '-published_date', 500),
    ]);

    const realFeedIds  = allFeeds.map(f => f.id);
    const totalFeeds   = realFeedIds.length;
    const totalItems   = sampleItems.length;

    // To simulate "N feeds" we use the real feed IDs cyclically — this means
    // the DB query is always real, and we can measure how the SDK+DB behaves
    // as the $in filter grows.
    function makeFeedIdSet(n) {
        if (n <= totalFeeds) return realFeedIds.slice(0, n);
        // extend cyclically
        const out = [];
        for (let i = 0; i < n; i++) out.push(realFeedIds[i % totalFeeds]);
        return [...new Set(out)]; // dedupe — realistic
    }

    // ── Run tiers sequentially (avoid hammering DB in parallel) ──────────────
    const tierResults = [];
    for (const n of tiers) {
        const feedSet = makeFeedIdSet(n);
        const result = await simulateTier(base44, feedSet, lookbackDays, [], [], `${n}_feeds`);
        tierResults.push(result);
        console.log(`[bench] tier=${n} feeds → query=${result.query_ms}ms filter=${result.filter_ms}ms total=${result.total_ms}ms raw=${result.raw_fetched} payload=${result.payload_kb}KB cap_hit=${result.hit_500_cap}`);
    }

    // ── DB-level date filter estimate ─────────────────────────────────────────
    // Simulate what would happen if we could push date filter to DB:
    // query with $gte published_date instead of fetching 500 and filtering in memory.
    const t_db_filter_start = Date.now();
    const sinceForTest = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const dbFilteredItems = await base44.asServiceRole.entities.FeedItem.filter(
        {
            feed_id: { $in: realFeedIds.slice(0, Math.min(100, totalFeeds)) },
            published_date: { $gte: sinceForTest.toISOString() },
        },
        '-published_date',
        500
    );
    const dbFilterMs = Date.now() - t_db_filter_start;

    // ── Analysis ─────────────────────────────────────────────────────────────
    const slowThreshold  = tierResults.find(r => r.query_ms > 3000);
    const capHitTier     = tierResults.find(r => r.hit_500_cap);
    const queryTimings   = tierResults.map(r => r.query_ms);
    const totalTimings   = tierResults.map(r => r.total_ms);

    const analysis = {
        bottleneck: capHitTier
            ? `500-item cap hit at ${capHitTier.feed_count} feeds — date filtering is running on a truncated set, missing older-but-recent items`
            : `No cap hit in test range — bottleneck is query latency as $in list grows`,
        degradation_threshold: slowThreshold
            ? `Query time exceeded 3s at ${slowThreshold.feed_count} feeds (${slowThreshold.query_ms}ms)`
            : `No tier exceeded 3s in this test — threshold likely above ${tiers[tiers.length - 1]} feeds with current data volume`,
        db_date_filter_benefit: {
            query_ms: dbFilterMs,
            items_returned: dbFilteredItems.length,
            vs_in_memory: `In-memory filtered ${sampleItems.filter(i => new Date(i.published_date || i.created_date) > sinceForTest).length} of 500 fetched items`,
            verdict: dbFilterMs < (tierResults[0]?.query_ms ?? 9999)
                ? 'DB-level date filter is FASTER — push $gte published_date to query layer'
                : 'DB-level date filter not significantly faster at current scale — in-memory is acceptable for now',
        },
        short_term_recommendations: [
            capHitTier
                ? `CRITICAL: Add published_date: {$gte: since} to the FeedItem query to avoid fetching 500 stale items — users with ${capHitTier.feed_count}+ feeds are getting incorrect digests`
                : 'Add published_date: {$gte: since} filter to FeedItem query as a precaution — cost is zero, correctness gain is high',
            'Cache feed ID → category mapping to avoid per-digest Feed.filter() call',
            'If $in list grows >200 IDs, batch into parallel queries of 100 IDs each and merge',
        ],
        long_term_recommendations: [
            'Add compound DB index on (feed_id, published_date DESC) — eliminates full-collection scan for $in queries',
            'Add a FeedItemCount per-feed counter to estimate query load before executing',
            'Consider a pre-aggregation layer: a daily "items for user X" materialized view refreshed by fetchFeeds',
            'For users >500 feeds: run digest generation as a background job, not within a single synchronous function call',
        ],
        real_db_stats: {
            total_real_feeds: totalFeeds,
            total_sample_items: totalItems,
            lookback_days: lookbackDays,
        },
    };

    return Response.json({
        success: true,
        bench_duration_ms: Date.now() - benchStart,
        tiers: tierResults,
        analysis,
    });
});