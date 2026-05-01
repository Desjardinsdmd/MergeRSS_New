import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getPublicationCandidates — returns cluster candidates from the last 24 hours.
 * 
 * Rolling 24h window. Excludes already-posted and already-skipped clusters.
 * Sorted by recency (newest first) by default.
 *
 * Params:
 *   publication_id — required
 *   limit — max candidates to return (default 100)
 *   sort — 'newest' (default) or 'sources'
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

    const { publication_id, limit = 100, sort = 'newest' } = body;
    if (!publication_id) return Response.json({ error: 'publication_id required' }, { status: 400 });

    // Load publication
    const pubs = extractItems(await base44.entities.Publication.filter({ id: publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });

    // Load lens (optional — for informational scores)
    const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ id: pub.lens_id }, '-created_date', 1));
    const lens = lenses[0];

    // Load feedback history
    const feedbackRaw = extractItems(await base44.asServiceRole.entities.SelectionFeedback.filter(
        { publication_id }, '-created_date', 500
    ));
    const manualSelects = feedbackRaw.filter(f => f.action === 'manual_select').length;
    const skips = feedbackRaw.filter(f => f.action === 'skip' || f.action === 'reject').length;

    // Skipped cluster IDs (last 48h — don't resurface skipped stories)
    const skipCutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const recentSkippedIds = new Set(
        feedbackRaw
            .filter(f => (f.action === 'skip' || f.action === 'reject') && f.created_date >= skipCutoff)
            .map(f => f.cluster_id)
    );

    // Rolling 24h window
    const windowCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Load active clusters updated in the last 24h
    const activeRaw = await base44.asServiceRole.entities.StoryCluster.filter(
        { status: 'active', updated_date: { $gte: windowCutoff } }, '-updated_date', 300
    );
    const allClusters = extractItems(activeRaw);

    // Dedup: get recently posted cluster IDs
    const recentPosts = extractItems(await base44.asServiceRole.entities.PublicationPost.filter(
        { publication_id: pub.id, created_date: { $gte: skipCutoff } }, '-created_date', 50
    ));
    const recentClusterIds = new Set(recentPosts.map(p => p.cluster_id).filter(Boolean));

    // Map clusters to candidate objects — exclude posted and skipped
    const candidates = [];
    for (const c of allClusters) {
        if (recentClusterIds.has(c.id)) continue;
        if (recentSkippedIds.has(c.id)) continue;

        const lensAgg = lens
            ? (c.custom_lens_aggregates || []).find(a => a.lens_id === lens.id)
            : null;

        candidates.push({
            id: c.id,
            title: c.representative_title,
            category: c.category,
            tags: c.tags || [],
            source_count: c.source_count || 1,
            article_count: c.article_count || 1,
            source_domains: c.source_domains || [],
            first_seen_at: c.first_seen_at,
            last_updated_at: c.last_updated_at,
            intelligence_tag: lensAgg?.intelligence_tag || c.intelligence_tag || 'Neutral',
            lens_score: lensAgg?.max_importance_score || null,
        });
    }

    // Sort
    if (sort === 'sources') {
        candidates.sort((a, b) => b.source_count - a.source_count);
    } else {
        candidates.sort((a, b) => {
            const da = a.last_updated_at || a.first_seen_at || '';
            const db = b.last_updated_at || b.first_seen_at || '';
            return db.localeCompare(da);
        });
    }

    return Response.json({
        candidates: candidates.slice(0, limit),
        total_clusters: candidates.length,
        window_hours: 24,
        lens_name: lens?.name || null,
        feedback_stats: {
            total: feedbackRaw.length,
            manual_selects: manualSelects,
            skips,
        },
    });
});