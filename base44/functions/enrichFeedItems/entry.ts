import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * Enriches a batch of FeedItems with ai_summary, importance_score, and intelligence_tag.
 * Called fire-and-forget from fetchFeeds after bulkCreate.
 * Skips items that already have all three fields populated.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { item_ids } = await req.json();
        if (!Array.isArray(item_ids) || item_ids.length === 0) {
            return Response.json({ error: 'item_ids array required' }, { status: 400 });
        }

        // Fetch items (up to 20 at a time to stay within LLM context)
        const items = await base44.asServiceRole.entities.FeedItem.filter(
            { id: { $in: item_ids.slice(0, 20) } },
            '-created_date',
            20
        );

        // Filter to only items missing enrichment
        const needsEnrichment = (items || []).filter(
            i => !i.ai_summary || i.importance_score == null || !i.intelligence_tag
        );

        if (needsEnrichment.length === 0) {
            return Response.json({ enriched: 0, skipped: item_ids.length });
        }

        // Build a compact payload for the LLM
        const articlesPayload = needsEnrichment.map((item, idx) => ({
            index: idx,
            title: (item.title || '').slice(0, 200),
            description: (item.description || '').slice(0, 400),
            category: item.category || '',
        }));

        const result = await base44.integrations.Core.InvokeLLM({
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

        const enrichments = result?.results || [];
        let enriched = 0;

        await Promise.allSettled(
            enrichments.map(async (e) => {
                const item = needsEnrichment[e.index];
                if (!item) return;
                await base44.asServiceRole.entities.FeedItem.update(item.id, {
                    ai_summary: e.ai_summary,
                    importance_score: Math.min(100, Math.max(0, Math.round(e.importance_score))),
                    intelligence_tag: e.intelligence_tag,
                });
                enriched++;
            })
        );

        return Response.json({ enriched, skipped: needsEnrichment.length - enriched });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});