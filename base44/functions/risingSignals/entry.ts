import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * risingSignals — velocity-based named-entity detection, read from FeedDailyRollup.
 *
 * Compares the last 7 days of entity mentions (authority-weighted) against the
 * weekly average of the prior 3 weeks. Surfaces entities with >= 3 raw mentions
 * and a >= 3x lift. Scoped by category bucket: CRE, AI/Tech, Macro.
 *
 * Rebuilt 2026-09-25. The old version pulled at most 500 raw articles newest-first,
 * which for a typical user covered ~8 days, leaving the 3-week baseline empty and
 * flagging almost everything as "rising". Reading daily rollups keeps the query size
 * at (feeds x 28) small rows no matter how many articles the feeds publish, and the
 * response now reports baseline coverage so a thin baseline is visible, never silent.
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
    return 'Macro';
}

const MIN_RAW_MENTIONS = 3;
const MIN_LIFT = 3;
const MIN_BASELINE_DAYS = 14; // of 21 possible
const PAGE = 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const userFeeds = extractItems(await base44.entities.Feed.filter(
            { created_by: user.email }, '-created_date', 1000
        ));
        if (!userFeeds.length) return Response.json({ signals: {} });
        const feedIds = userFeeds.map(f => f.id);

        // Authority weights by domain
        const allAuth = extractItems(await base44.asServiceRole.entities.SourceAuthority.list('-created_date', 1000));
        const authByDomain = {};
        for (const a of allAuth) if (a.domain) authByDomain[a.domain.toLowerCase()] = a;
        const feedWeight = {}, feedBucket = {}, feedName = {};
        for (const f of userFeeds) {
            let w = 1.0;
            try {
                const domain = new URL(f.url || '').hostname.replace(/^www\./, '');
                const tier = authByDomain[domain]?.tier;
                w = tier === 'tier1' ? 2.0 : tier === 'tier3' ? 0.5 : 1.0;
            } catch { /* default */ }
            feedWeight[f.id] = w;
            feedBucket[f.id] = categorizeToBucket(f.category);
            feedName[f.id] = f.name;
        }

        // Day boundaries (UTC). Recent = today and the 6 prior days; baseline = the 21 days before.
        const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
        const d = (n) => new Date(todayStart - n * 86400_000).toISOString().slice(0, 10);
        const recentFrom = d(6), baselineFrom = d(27);

        const rows = [];
        for (let skip = 0; skip < 20_000; skip += PAGE) {
            const page = extractItems(await base44.asServiceRole.entities.FeedDailyRollup.filter(
                { feed_id: { $in: feedIds }, day: { $gte: baselineFrom } }, 'day', PAGE, skip
            ));
            rows.push(...page);
            if (page.length < PAGE) break;
        }

        // Aggregate per bucket
        const agg = {}; // bucket -> key -> { e, recentRaw, recentW, baseW }
        const baselineDays = new Set(), recentDays = new Set();
        const topItemsRecent = {}; // bucket -> [{...item, feed_id, w}]
        let recentArticles = 0, baselineArticles = 0;

        for (const r of rows) {
            const bucket = feedBucket[r.feed_id] || 'Macro';
            const w = feedWeight[r.feed_id] || 1.0;
            const isRecent = r.day >= recentFrom;
            (isRecent ? recentDays : baselineDays).add(r.day);
            if (isRecent) recentArticles += r.item_count || 0; else baselineArticles += r.item_count || 0;
            agg[bucket] ||= {};
            for (const { e, k, n } of (r.entity_counts || [])) {
                const a = (agg[bucket][k] ||= { e, recentRaw: 0, recentW: 0, baseW: 0 });
                if (isRecent) { a.recentRaw += n; a.recentW += n * w; } else { a.baseW += n * w; }
            }
            if (isRecent) {
                (topItemsRecent[bucket] ||= []).push(...(r.top_items || []).map(t => ({ ...t, feed_id: r.feed_id, w })));
            }
        }

        const baselineCoverage = baselineDays.size; // of 21
        const baselineOk = baselineCoverage >= MIN_BASELINE_DAYS;

        const signals = {};
        for (const [bucket, entities] of Object.entries(agg)) {
            const rising = [];
            for (const [k, a] of Object.entries(entities)) {
                if (a.recentRaw < MIN_RAW_MENTIONS) continue;
                const baselinePerWeek = a.baseW / 3;
                // +1 smoothing: an entity with no history needs real volume to qualify,
                // instead of passing automatically because baseline == 0.
                const lift = (a.recentW + 1) / (baselinePerWeek + 1);
                if (lift < MIN_LIFT) continue;
                const top_articles = (topItemsRecent[bucket] || [])
                    .filter(t => (t.entity_keys || []).includes(k))
                    .sort((x, y) => (y.w * (y.importance_score || 0)) - (x.w * (x.importance_score || 0)))
                    .slice(0, 2)
                    .map(t => ({ id: t.id, title: t.title, url: t.url, source: feedName[t.feed_id] }));
                rising.push({
                    entity: a.e,
                    current_week_count: a.recentRaw,
                    baseline_count: Math.round(baselinePerWeek * 10) / 10,
                    weighted_current: Math.round(a.recentW * 10) / 10,
                    multiplier: Math.round(lift * 10) / 10,
                    is_new: a.baseW === 0,
                    top_articles,
                });
            }
            rising.sort((x, y) => y.multiplier - x.multiplier || y.current_week_count - x.current_week_count);
            if (rising.length) signals[bucket] = rising.slice(0, 8);
        }

        return Response.json({
            signals,
            baseline: {
                days_covered: baselineCoverage,
                days_expected: 21,
                sufficient: baselineOk,
                note: baselineOk ? null : 'Baseline history is thin; lifts are provisional until ~2 more weeks of data accumulate.',
            },
            recent_days_covered: recentDays.size,
            items_analyzed: recentArticles + baselineArticles,
            recent_7d: recentArticles,
            rollup_rows_read: rows.length,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
