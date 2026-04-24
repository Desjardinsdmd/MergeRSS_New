import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * risingSignals — velocity-based named-entity detection.
 *
 * Compares 7-day entity mention counts (authority-weighted) against
 * 4-week rolling baseline. Surfaces entities with 3x+ spike AND >= 3 mentions.
 * Scoped by category: CRE, AI/Tech, Macro.
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

const CATEGORY_BUCKETS = {
    CRE: ['cre'],
    'AI/Tech': ['ai', 'tech'],
    Macro: ['markets', 'finance', 'news', 'geopolitics'],
};

function categorizeToBucket(category) {
    const cat = (category || '').toLowerCase();
    for (const [bucket, cats] of Object.entries(CATEGORY_BUCKETS)) {
        if (cats.includes(cat)) return bucket;
    }
    return 'Macro'; // default
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Load user's feeds
        const userFeeds = extractItems(await base44.entities.Feed.filter(
            { created_by: user.email, status: 'active' }, '-created_date', 500
        ));
        const feedIds = userFeeds.map(f => f.id);
        if (!feedIds.length) return Response.json({ signals: {} });

        // Build feed → domain → authority map
        const allAuth = extractItems(await base44.asServiceRole.entities.SourceAuthority.list('-created_date', 500));
        const authByDomain = {};
        for (const a of allAuth) {
            if (a.domain) authByDomain[a.domain.toLowerCase()] = a;
        }
        const feedAuthority = {};
        for (const f of userFeeds) {
            try {
                const domain = new URL(f.url || '').hostname.replace(/^www\./, '');
                const auth = authByDomain[domain];
                feedAuthority[f.id] = auth?.tier === 'tier1' ? 2.0 : auth?.tier === 'tier3' ? 0.5 : 1.0;
            } catch { feedAuthority[f.id] = 1.0; }
        }
        const feedCategoryMap = {};
        for (const f of userFeeds) { feedCategoryMap[f.id] = f.category; }

        // Fetch items from last 28 days (4 weeks)
        const since28d = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
        const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const allItems = extractItems(await base44.entities.FeedItem.filter(
            { feed_id: { $in: feedIds }, published_date: { $gte: since28d }, enrichment_status: 'done' },
            '-published_date', 500
        ));

        const recent7d = allItems.filter(i => i.published_date >= since7d);
        const older = allItems.filter(i => i.published_date < since7d);

        // Count entity mentions by category bucket, weighted by authority
        function countEntities(items) {
            const counts = {}; // { bucket: { entity: weightedCount } }
            for (const item of items) {
                if (!item.entities?.length) continue;
                const bucket = categorizeToBucket(feedCategoryMap[item.feed_id] || item.category);
                const weight = feedAuthority[item.feed_id] || 1.0;
                if (!counts[bucket]) counts[bucket] = {};
                for (const entity of item.entities) {
                    const key = entity.trim();
                    if (key.length < 2) continue;
                    counts[bucket][key] = (counts[bucket][key] || 0) + weight;
                }
            }
            return counts;
        }

        const recentCounts = countEntities(recent7d);
        // Normalize older counts to a per-week baseline (divide by 3 weeks)
        const olderCounts = countEntities(older);
        const baselineCounts = {};
        for (const [bucket, entities] of Object.entries(olderCounts)) {
            baselineCounts[bucket] = {};
            for (const [entity, count] of Object.entries(entities)) {
                baselineCounts[bucket][entity] = count / 3; // 3 older weeks
            }
        }

        // Find rising signals: 3x+ spike AND >= 3 raw mentions in 7d
        const signals = {};
        for (const [bucket, entities] of Object.entries(recentCounts)) {
            const rising = [];
            // Count raw (unweighted) mentions for minimum threshold
            const rawCounts = {};
            for (const item of recent7d) {
                if (!item.entities?.length) continue;
                const itemBucket = categorizeToBucket(feedCategoryMap[item.feed_id] || item.category);
                if (itemBucket !== bucket) continue;
                for (const e of item.entities) {
                    rawCounts[e.trim()] = (rawCounts[e.trim()] || 0) + 1;
                }
            }

            for (const [entity, weightedCount] of Object.entries(entities)) {
                const baseline = baselineCounts[bucket]?.[entity] || 0;
                const rawCount = rawCounts[entity] || 0;
                if (rawCount < 3) continue; // minimum 3 mentions
                const multiplier = baseline > 0 ? weightedCount / baseline : weightedCount;
                if (multiplier < 3 && baseline > 0) continue; // 3x threshold

                // Find top 2 most authoritative articles mentioning this entity
                const mentioningArticles = recent7d
                    .filter(i => {
                        const itemBucket = categorizeToBucket(feedCategoryMap[i.feed_id] || i.category);
                        return itemBucket === bucket && i.entities?.includes(entity);
                    })
                    .sort((a, b) => {
                        const wa = feedAuthority[a.feed_id] || 1;
                        const wb = feedAuthority[b.feed_id] || 1;
                        return (wb * (b.importance_score || 0)) - (wa * (a.importance_score || 0));
                    })
                    .slice(0, 2)
                    .map(i => ({ id: i.id, title: i.title, url: i.url, source: feedCategoryMap[i.feed_id] }));

                rising.push({
                    entity,
                    current_week_count: rawCount,
                    baseline_count: Math.round(baseline * 10) / 10,
                    weighted_current: Math.round(weightedCount * 10) / 10,
                    multiplier: Math.round(multiplier * 10) / 10,
                    top_articles: mentioningArticles,
                });
            }

            rising.sort((a, b) => b.multiplier - a.multiplier);
            if (rising.length > 0) {
                signals[bucket] = rising.slice(0, 8);
            }
        }

        return Response.json({ signals, items_analyzed: allItems.length, recent_7d: recent7d.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});