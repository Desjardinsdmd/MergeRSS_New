import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * runPublicationScheduler — generates draft PublicationPosts for due Publications.
 *
 * Called on a schedule (every 15 min) or manually via "Run now" button.
 * For each Publication where next_run_at <= now and status != paused:
 *   1. Find top clusters scored under the Publication's lens
 *   2. Generate draft variants via LLM
 *   3. Create a PublicationPost in draft status
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

    const body = await req.json().catch(() => ({}));
    const { publication_id, force } = body;

    // Auth: must be logged in
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // If publication_id provided, run just that one (manual trigger)
    let publications = [];
    if (publication_id) {
        const pub = extractItems(await base44.entities.Publication.filter({ id: publication_id }, '-created_date', 1));
        publications = pub;
    } else {
        // Admin-only for scheduled runs
        if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        // Find all publications due
        const now = new Date().toISOString();
        const allPubs = extractItems(await base44.asServiceRole.entities.Publication.filter(
            { status: { $ne: 'paused' } }, '-created_date', 100
        ));
        publications = force ? allPubs : allPubs.filter(p => p.next_run_at && p.next_run_at <= now);
    }

    if (!publications.length) {
        return Response.json({ processed: 0, reason: 'no_publications_due' });
    }

    const results = [];

    for (const pub of publications) {
        try {
            // Load the lens
            const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter(
                { id: pub.lens_id }, '-created_date', 1
            ));
            const lens = lenses[0];
            if (!lens) {
                results.push({ publication: pub.name, error: 'Lens not found' });
                continue;
            }

            // Find clusters that actually have lens aggregates for this lens.
            // We query broadly (active clusters, sorted by recency of system update)
            // and then JS-filter for lens eligibility, because the DB can't filter
            // on nested array fields and a naive importance_score sort gets swamped
            // by stale high-score clusters with no lens data.
            const allActive = extractItems(await base44.asServiceRole.entities.StoryCluster.filter(
                { status: 'active' },
                '-updated_date', 200
            ));
            // Only keep clusters whose lens aggregates include this lens
            const clusters = allActive.filter(c =>
                (c.custom_lens_aggregates || []).some(a => a.lens_id === lens.id)
            );

            // Filter to clusters that have a lens aggregate for this lens above threshold
            const scored = clusters
                .map(c => {
                    const agg = (c.custom_lens_aggregates || []).find(a => a.lens_id === lens.id);
                    if (!agg || agg.max_importance_score < lens.minimum_score_threshold) return null;
                    // Combined score: 60% trend_score + 40% lens max_importance
                    const combinedScore = ((c.trend_score || c.importance_score || 0) * 0.6) + (agg.max_importance_score * 0.4);
                    return { cluster: c, agg, combinedScore };
                })
                .filter(Boolean)
                .sort((a, b) => b.combinedScore - a.combinedScore);

            const candidateCount = pub.candidates_per_run || 3;
            const topCandidates = scored.slice(0, candidateCount);

            if (!topCandidates.length) {
                results.push({ publication: pub.name, error: 'No eligible clusters found' });
                // Update next_run_at even if nothing found
                await updateNextRun(base44, pub);
                continue;
            }

            const selected = topCandidates[0];
            const candidatePool = topCandidates.slice(1).map(c => c.cluster.id);

            // Generate selection reason
            let selectionReason = '';
            try {
                selectionReason = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: `In one sentence, explain why "${selected.cluster.representative_title}" (importance: ${selected.agg.max_importance_score}, sources: ${selected.cluster.source_count}, tag: ${selected.agg.intelligence_tag}) was chosen as the top story for a publication focused on: "${lens.audience_description || lens.name}". Be concise.`
                });
            } catch { selectionReason = 'Highest combined trend and lens score.'; }

            // Load voice examples
            const voiceExamples = extractItems(await base44.asServiceRole.entities.PublicationVoiceExample.filter(
                { publication_id: pub.id, use_in_prompts: true }, '-created_date', 5
            ));
            const examplesBlock = voiceExamples.length > 0
                ? `\n\nHere are examples of the desired voice and style:\n${voiceExamples.map((v, i) => `Example ${i + 1} (${v.example_label || 'post'}):\n${(v.example_content || []).join('\n---\n')}`).join('\n\n')}`
                : '';

            // Generate draft variants
            const formatConfig = pub.post_format_config || { max_chars: 280, supports_threads: true };
            let variants = [];
            try {
                const draftResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: `${pub.voice_prompt || 'Write in a professional, concise voice.'}${examplesBlock}

Story: "${selected.cluster.representative_title}"
Summary: ${selected.agg.ai_summary || selected.cluster.representative_title}
Sources: ${selected.cluster.source_count} sources, ${selected.cluster.article_count} articles
Intelligence tag: ${selected.agg.intelligence_tag}

Generate 3 draft variants for posting to ${pub.channel_type}:
1. "wire" — a tight single post (max ${formatConfig.max_chars || 280} chars) that delivers the key signal.
2. "thread" — a 2-3 post thread that unpacks the story with context. Each post max ${formatConfig.max_chars || 280} chars.
3. "take" — an opinionated single post (max ${formatConfig.max_chars || 280} chars) with analysis angle.

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
                console.error(`[runPublicationScheduler] Draft generation failed: ${llmErr.message}`);
                variants = [{ label: 'wire', content: [selected.cluster.representative_title] }];
            }

            // Create PublicationPost
            await base44.asServiceRole.entities.PublicationPost.create({
                publication_id: pub.id,
                cluster_id: selected.cluster.id,
                candidate_pool: candidatePool,
                selection_reason: typeof selectionReason === 'string' ? selectionReason : JSON.stringify(selectionReason),
                draft_variants: variants,
                status: 'draft',
            });

            // Update Publication timestamps
            await updateNextRun(base44, pub);

            results.push({ publication: pub.name, cluster: selected.cluster.representative_title, variants: variants.length });
        } catch (pubErr) {
            console.error(`[runPublicationScheduler] Error for ${pub.name}: ${pubErr.message}`);
            results.push({ publication: pub.name, error: pubErr.message });
        }
        await sleep(100);
    }

    return Response.json({ processed: results.length, results });
});

async function updateNextRun(base44, pub) {
    // Simple next-run calculation: add 24h from now (cron parsing is complex; this is v1)
    const nextRun = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await base44.asServiceRole.entities.Publication.update(pub.id, {
        last_run_at: new Date().toISOString(),
        next_run_at: nextRun,
    }).catch(() => {});
}