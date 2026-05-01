import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getPublicationCandidates — returns unranked cluster candidates for a publication.
 * 
 * Sorted by recency (newest first). No algorithmic ranking.
 * Lens scores included for informational display only.
 * Feedback history tracked for future learning.
 *
 * Params:
 *   publication_id — required
 *   limit — max candidates to return (default 50)
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

    const { publication_id, limit = 50, sort = 'newest' } = body;
    if (!publication_id) return Response.json({ error: 'publication_id required' }, { status: 400 });

    // Load publication
    const pubs = extractItems(await base44.entities.Publication.filter({ id: publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });

    // Load lens (optional — for informational scores)
    const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ id: pub.lens_id }, '-created_date', 1));
    const lens = lenses[0];

    // Load feedback history for learning stats
    const feedbackRaw = extractItems(await base44.asServiceRole.entities.SelectionFeedback.filter(
        { publication_id }, '-created_date', 200
    ));
    const manualSelects = feedbackRaw.filter(f => f.action === 'manual_select').length;
    const skips = feedbackRaw.filter(f => f.action === 'skip' || f.action === 'reject').length;

    // Load ALL active clusters — no threshold gating
    const activeRaw = await base44.asServiceRole.entities.StoryCluster.filter(
        { status: 'active' }, '-updated_date', 300
    );
    const allClusters = extractItems(activeRaw);

    // Dedup: get recently posted cluster IDs
    const dedupCutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const recentPosts = extractItems(await base44.asServiceRole.entities.PublicationPost.filter(
        { publication_id: pub.id, created_date: { $gte: dedupCutoff } }, '-created_date', 50
    ));
    const recentClusterIds = new Set(recentPosts.map(p => p.cluster_id).filter(Boolean));

    // Map clusters to candidate objects — no ranking, just data
    const candidates = allClusters.map(c => {
        const lensAgg = lens
            ? (c.custom_lens_aggregates || []).find(a => a.lens_id === lens.id)
            : null;

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
            intelligence_tag: lensAgg?.intelligence_tag || c.intelligence_tag || 'Neutral',
            lens_score: lensAgg?.max_importance_score || null,
            already_posted: recentClusterIds.has(c.id),
        };
    });

    // Sort by user preference — no algorithmic ranking
    if (sort === 'sources') {
        candidates.sort((a, b) => b.source_count - a.source_count);
    } else {
        // newest first
        candidates.sort((a, b) => {
            const da = a.last_updated_at || a.first_seen_at || '';
            const db = b.last_updated_at || b.first_seen_at || '';
            return db.localeCompare(da);
        });
    }

    return Response.json({
        candidates: candidates.slice(0, limit),
        total_clusters: allClusters.length,
        lens_name: lens?.name || null,
        feedback_stats: {
            total: feedbackRaw.length,
            manual_selects: manualSelects,
            skips,
        },
    });
});