import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * manualSelectCluster — user manually picks a cluster to generate a draft post.
 * Records SelectionFeedback for learning and creates a PublicationPost.
 *
 * Params:
 *   publication_id — required
 *   cluster_id — required
 *   user_notes — optional
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}

    const { publication_id, cluster_id, user_notes } = body;
    if (!publication_id || !cluster_id) {
        return Response.json({ error: 'publication_id and cluster_id required' }, { status: 400 });
    }

    // Load publication
    const pubs = extractItems(await base44.entities.Publication.filter({ id: publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });

    // Load lens
    const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ id: pub.lens_id }, '-created_date', 1));
    const lens = lenses[0];
    if (!lens) return Response.json({ error: 'Lens not found' }, { status: 404 });

    // Load cluster
    const clusters = extractItems(await base44.asServiceRole.entities.StoryCluster.filter({ id: cluster_id }, '-created_date', 1));
    const cluster = clusters[0];
    if (!cluster) return Response.json({ error: 'Cluster not found' }, { status: 404 });

    const agg = (cluster.custom_lens_aggregates || []).find(a => a.lens_id === lens.id);
    const lensScore = agg?.max_importance_score || 0;
    const trendScore = cluster.trend_score || cluster.importance_score || 0;
    const combinedScore = (trendScore * 0.6) + (lensScore * 0.4);

    // Record feedback
    await base44.asServiceRole.entities.SelectionFeedback.create({
        publication_id,
        cluster_id,
        lens_id: lens.id,
        action: 'manual_select',
        original_score: Math.round(combinedScore * 10) / 10,
        lens_score: lensScore,
        cluster_title: cluster.representative_title,
        cluster_category: cluster.category || '',
        cluster_source_count: cluster.source_count || 1,
        user_notes: user_notes || '',
    });

    // Fetch source articles
    const articleIds = cluster.article_ids || [];
    let sourceArticles = [];
    if (articleIds.length > 0) {
        sourceArticles = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
            { id: { $in: articleIds.slice(0, 10) } }, '-published_date', 10
        ));
    }

    const articlesContext = sourceArticles.map((a, i) => {
        const parts = [`Source ${i + 1}: ${a.title}`];
        if (a.url) parts.push(`URL: ${a.url}`);
        if (a.description) parts.push(`Description: ${a.description.slice(0, 500)}`);
        if (a.content && a.content !== a.description) parts.push(`Content excerpt: ${a.content.slice(0, 800)}`);
        if (a.author) parts.push(`Author: ${a.author}`);
        if (a.published_date) parts.push(`Published: ${a.published_date}`);
        return parts.join('\n');
    }).join('\n\n');

    // Load voice examples
    const voiceExamples = extractItems(await base44.asServiceRole.entities.PublicationVoiceExample.filter(
        { publication_id: pub.id, use_in_prompts: true }, '-created_date', 5
    ));
    const examplesBlock = voiceExamples.length > 0
        ? `\n\nHere are examples of the desired voice and style:\n${voiceExamples.map((v, i) => `Example ${i + 1} (${v.example_label || 'post'}):\n${(v.example_content || []).join('\n---\n')}`).join('\n\n')}`
        : '';

    // Generate drafts
    const formatConfig = pub.post_format_config || { max_chars: 280, supports_threads: true };
    let variants = [];
    try {
        const draftResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `${pub.voice_prompt || 'Write in a professional, concise voice.'}${examplesBlock}

Story: "${cluster.representative_title}"
Intelligence tag: ${agg?.intelligence_tag || 'Neutral'}
Sources: ${cluster.source_count || 1} sources, ${cluster.article_count || 1} articles

--- SOURCE ARTICLES ---
${articlesContext || 'No source articles available.'}
--- END SOURCES ---

CRITICAL INSTRUCTIONS:
- Extract specific facts from the source articles: names, dollar amounts, unit counts, square footage, locations, dates, percentages.
- Do NOT use vague filler phrases. State what happened.
- Every post must contain at least one concrete detail from the sources.

IMPORTANT: Every variant MUST end with a link to the primary source article. Use this URL: ${sourceArticles[0]?.url || '(no URL available)'}
The link counts toward the character limit. URLs on X use ~23 chars regardless of length.

Generate 3 draft variants for posting to ${pub.channel_type}:
1. "wire" — a tight single post (max ${formatConfig.max_chars || 280} chars)
2. "thread" — a 2-3 post thread. Each post max ${formatConfig.max_chars || 280} chars.
3. "take" — an opinionated single post (max ${formatConfig.max_chars || 280} chars)

Return as JSON.`,
            response_json_schema: {
                type: "object",
                properties: {
                    variants: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                label: { type: "string" },
                                content: { type: "array", items: { type: "string" } }
                            },
                            required: ["label", "content"]
                        }
                    }
                },
                required: ["variants"]
            }
        });
        variants = draftResult?.variants || [];
    } catch (llmErr) {
        console.error(`[manualSelectCluster] Draft generation failed: ${llmErr.message}`);
        variants = [{ label: 'wire', content: [cluster.representative_title] }];
    }

    // Determine chosen variant index
    const variantLabels = variants.map(v => (v.label || '').toLowerCase());
    const preferred = (pub.preferred_variant || 'wire').toLowerCase();
    let chosenIndex = variantLabels.indexOf(preferred);
    if (chosenIndex === -1) chosenIndex = 0;

    // Create PublicationPost
    const postData = {
        publication_id: pub.id,
        cluster_id: cluster.id,
        candidate_pool: [],
        selection_reason: `Manually selected by ${user.full_name || user.email}${user_notes ? ': ' + user_notes : ''}`,
        draft_variants: variants,
        chosen_variant_index: chosenIndex,
        status: 'draft',
    };

    const createdPost = await base44.asServiceRole.entities.PublicationPost.create(postData);

    return Response.json({
        success: true,
        post_id: createdPost?.id,
        variants_count: variants.length,
        feedback_recorded: true,
    });
});