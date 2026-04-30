import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getPublicationCandidates — returns ranked cluster candidates for a publication.
 * 
 * Params:
 *   publication_id — required
 *   limit — max candidates to return (default 30)
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

    const { publication_id, limit = 30 } = body;
    if (!publication_id) return Response.json({ error: 'publication_id required' }, { status: 400 });

    // Load publication
    const pubs = extractItems(await base44.entities.Publication.filter({ id: publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });

    // Load lens
    const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ id: pub.lens_id }, '-created_date', 1));
    const lens = lenses[0];
    if (!lens) return Response.json({ error: 'Lens not found' }, { status: 404 });

    // Load feedback to compute boost scores
    const feedbackRaw = extractItems(await base44.asServiceRole.entities.SelectionFeedback.filter(
        { publication_id, action: 'manual_select' }, '-created_date', 100
    ));
    // Build a set of manually selected categories and source domains for boosting
    const manualCategories = {};
    const manualSources = {};
    for (const fb of feedbackRaw) {
        if (fb.cluster_category) {
            manualCategories[fb.cluster_category] = (manualCategories[fb.cluster_category] || 0) + 1;
        }
    }

    // Load clusters with lens data
    const [activeRaw, staleRaw] = await Promise.all([
        base44.asServiceRole.entities.StoryCluster.filter({ status: 'active' }, '-updated_date', 200),
        base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'stale', 'custom_lens_aggregates.lens_id': lens.id }, '-updated_date', 200
        ),
    ]);
    const allClusters = [...extractItems(activeRaw), ...extractItems(staleRaw)];

    // Filter to clusters with lens data
    const withLens = allClusters.filter(c =>
        (c.custom_lens_aggregates || []).some(a => a.lens_id === lens.id)
    );

    // Dedup: get recently posted cluster IDs
    const dedupCutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const recentPosts = extractItems(await base44.asServiceRole.entities.PublicationPost.filter(
        { publication_id: pub.id, created_date: { $gte: dedupCutoff } }, '-created_date', 50
    ));
    const recentClusterIds = new Set(recentPosts.map(p => p.cluster_id).filter(Boolean));

    // Score and rank
    const scored = withLens.map(c => {
        const agg = (c.custom_lens_aggregates || []).find(a => a.lens_id === lens.id);
        if (!agg) return null;

        const lensScore = agg.max_importance_score || 0;
        const trendScore = c.trend_score || c.importance_score || 0;
        let combinedScore = (trendScore * 0.6) + (lensScore * 0.4);

        // Feedback boost: categories the user manually picks get a small boost
        const catBoost = manualCategories[c.category] ? Math.min(manualCategories[c.category] * 2, 10) : 0;
        combinedScore += catBoost;

        const alreadyPosted = recentClusterIds.has(c.id);

        return {
            id: c.id,
            title: c.representative_title,
            category: c.category,
            tags: c.tags || [],
            source_count: c.source_count || 1,
            article_count: c.article_count || 1,
            source_domains: c.source_domains || [],
            first_seen_at: c.first_seen_at,
            last_updated_at: c.last_updated_at,
            lens_score: lensScore,
            trend_score: trendScore,
            combined_score: Math.round(combinedScore * 10) / 10,
            intelligence_tag: agg.intelligence_tag || 'Neutral',
            ai_summary: agg.ai_summary || '',
            feedback_boost: catBoost,
            already_posted: alreadyPosted,
            status: c.status,
            above_threshold: lensScore >= (lens.minimum_score_threshold || 40),
        };
    }).filter(Boolean).sort((a, b) => b.combined_score - a.combined_score);

    return Response.json({
        candidates: scored.slice(0, limit),
        total_with_lens: withLens.length,
        total_clusters: allClusters.length,
        threshold: lens.minimum_score_threshold || 40,
        lens_name: lens.name,
        feedback_count: feedbackRaw.length,
    });
});