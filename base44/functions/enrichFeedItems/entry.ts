import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * Enriches a batch of FeedItems with ai_summary, importance_score, and intelligence_tag.
 * Called fire-and-forget from fetchFeeds after bulkCreate (server-to-server via asServiceRole).
 * Also callable directly by authenticated users.
 *
 * Auth: accepts both authenticated user requests AND internal service-role invocations.
 * Determined by checking for INTERNAL_SECRET header to allow server-to-server calls.
 */
Deno.serve(async (req) => {
    const startTime = Date.now();
    try {
        const base44 = createClientFromRequest(req);

        // Allow internal server-to-server calls (from fetchFeeds via asServiceRole.functions.invoke)
        // OR regular authenticated user calls.
        const internalSecret = req.headers.get('x-internal-secret');
        const isInternalCall = internalSecret && internalSecret === Deno.env.get('INTERNAL_SECRET');

        if (!isInternalCall) {
            const user = await base44.auth.me().catch(() => null);
            if (!user) {
                console.error('[enrichFeedItems] Unauthorized — no user and no internal secret');
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const body = await req.json().catch(() => ({}));
        const { item_ids } = body;

        if (!Array.isArray(item_ids) || item_ids.length === 0) {
            return Response.json({ error: 'item_ids array required' }, { status: 400 });
        }

        console.log(`[enrichFeedItems] Starting enrichment for ${item_ids.length} item(s)`);

        // Fetch items (up to 20 at a time to stay within LLM context)
        const items = await base44.asServiceRole.entities.FeedItem.filter(
            { id: { $in: item_ids.slice(0, 20) } },
            '-created_date',
            20
        );

        if (!items || items.length === 0) {
            console.warn('[enrichFeedItems] No items found for provided IDs');
            return Response.json({ enriched: 0, skipped: item_ids.length, reason: 'items_not_found' });
        }

        // Filter to only items missing enrichment
        const needsEnrichment = items.filter(
            i => !i.ai_summary || i.importance_score == null || !i.intelligence_tag
        );

        if (needsEnrichment.length === 0) {
            console.log(`[enrichFeedItems] All ${items.length} items already enriched — skipping`);
            return Response.json({ enriched: 0, skipped: item_ids.length, reason: 'already_enriched' });
        }

        console.log(`[enrichFeedItems] ${needsEnrichment.length} item(s) need enrichment`);

        // Build a compact payload for the LLM
        const articlesPayload = needsEnrichment.map((item, idx) => ({
            index: idx,
            title: (item.title || '').slice(0, 200),
            description: (item.description || '').slice(0, 400),
            category: item.category || '',
        }));

        let enrichments = [];
        try {
            const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: `You are a financial and tech news intelligence analyst. 
For each article below, return:
1. ai_summary: 1-2 sentence plain-English summary focusing on what happened and why it matters
2. importance_score: integer 0-100 (100 = market-moving global event, 0 = trivial/routine)
3. intelligence_tag: one of "Trending" (widely discussed topic), "Risk" (threat, danger, downturn), "Opportunity" (growth, positive catalyst), "Neutral" (informational, no clear signal)

Be decisive. Avoid always returning Neutral. Use Risk for regulatory, geopolitical, market stress signals. Use Opportunity for earnings beats, launches, policy tailwinds.

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
                                    ai_summary: { type: "string" },
                                    importance_score: { type: "number" },
                                    intelligence_tag: { type: "string", enum: ["Trending", "Risk", "Opportunity", "Neutral"] }
                                },
                                required: ["index", "ai_summary", "importance_score", "intelligence_tag"]
                            }
                        }
                    },
                    required: ["results"]
                }
            });
            enrichments = result?.results || [];
            console.log(`[enrichFeedItems] LLM returned ${enrichments.length} enrichment(s)`);
        } catch (llmErr) {
            console.error('[enrichFeedItems] LLM call failed:', llmErr.message);
            // Fallback: apply neutral defaults so items are not left empty
            enrichments = needsEnrichment.map((_, idx) => ({
                index: idx,
                ai_summary: '',
                importance_score: 50,
                intelligence_tag: 'Neutral',
            }));
            console.warn(`[enrichFeedItems] Applied fallback defaults to ${enrichments.length} item(s)`);
        }

        let enriched = 0;
        let failed = 0;

        await Promise.allSettled(
            enrichments.map(async (e) => {
                const item = needsEnrichment[e.index];
                if (!item) return;
                try {
                    await base44.asServiceRole.entities.FeedItem.update(item.id, {
                        ai_summary: e.ai_summary || '',
                        importance_score: Math.min(100, Math.max(0, Math.round(e.importance_score || 50))),
                        intelligence_tag: e.intelligence_tag || 'Neutral',
                    });
                    enriched++;
                } catch (updateErr) {
                    console.error(`[enrichFeedItems] Failed to update item ${item.id}:`, updateErr.message);
                    failed++;
                }
            })
        );

        const durationMs = Date.now() - startTime;
        console.log(`[enrichFeedItems] Done — enriched=${enriched} failed=${failed} skipped=${needsEnrichment.length - enriched - failed} duration=${durationMs}ms`);

        return Response.json({ enriched, failed, skipped: needsEnrichment.length - enriched - failed, duration_ms: durationMs });
    } catch (error) {
        console.error('[enrichFeedItems] Unhandled error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});