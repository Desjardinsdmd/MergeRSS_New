import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

//@@HEADER@@

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

//@@LENSES@@

Deno.serve(async (req) => {
    const startTime = Date.now();
    try {
        const base44 = createClientFromRequest(req);

        const internalSecret = req.headers.get('x-internal-secret');
        const isInternalCall = internalSecret && internalSecret === Deno.env.get('INTERNAL_SECRET');

        if (!isInternalCall) {
            const user = await base44.auth.me().catch(() => null);
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            if (user.role !== 'admin') {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const body = await req.json().catch(() => ({}));
        const { item_ids, force_rescore } = body;

        if (!Array.isArray(item_ids) || item_ids.length === 0) {
            return Response.json({ error: 'item_ids array required' }, { status: 400 });
        }

        console.log(`[enrichFeedItems] Starting enrichment for ${item_ids.length} item(s), force_rescore=${!!force_rescore}`);

        // Fetch items (up to 20 at a time)
        const items = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
            { id: { $in: item_ids.slice(0, 20) } }, '-created_date', 20
        ));

        if (!items.length) {
            return Response.json({ enriched: 0, skipped: item_ids.length, reason: 'items_not_found' });
        }

        // Filter to items needing enrichment (unless force_rescore)
        const needsEnrichment = force_rescore
            ? items
            : items.filter(i => !i.ai_summary || i.importance_score == null || !i.intelligence_tag);

        if (!needsEnrichment.length) {
            return Response.json({ enriched: 0, skipped: item_ids.length, reason: 'already_enriched' });
        }

        // ── Load SourceAuthority for tier adjustments ──
        const allAuth = extractItems(await base44.asServiceRole.entities.SourceAuthority.list('-created_date', 500));
        const authByDomain = {};
        for (const a of allAuth) {
            if (a.domain) authByDomain[a.domain.toLowerCase()] = a;
        }

        // Load feeds to get source domain info
        const feedIds = [...new Set(needsEnrichment.map(i => i.feed_id).filter(Boolean))];
        const feeds = feedIds.length > 0
            ? extractItems(await base44.asServiceRole.entities.Feed.filter({ id: { $in: feedIds } }, '-created_date', 50))
            : [];
        const feedMap = {};
        for (const f of feeds) {
            feedMap[f.id] = f;
            // Extract domain from feed URL for authority lookup
            try {
                const domain = new URL(f.url || f.resolved_url || '').hostname.replace(/^www\./, '');
                feedMap[f.id]._domain = domain;
                feedMap[f.id]._authority = authByDomain[domain] || null;
            } catch { /* skip */ }
        }

        // Group items by lens for batch LLM calls
        const byLens = { TCU: [], AI_TECH: [], MACRO: [] };
        for (let i = 0; i < needsEnrichment.length; i++) {
            const item = needsEnrichment[i];
            const lens = pickLens(item.category, item.title, item.description, item.tags);
            byLens[lens].push({ item, originalIndex: i });
        }

        console.log(`[enrichFeedItems] Lens distribution: TCU=${byLens.TCU.length} AI_TECH=${byLens.AI_TECH.length} MACRO=${byLens.MACRO.length}`);

        // Process each lens batch
        let enriched = 0, failed = 0;

        for (const [lens, batch] of Object.entries(byLens)) {
            if (!batch.length) continue;

            const articlesPayload = batch.map((b, idx) => ({
                index: idx,
                title: (b.item.title || '').slice(0, 200),
                description: (b.item.description || '').slice(0, 400),
                category: b.item.category || '',
                source: feedMap[b.item.feed_id]?.name || '',
            }));

            let enrichments = [];
            try {
                const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: `${LENS_PROMPTS[lens]}

For each article below, return:
1. ai_summary: 2-3 sentences answering "So what?" — end with a clause like "...relevant because [lens-specific implication]." Do NOT just describe what happened.
2. importance_score: integer 0-100 scored strictly per the lens criteria above. Use the FULL range. Most routine articles should score 40-60. Only genuinely significant items score 70+.
3. intelligence_tag: one of "Trending", "Risk", "Opportunity", "Neutral" — apply the tag rules above strictly. Default to "Neutral" when in doubt, NOT "Opportunity".
4. entities: array of 2-6 named entities mentioned (companies, people, places, regulations, products). Use proper names, not generic terms.

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
                                        intelligence_tag: { type: "string", enum: ["Trending", "Risk", "Opportunity", "Neutral"] },
                                        entities: { type: "array", items: { type: "string" } }
                                    },
                                    required: ["index", "ai_summary", "importance_score", "intelligence_tag", "entities"]
                                }
                            }
                        },
                        required: ["results"]
                    }
                });
                enrichments = (result?.results || []).map(e => ({ ...e, _isFallback: false }));
            } catch (llmErr) {
                console.error(`[enrichFeedItems] LLM call failed for ${lens}:`, llmErr.message);
                enrichments = batch.map((_, idx) => ({
                    index: idx, ai_summary: '', importance_score: 50,
                    intelligence_tag: 'Neutral', entities: [], _isFallback: true,
                }));
            }

            // Apply authority adjustment and write results
            for (const e of enrichments) {
                const batchEntry = batch[e.index];
                if (!batchEntry) continue;
                const item = batchEntry.item;
                const feed = feedMap[item.feed_id];
                const authority = feed?._authority;

                let adjustedScore = Math.round(e.importance_score || 50);

                // Authority tier adjustment: +10 for tier1, -10 for tier3
                if (authority) {
                    if (authority.tier === 'tier1') adjustedScore += 10;
                    else if (authority.tier === 'tier3') adjustedScore -= 10;
                }
                adjustedScore = Math.min(100, Math.max(0, adjustedScore));

                try {
                    await base44.asServiceRole.entities.FeedItem.update(item.id, {
                        ai_summary: e.ai_summary || '',
                        importance_score: adjustedScore,
                        intelligence_tag: e.intelligence_tag || 'Neutral',
                        scoring_lens: lens,
                        entities: (e.entities || []).slice(0, 8),
                        enrichment_status: e._isFallback ? 'fallback' : 'done',
                    });
                    enriched++;
                } catch (updateErr) {
                    console.error(`[enrichFeedItems] Failed to update item ${item.id}:`, updateErr.message);
                    failed++;
                }
                await sleep(50);
            }
        }

        // ── Custom Lens Scoring ──
        // After standard enrichment, check if any user-defined CustomLens records
        // match these items' parent feeds and score them additionally.
        let customLensScored = 0;
        try {
            const allLenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ is_active: true }, '-created_date', 100));
            if (allLenses.length > 0) {
                for (const lens of allLenses) {
                    // Find items whose parent feed matches lens tag/category filters
                    const matchingItems = needsEnrichment.filter(item => {
                        const feed = feedMap[item.feed_id];
                        if (!feed) return false;
                        // Tenant guard (2026-09-25): a lens only scores feeds its owner subscribes to
                        if (feed.created_by !== lens.created_by) return false;
                        // Check category filter (if set, feed category must match one)
                        if (lens.feed_filter_categories?.length > 0) {
                            if (!lens.feed_filter_categories.includes(feed.category)) return false;
                        }
                        // Check tag filter (if set, feed must have at least one matching tag)
                        if (lens.feed_filter_tags?.length > 0) {
                            const feedTags = (feed.tags || []).map(t => t.toLowerCase());
                            if (!lens.feed_filter_tags.some(t => feedTags.includes(t.toLowerCase()))) return false;
                        }
                        return true;
                    });

                    if (!matchingItems.length) continue;

                    // Score up to 10 items per lens per batch
                    const batch = matchingItems.slice(0, 10);
                    const articlesForLens = batch.map((item, idx) => ({
                        index: idx,
                        title: (item.title || '').slice(0, 200),
                        description: (item.description || '').slice(0, 400),
                        category: item.category || '',
                        source: feedMap[item.feed_id]?.name || '',
                    }));

                    try {
                        const lensResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `${lens.scoring_prompt}

For each article below, return:
1. ai_summary: 2-3 sentences answering "So what?" from this lens perspective.
2. importance_score: integer 0-100.
3. intelligence_tag: one of "Trending", "Risk", "Opportunity", "Neutral".

Articles:
${JSON.stringify(articlesForLens, null, 2)}`,
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

                        for (const r of (lensResult?.results || [])) {
                            const item = batch[r.index];
                            if (!item) continue;
                            const existingScores = item.custom_lens_scores || [];
                            // Replace or append score for this lens
                            const filtered = existingScores.filter(s => s.lens_id !== lens.id);
                            filtered.push({
                                lens_id: lens.id,
                                importance_score: Math.round(r.importance_score || 50),
                                intelligence_tag: r.intelligence_tag || 'Neutral',
                                ai_summary: r.ai_summary || '',
                                scored_at: new Date().toISOString(),
                            });
                            await base44.asServiceRole.entities.FeedItem.update(item.id, { custom_lens_scores: filtered });
                            customLensScored++;
                            await sleep(50);
                        }
                    } catch (lensErr) {
                        console.warn(`[enrichFeedItems] CustomLens ${lens.name} scoring failed: ${lensErr.message}`);
                    }
                }
            }
        } catch (lensLoadErr) {
            console.warn(`[enrichFeedItems] CustomLens load failed (non-fatal): ${lensLoadErr.message}`);
        }

        // Clustering is no longer triggered here (2026-09-25). fetchFeeds runs once per
        // cycle and chains backfillLensScores -> clusterStories a single time. Triggering it
        // from every per-feed enrichment call launched parallel clustering runs that raced
        // the lock and left zombie jobs behind.
        const clusterResult = null;

        const durationMs = Date.now() - startTime;
        console.log(`[enrichFeedItems] Done — enriched=${enriched} failed=${failed} customLensScored=${customLensScored} duration=${durationMs}ms`);
        return Response.json({ enriched, failed, custom_lens_scored: customLensScored, skipped: needsEnrichment.length - enriched - failed, duration_ms: durationMs, clustering: clusterResult });
    } catch (error) {
        console.error('[enrichFeedItems] Unhandled error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});