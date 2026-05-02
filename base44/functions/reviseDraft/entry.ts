import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * reviseDraft — takes a PublicationPost, user feedback, and regenerates drafts.
 *
 * Params:
 *   post_id — required
 *   feedback — required, user's revision instructions
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}

    const { post_id, feedback } = body;
    if (!post_id || !feedback) {
        return Response.json({ error: 'post_id and feedback required' }, { status: 400 });
    }

    // Load post
    const posts = extractItems(await base44.asServiceRole.entities.PublicationPost.filter({ id: post_id }, '-created_date', 1));
    const post = posts[0];
    if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });

    // Load publication
    const pubs = extractItems(await base44.entities.Publication.filter({ id: post.publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });

    // Load cluster for context
    let cluster = null;
    if (post.cluster_id) {
        const clusters = extractItems(await base44.asServiceRole.entities.StoryCluster.filter({ id: post.cluster_id }, '-created_date', 1));
        cluster = clusters[0];
    }

    // Fetch source articles for context
    let articlesContext = '';
    if (cluster?.article_ids?.length > 0) {
        const sourceArticles = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
            { id: { $in: cluster.article_ids.slice(0, 5) } }, '-published_date', 5
        ));
        articlesContext = sourceArticles.map((a, i) => {
            const parts = [`Source ${i + 1}: ${a.title}`];
            if (a.url) parts.push(`URL: ${a.url}`);
            if (a.description) parts.push(`Description: ${a.description.slice(0, 400)}`);
            return parts.join('\n');
        }).join('\n\n');
    }

    // Load voice examples
    const voiceExamples = extractItems(await base44.asServiceRole.entities.PublicationVoiceExample.filter(
        { publication_id: pub.id, use_in_prompts: true }, '-created_date', 5
    ));
    const examplesBlock = voiceExamples.length > 0
        ? `\n\nVoice/style examples:\n${voiceExamples.map((v, i) => `Example ${i + 1} (${v.example_label || 'post'}):\n${(v.example_content || []).join('\n---\n')}`).join('\n\n')}`
        : '';

    // Build previous drafts context
    const prevVariants = post.draft_variants || [];
    const prevDraftsText = prevVariants.map((v, i) =>
        `Previous ${v.label || 'variant ' + i}:\n${(v.content || []).join('\n---\n')}`
    ).join('\n\n');

    const formatConfig = pub.post_format_config || { max_chars: 280, supports_threads: true };

    // Generate revised drafts
    let variants = [];
    try {
        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `${pub.voice_prompt || 'Write in a professional, concise voice.'}${examplesBlock}

Story: "${cluster?.representative_title || 'Unknown story'}"

--- SOURCE ARTICLES ---
${articlesContext || 'No source articles available.'}
--- END SOURCES ---

--- PREVIOUS DRAFTS ---
${prevDraftsText}
--- END PREVIOUS DRAFTS ---

USER FEEDBACK / REVISION REQUEST:
"${feedback}"

Based on the user's feedback above, revise the drafts. Apply the requested changes precisely.

CRITICAL INSTRUCTIONS:
- Apply the user's feedback to improve/fix the drafts
- Extract specific facts from sources: names, dollar amounts, locations, dates
- Every post must end with a source link if available
- URLs on X use ~23 chars regardless of length

Generate 3 revised variants for ${pub.channel_type}:
1. "wire" — tight single post (max ${formatConfig.max_chars || 280} chars)
2. "thread" — 2-3 post thread, each max ${formatConfig.max_chars || 280} chars
3. "take" — opinionated single post (max ${formatConfig.max_chars || 280} chars)

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
        variants = result?.variants || [];
    } catch (llmErr) {
        console.error(`[reviseDraft] LLM failed: ${llmErr.message}`);
        return Response.json({ error: 'AI revision failed: ' + llmErr.message }, { status: 500 });
    }

    // Update the post with new drafts, reset to draft status
    const variantLabels = variants.map(v => (v.label || '').toLowerCase());
    const preferred = (pub.preferred_variant || 'wire').toLowerCase();
    let chosenIndex = variantLabels.indexOf(preferred);
    if (chosenIndex === -1) chosenIndex = 0;

    await base44.asServiceRole.entities.PublicationPost.update(post_id, {
        draft_variants: variants,
        chosen_variant_index: chosenIndex,
        status: 'draft',
        human_notes: `Revised: ${feedback}`,
    });

    return Response.json({
        success: true,
        variants_count: variants.length,
        feedback_applied: feedback,
    });
});