import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * enrichFeedItems — multi-lens scoring with source authority adjustment.
 *
 * Three lenses:
 *   TCU     — Canadian multifamily developer building PBRA in Ottawa/GTA via CMHC MLI Select
 *   AI_TECH — AI frontier capability, cost, regulation, funding, M&A, enterprise adoption
 *   MACRO   — Durable macro signals an institutional investor would act on
 *
 * Also extracts named entities for Rising Signals computation (Part D).
 * Reads SourceAuthority for tier-based score adjustments (+10 tier1, -10 tier3).
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Determine which scoring lens to use based on category + content signals
function pickLens(category, title, description, tags) {
    const cat = (category || '').toLowerCase();
    const text = ((title || '') + ' ' + (description || '') + ' ' + (tags || []).join(' ')).toLowerCase();

    // CRE lens — direct CRE category OR cross-domain items touching Canadian RE
    const creSignals = /\b(cmhc|mli select|purpose.built|multifamily|cap rate|construction cost|rent|zoning|housing policy|ottawa|gta|toronto condo|canadian real estate|commercial property|reit|industrial.*lease|office.*vacancy)\b/;
    if (cat === 'cre' || creSignals.test(text)) return 'TCU';

    // AI/Tech lens
    if (cat === 'ai' || cat === 'tech') return 'AI_TECH';

    // Macro lens — markets, finance, news, geopolitics
    if (['markets', 'finance', 'news', 'geopolitics'].includes(cat)) return 'MACRO';

    // Cross-domain detection for items without clean category
    const macroSignals = /\b(interest rate|inflation|central bank|fed |tariff|trade war|gdp|recession|bond yield|monetary policy|fiscal|sanctions|geopolit)\b/;
    if (macroSignals.test(text)) return 'MACRO';

    const aiSignals = /\b(artificial intelligence|llm|gpt|transformer|neural|machine learning|deep learning|ai model|foundation model|openai|anthropic|google ai)\b/;
    if (aiSignals.test(text)) return 'AI_TECH';

    // Default to MACRO for uncategorized
    return 'MACRO';
}

const LENS_PROMPTS = {
    TCU: `LENS: TCU (Canadian Multifamily Developer)
You are scoring for a Canadian GP/developer building purpose-built rental apartments (PBRA) in Ottawa and the GTA, financed through CMHC MLI Select.

Score against: "Does this materially affect cap rates, construction costs, rent trajectories, debt availability, policy/zoning, or competitor behavior for this exact profile?"
- 90-100: Reader would change a decision (start/stop a project, restructure financing, change market) because of this
- 70-89: Material context — reader adjusts mental model but doesn't change a decision today
- 50-69: General CRE interest but not specific to Canadian PBRA/CMHC financing
- Below 50: Tangentially related or irrelevant noise

intelligence_tag rules:
- "Opportunity" ONLY when article identifies a specific actionable opportunity for a Canadian PBRA developer (new program, market dislocation, policy opening) — NOT just "a company did a good deal"
- "Risk" when it identifies a threat: rate hike impact, construction cost surge, policy tightening, vacancy spike, CMHC rule change
- "Trending" when a topic is receiving unusual attention volume in CRE circles
- "Neutral" for background context with no clear signal`,

    AI_TECH: `LENS: AI/Tech Investor
You are scoring for a technology-aware investor tracking AI capability shifts, funding, M&A, enterprise adoption, and regulatory moves.

Score against: "Does this move the AI frontier in capability, cost, or regulation — OR is it a meaningful business/investor signal?"
- 90-100: Benchmark movement, major funding round with named institutional investors, regulatory action, paradigm shift
- 70-89: Significant enterprise adoption signal, notable M&A, analyst piece with novel thesis
- 50-69: Incremental product updates, competent but routine coverage
- Below 50: Vendor product announcements, tutorials, demo videos, listicles

DOWNRANK: vendor marketing, product launch press releases, "how to use X" tutorials, demo videos
UPRANK: benchmark data, funding rounds with named lead investors, regulatory actions, analyst deep-dives

intelligence_tag rules:
- "Opportunity" ONLY for specific investable signals: new market opening, cost structure break, regulatory clarity
- "Risk" for regulatory threat, competitive moat erosion, bubble indicators
- "Trending" for unusual attention surge on a capability or company
- "Neutral" for routine coverage`,

    MACRO: `LENS: Institutional Macro
You are scoring for an institutional investor who deploys capital across asset classes and needs to track durable macro signals.

Score against: "Is this a durable macro signal that would change portfolio positioning or risk assessment?"
- 90-100: Central bank decision, major policy shift, systemic risk event, trade regime change
- 70-89: Leading indicator movement, significant regulatory proposal, major geopolitical escalation with economic consequence
- 50-69: Single-stock earnings, daily market commentary, consumer news
- Below 50: Routine market recap, opinion without data, social media reaction stories

DOWNRANK: single-stock earnings transcripts, daily market color, consumer product news, celebrity/entertainment
UPRANK: central bank decisions, inflation data releases, trade/tariff shifts, systemic risk signals, sovereign debt moves

intelligence_tag rules:
- "Opportunity" ONLY for specific capital deployment windows: rate pivot signal, distressed asset wave, regulatory arbitrage
- "Risk" for systemic threats: credit tightening, contagion risk, policy uncertainty freezing capital
- "Trending" for rapid attention shift on a macro theme
- "Neutral" for background context`
};

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

        const durationMs = Date.now() - startTime;
        console.log(`[enrichFeedItems] Done — enriched=${enriched} failed=${failed} duration=${durationMs}ms`);
        return Response.json({ enriched, failed, skipped: needsEnrichment.length - enriched - failed, duration_ms: durationMs });
    } catch (error) {
        console.error('[enrichFeedItems] Unhandled error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});