import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * queryArticles — the ONLY path the frontend uses to read articles and story clusters.
 *
 * Tenant rule: a user only ever sees articles from feeds they own. Requested feed_ids
 * are intersected with the caller's own feeds server-side; anything else is ignored.
 * Admins can pass scope: 'all' for system-wide admin tooling.
 *
 * Storage is an implementation detail behind this function. Today it reads the legacy
 * FeedItem table; at cutover it switches to Subscription -> SourceItem -> Article with
 * no frontend change.
 *
 * Body:
 *   feed_ids?        string[]  legacy feed ids (defaults to all of the caller's feeds)
 *   since?, until?   ISO dates on published_date
 *   min_score?       number    importance_score >= n
 *   category?        string
 *   author?, q?      string    case-insensitive match on author / title
 *   enrichment_status? string
 *   sort?            '-published_date' (default) | '-importance_score'
 *   limit?           number    max 500 (default 100)
 *   include_clusters? boolean  also return trimmed StoryCluster data for the items
 *   scope?           'mine' (default) | 'all' (admin only)
 */

const MAX_LIMIT = 500;
const SORTS = new Set(['-published_date', '-importance_score', 'published_date']);
const CLUSTER_FIELDS = ['id', 'feed_ids', 'representative_title', 'trend_score', 'trend_score_components',
    'velocity_score', 'source_domains', 'importance_score', 'intelligence_tag', 'article_count', 'source_count',
    'status', 'first_seen_at', 'last_updated_at'];

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole.entities;
    const allScope = body.scope === 'all' && user.role === 'admin';

    try {
        let feedIds = null; // null = unrestricted (admin scope all)
        let ownFeedIds = null;
        if (!allScope) {
            ownFeedIds = new Set(extractItems(await svc.Feed.filter({ created_by: user.email }, '-created_date', 1000, 0, ['id'])).map(f => f.id));
            const requested = Array.isArray(body.feed_ids) && body.feed_ids.length ? body.feed_ids : [...ownFeedIds];
            feedIds = requested.filter(id => ownFeedIds.has(id));
            if (!feedIds.length) return Response.json({ items: [], clusters: [] });
        } else if (Array.isArray(body.feed_ids) && body.feed_ids.length) {
            feedIds = body.feed_ids;
        }

        const query = {};
        if (feedIds) query.feed_id = { $in: feedIds };
        if (body.since || body.until) {
            query.published_date = {};
            if (body.since) query.published_date.$gte = new Date(body.since).toISOString();
            if (body.until) query.published_date.$lte = new Date(body.until).toISOString();
        }
        if (typeof body.min_score === 'number') query.importance_score = { $gte: body.min_score };
        if (body.category) query.category = String(body.category);
        if (body.enrichment_status) query.enrichment_status = String(body.enrichment_status);
        if (body.author) query.author = { $regex: escapeRegex(String(body.author).trim()), $options: 'i' };
        if (body.q) query.title = { $regex: escapeRegex(String(body.q).trim()), $options: 'i' };

        const sort = SORTS.has(body.sort) ? body.sort : '-published_date';
        const limit = Math.min(Math.max(Number(body.limit) || 100, 1), MAX_LIMIT);
        const items = extractItems(await svc.FeedItem.filter(query, sort, limit));

        let clusters = [];
        if (body.include_clusters) {
            const ids = [...new Set(items.map(i => i.cluster_id).filter(Boolean))];
            for (let i = 0; i < ids.length; i += 100) {
                clusters.push(...extractItems(await svc.StoryCluster.filter({ id: { $in: ids.slice(i, i + 100) } }, '-trend_score', 200, 0, CLUSTER_FIELDS)));
            }
            if (ownFeedIds) {
                // Only clusters the caller actually contributes to, and only their own feed ids.
                clusters = clusters
                    .map(c => ({ ...c, feed_ids: (c.feed_ids || []).filter(id => ownFeedIds.has(id)) }))
                    .filter(c => c.feed_ids.length);
            }
        }

        return Response.json({ items, clusters });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});
