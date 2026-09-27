import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * refreshMyFeeds — user-scoped "Refresh" for the Feeds page.
 *
 * fetchFeeds is admin/scheduler-only, so regular users refresh through here. Loads the
 * caller's own feeds (status active or error), stalest first, and fetches up to MAX_FEEDS
 * of them by invoking fetchSingleFeed as the caller (which re-checks ownership), within a
 * fixed time budget.
 *
 * Body: { feed_ids?: string[] }  optional subset (still intersected with the caller's feeds)
 * Returns: { success, refreshed, failed, new_items, remaining, results: [{feed_id, ok, new_items, error}] }
 */
const MAX_FEEDS = 25;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 45000;
const PER_FEED_TIMEOUT_MS = 22000;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const requested = Array.isArray(body.feed_ids) && body.feed_ids.length ? new Set(body.feed_ids.map(String)) : null;

        const own = extractItems(await base44.asServiceRole.entities.Feed.filter(
            { created_by: user.email, status: { $in: ['active', 'error'] } }, 'last_fetched', 1000, 0,
            ['id', 'name', 'status', 'source_type', 'last_fetched', 'created_by']))
            .filter(f => f.created_by === user.email)
            .filter(f => f.source_type !== 'generated')
            .filter(f => !requested || requested.has(f.id));

        own.sort((a, b) => new Date(a.last_fetched || 0).getTime() - new Date(b.last_fetched || 0).getTime());
        const batch = own.slice(0, MAX_FEEDS);

        const started = Date.now();
        const results = [];
        let cursor = 0;

        async function worker() {
            while (cursor < batch.length) {
                if (Date.now() - started > TIME_BUDGET_MS) return;
                const feed = batch[cursor++];
                try {
                    const res = await Promise.race([
                        base44.functions.invoke('fetchSingleFeed', { feed_id: feed.id }),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), PER_FEED_TIMEOUT_MS)),
                    ]);
                    const data = res?.data || {};
                    results.push({ feed_id: feed.id, name: feed.name, ok: data.success !== false, new_items: data.new_items || 0, error: data.error || null });
                } catch (e) {
                    const msg = e?.response?.data?.error || e?.message || 'fetch failed';
                    results.push({ feed_id: feed.id, name: feed.name, ok: false, new_items: 0, error: msg });
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

        const refreshed = results.filter(r => r.ok).length;
        return Response.json({
            success: true,
            refreshed,
            failed: results.length - refreshed,
            new_items: results.reduce((s, r) => s + (r.new_items || 0), 0),
            remaining: own.length - results.length,
            results,
        });
    } catch (error) {
        return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
    }
});
