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
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 }); // publications are admin-only

    let body = {};
    try { body = await req.json(); } catch {}

    const { publication_id, limit = 100, sort = 'newest' } = body;
    if (!publication_id) return Response.json({ error: 'publication_id required' }, { status: 400 });

    // Load publication
    const pubs = extractItems(await base44.entities.Publication.filter({ id: publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });

    // Load lens (optional — for informational scores and threshold enforcement)
    const lenses = extractItems(await base44.asServiceRole.entities.CustomLens.filter({ id: pub.lens_id }, '-created_date', 1));
    const lens = lenses[0];
    const minimumScoreThreshold = lens?.minimum_score_threshold ?? 0;

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

    // Rolling window (2026-09-25: widened from 24h to 72h; the Stack sources publish
    // ~2 relevant stories a day, so 24h left the queue nearly empty most of the time)
    const WINDOW_HOURS = body.window_hours || 72;
    const windowCutoff = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

    // Load user's own feed IDs to restrict pipeline to their sources only
    const userFeedsRaw = extractItems(await base44.asServiceRole.entities.Feed.filter(
        { created_by: user.email }, '-created_date', 500
    ));
    const userFeedIds = new Set(userFeedsRaw.map(f => f.id));

    // Load clusters server-side, scoped to the user's feeds and the window. Previously this
    // pulled the 300 most recently updated clusters across ALL users and filtered after,
    // so other accounts' high-volume feeds could push relevant clusters out of the page.
    // Stale clusters inside the window are included: "stale" only means no new articles.
    const allClustersRaw = userFeedIds.size ? extractItems(await base44.asServiceRole.entities.StoryCluster.filter(
        {
            status: { $in: ['active', 'stale'] },
            feed_ids: { $in: [...userFeedIds] },
            last_updated_at: { $gte: windowCutoff },
        },
        '-last_updated_at', 300
    )) : [];

    // Apply 24h window AND restrict to clusters that contain at least one of the user's feeds
    const nowIso = new Date().toISOString();
    const allClusters = allClustersRaw.filter(c => {
        const ts = c.last_updated_at || c.first_seen_at || '';
        if (ts < windowCutoff || ts > nowIso) return false;
        // Only include clusters that have at least one article from the user's feeds
        const clusterFeedIds = c.feed_ids || [];
        return clusterFeedIds.some(fid => userFeedIds.has(fid));
    });

    // Dedup: get recently posted cluster IDs
    const recentPosts = extractItems(await base44.asServiceRole.entities.PublicationPost.filter(
        // Look back at least as far as the candidate window so a story drafted or posted
        // earlier in the window never resurfaces (it was posted up to 3x before this fix).
        { publication_id: pub.id, created_date: { $gte: windowCutoff < skipCutoff ? windowCutoff : skipCutoff } }, '-created_date', 200
    ));
    const recentClusterIds = new Set(recentPosts.map(p => p.cluster_id).filter(Boolean));

    // Collect representative item IDs to fetch article URLs
    const eligibleClusters = allClusters.filter(c => !recentClusterIds.has(c.id) && !recentSkippedIds.has(c.id));
    const repItemIds = eligibleClusters.map(c => c.representative_item_id).filter(Boolean);

    // Batch-fetch representative FeedItems to get URLs
    const itemUrlMap = {};
    if (repItemIds.length > 0) {
        const repItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
            { id: { $in: repItemIds.slice(0, 200) } }, '-created_date', 200
        ));
        for (const item of repItems) {
            itemUrlMap[item.id] = item.url || null;
        }
    }

    // Map clusters to candidate objects, enforcing lens minimum score threshold
    const candidates = [];
    for (const c of eligibleClusters) {
        const lensAgg = lens
            ? (c.custom_lens_aggregates || []).find(a => a.lens_id === lens.id)
            : null;

        const lensScore = lensAgg?.max_importance_score ?? 0;

        // Enforce lens minimum score threshold
        if (lens && lensScore < minimumScoreThreshold) continue;

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
            lens_score: lensScore,
            article_url: itemUrlMap[c.representative_item_id] || null,
        });
    }

    // Sort — default is lens_score desc with recency tie-breaker
    if (sort === 'sources') {
        candidates.sort((a, b) => b.source_count - a.source_count);
    } else {
        candidates.sort((a, b) => {
            const scoreDiff = (b.lens_score || 0) - (a.lens_score || 0);
            if (scoreDiff !== 0) return scoreDiff;
            const da = a.last_updated_at || a.first_seen_at || '';
            const db = b.last_updated_at || b.first_seen_at || '';
            return db.localeCompare(da);
        });
    }

    return Response.json({
        candidates: candidates.slice(0, limit),
        total_clusters: candidates.length,
        window_hours: WINDOW_HOURS,
        lens_name: lens?.name || null,
        feedback_stats: {
            total: feedbackRaw.length,
            manual_selects: manualSelects,
            skips,
        },
    });
});