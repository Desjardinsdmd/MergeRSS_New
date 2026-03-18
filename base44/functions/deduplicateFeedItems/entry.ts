/**
 * deduplicateFeedItems — Admin cleanup job
 *
 * Scans FeedItem records for duplicate (feed_id, guid) pairs and removes
 * the newer duplicates, keeping the oldest record (by created_date).
 *
 * Run this once immediately, then schedule weekly as maintenance.
 * Admin-only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { dry_run = false, feed_id = null, limit_feeds = 500 } = body;

        const startedAt = new Date().toISOString();

        // Get feeds to scan
        const feedsRaw = feed_id
            ? [await base44.asServiceRole.entities.Feed.get(feed_id)]
            : await base44.asServiceRole.entities.Feed.filter({}, '-created_date', limit_feeds);

        const feeds = (Array.isArray(feedsRaw) ? feedsRaw : [feedsRaw]).filter(Boolean);

        let totalDuplicatesFound = 0;
        let totalDeleted = 0;
        const affectedFeeds = [];

        for (const feed of feeds) {
            // Fetch all items for this feed
            const items = await base44.asServiceRole.entities.FeedItem.filter(
                { feed_id: feed.id }, 'created_date', 1000
            );
            if (!items || items.length === 0) continue;

            // Group by guid (primary), fall back to url
            const seen = new Map(); // key -> first (oldest) item
            const toDelete = [];

            for (const item of items) {
                const key = item.guid || item.url;
                if (!key) continue;

                if (seen.has(key)) {
                    // This item is a duplicate — mark for deletion
                    toDelete.push(item.id);
                } else {
                    seen.set(key, item);
                }
            }

            if (toDelete.length === 0) continue;

            totalDuplicatesFound += toDelete.length;
            affectedFeeds.push({
                feed_name: feed.name,
                feed_id: feed.id,
                duplicates: toDelete.length,
            });

            if (!dry_run) {
                // Delete in parallel batches of 20
                for (let i = 0; i < toDelete.length; i += 20) {
                    const batch = toDelete.slice(i, i + 20);
                    await Promise.allSettled(
                        batch.map(id => base44.asServiceRole.entities.FeedItem.delete(id))
                    );
                    totalDeleted += batch.length;
                }
            }
        }

        const result = {
            dry_run,
            feeds_scanned: feeds.length,
            feeds_with_duplicates: affectedFeeds.length,
            total_duplicates_found: totalDuplicatesFound,
            total_deleted: dry_run ? 0 : totalDeleted,
            affected_feeds: affectedFeeds,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            message: dry_run
                ? `Dry run complete. Would delete ${totalDuplicatesFound} duplicate FeedItem(s) across ${affectedFeeds.length} feed(s). Re-run with dry_run: false to apply.`
                : `Cleanup complete. Deleted ${totalDeleted} duplicate FeedItem(s) across ${affectedFeeds.length} feed(s).`,
        };

        // Log to SystemHealth
        await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'feed_fetch',
            status: 'completed',
            started_at: startedAt,
            completed_at: result.completed_at,
            metadata: { type: 'dedup_cleanup', ...result },
        });

        return Response.json(result);
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});