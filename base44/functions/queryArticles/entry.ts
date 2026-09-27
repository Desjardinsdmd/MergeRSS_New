import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * queryArticles — the ONLY path the frontend uses to read articles and story clusters.
 *
 * Tenant rule: a user only ever sees articles from feeds they own, plus feeds shared into
 * their ACTIVE team workspace (Feed.workspace_id, resolved server-side from the caller's own
 * active WorkspaceMember row, and only while the sharing member is still active). Requested
 * feed_ids are intersected with that set server-side; anything else is ignored.
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
 *   author?          string    case-insensitive match on author
 *   q?               string    case-insensitive keyword match on title / description / ai_summary / content,
 *                              across the caller's full history (not just the latest page)
 *   enrichment_status? string
 *   sort?            '-published_date' (default) | '-importance_score'
 *   limit?           number    max 500 (default 100)
 *   include_clusters? boolean  also return trimmed StoryCluster data for the items
 *   scope?           'mine' (default) | 'all' (admin only)
 *   include_shared?  boolean   default true; false limits results to the caller's own feeds
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
// Feeds shared into the caller's active team workspace. Never trusts client input.
async function sharedFeedIds(svc, email) {
    const me = String(email || '').trim().toLowerCase();
    const rows = extractItems(await svc.WorkspaceMember.filter({ user_email: me, status: 'active' }, '-created_date', 5).catch(() => []));
    for (const m of rows) {
        const ws = await svc.Workspace.get(m.workspace_id).catch(() => null);
        if (!ws || ws.status === 'deleted') continue;
        const active = new Set(extractItems(await svc.WorkspaceMember.filter({ workspace_id: ws.id, status: 'active' }, '-created_date', 200))
            .map(x => String(x.user_email || '').toLowerCase()));
        return extractItems(await svc.Feed.filter({ workspace_id: ws.id }, '-created_date', 1000, 0, ['id', 'created_by']))
            .filter(f => active.has(String(f.created_by || '').toLowerCase()))
            .map(f => f.id);
    }
    return [];
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SEARCH_FIELDS = ['title', 'description', 'ai_summary', 'content'];
const SCAN_CAP = 5000;
const SCAN_PAGE = 500;

/**
 * Keyword search over the (already tenant-scoped) base query. Tries a server-side $or/$regex
 * filter first; if the store rejects it, falls back to scanning up to SCAN_CAP items in pages
 * (newest first) and filtering here. Either way the result is sorted and capped to `limit`.
 */
async function keywordSearch(svc, baseQuery, q, sort, limit) {
    const rx = escapeRegex(q);
    try {
        const query = { ...baseQuery, $or: SEARCH_FIELDS.map(f => ({ [f]: { $regex: rx, $options: 'i' } })) };
        return extractItems(await svc.FeedItem.filter(query, sort, limit));
    } catch (err) {
        console.warn('[queryArticles] $or/$regex search failed, scanning instead:', err?.message);
    }
    const needle = q.toLowerCase();
    const matches = [];
    for (let skip = 0; skip < SCAN_CAP; skip += SCAN_PAGE) {
        const page = extractItems(await svc.FeedItem.filter(baseQuery, sort, SCAN_PAGE, skip));
        for (const it of page) {
            if (SEARCH_FIELDS.some(f => typeof it[f] === 'string' && it[f].toLowerCase().includes(needle))) {
                matches.push(it);
                if (matches.length >= limit) return matches;
            }
        }
        if (page.length < SCAN_PAGE) break;
    }
    return matches;
}

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
            if (body.include_shared !== false) {
                const shared = await sharedFeedIds(svc, user.email).catch((e) => {
                    console.warn('[queryArticles] shared feed lookup failed:', e?.message);
                    return [];
                });
                for (const id of shared) ownFeedIds.add(id);
            }
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
        const q = typeof body.q === 'string' ? body.q.trim().slice(0, 200) : '';

        const sort = SORTS.has(body.sort) ? body.sort : '-published_date';
        const limit = Math.min(Math.max(Number(body.limit) || 100, 1), MAX_LIMIT);
        let items;
        if (q) {
            items = await keywordSearch(svc, query, q, sort, limit);
        } else {
            items = extractItems(await svc.FeedItem.filter(query, sort, limit));
        }

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
