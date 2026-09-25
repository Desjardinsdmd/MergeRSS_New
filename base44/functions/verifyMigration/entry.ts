import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * verifyMigration — read-only check of the Feed -> Source/Article migration.
 *
 * Pages only the id/foreign-key fields (5,000 per page) and counts in memory. The
 * previous version paged full FeedItem records, including content, and crashed the worker.
 * (SDK 0.8.51 has aggregate(), but its worker fails to boot on this platform.)
 *
 * Compares, per Source, legacy FeedItems in the window (grouped by feed_id, summed
 * across the feeds that map to the Source) with migrated SourceItem links (links
 * that carry a legacy_item_id). Also reports Article totals, the dedup rate among
 * migrated rows, enrichment status mix, and Subscriptions pointing at missing Sources.
 *
 * Body: { days = 90, migration_cutoff?: ISO } — migration_cutoff separates rows the
 * migration wrote from rows the new fetch worker wrote afterwards.
 * Writes only a SystemHealth report (job_type 'migration_verify'). Admin only.
 */

const rowsOf = (r) => (Array.isArray(r) ? r : (r?.rows || r?.items || r?.data || []));
const PAGE = 5000;
async function scan(entity, query, fields) {
    const out = [];
    for (let skip = 0; ; skip += PAGE) {
        const page = rowsOf(await entity.filter(query, 'created_date', PAGE, skip, fields));
        out.push(...page);
        if (page.length < PAGE) return out;
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = Number(body.days) > 0 ? Number(body.days) : 90;
    const migrationCutoff = body.migration_cutoff || '2026-09-25T13:44:00Z';
    const svc = base44.asServiceRole.entities;

    try {
        const subs = await scan(svc.Subscription, {}, ['id', 'source_id', 'legacy_feed_id', 'display_name']);
        const sources = await scan(svc.Source, {}, ['id', 'title']);
        const sourceTitle = Object.fromEntries(sources.map(s => [s.id, s.title]));
        const missingSources = subs.filter(s => !sourceTitle[s.source_id]).map(s => s.display_name);

        // The migration filtered on published_date >= (its run time - 90d); add a 1h margin so
        // items that aged out between the migration and this check aren't counted as missing.
        const legacyWindow = new Date(new Date(migrationCutoff).getTime() - days * 86400_000 + 3600_000).toISOString();
        const legacyByFeed = {};
        const feedIds = new Set(subs.map(s => s.legacy_feed_id));
        for (const r of await scan(svc.FeedItem, { published_date: { $gte: legacyWindow } }, ['id', 'feed_id'])) {
            if (feedIds.has(r.feed_id)) legacyByFeed[r.feed_id] = (legacyByFeed[r.feed_id] || 0) + 1;
        }

        const links = await scan(svc.SourceItem, {}, ['id', 'source_id', 'article_id', 'legacy_item_id']);
        const migratedLinks = links.filter(l => l.legacy_item_id);
        const migratedBySource = {};
        for (const l of migratedLinks) migratedBySource[l.source_id] = (migratedBySource[l.source_id] || 0) + 1;

        const legacyBySource = {};
        for (const s of subs) legacyBySource[s.source_id] = (legacyBySource[s.source_id] || 0) + (legacyByFeed[s.legacy_feed_id] || 0);

        const perSource = Object.keys(legacyBySource).map(id => ({
            source: sourceTitle[id] || id, legacy: legacyBySource[id], migrated: migratedBySource[id] || 0,
        }));
        const mismatches = perSource.filter(p => p.legacy !== p.migrated).sort((a, b) => Math.abs(b.legacy - b.migrated) - Math.abs(a.legacy - a.migrated));
        const legacyTotal = perSource.reduce((n, p) => n + p.legacy, 0);
        const migratedTotal = migratedLinks.length;

        const articles = await scan(svc.Article, {}, ['id', 'created_date', 'enrichment_status']);
        const articleIds = new Set(articles.map(a => a.id));
        const migratedArticles = new Set(migratedLinks.map(l => l.article_id)).size;
        const brokenLinks = links.filter(l => !articleIds.has(l.article_id)).length;
        const statusMix = {};
        for (const a of articles) statusMix[a.enrichment_status || 'none'] = (statusMix[a.enrichment_status || 'none'] || 0) + 1;
        const lensScores = (await scan(svc.LensScore, {}, ['id'])).length;
        const readStates = (await scan(svc.UserItemState, {}, ['id'])).length;
        const allArticles = articles.length;
        const allLinks = links.length;

        const report = {
            days, migration_cutoff: migrationCutoff,
            subscriptions: subs.length, sources: sources.length, missing_sources: missingSources,
            legacy_items_in_window: legacyTotal,
            migrated_links: migratedTotal,
            coverage_pct: legacyTotal ? Math.round((migratedTotal / legacyTotal) * 1000) / 10 : null,
            migrated_articles: migratedArticles,
            duplicates_collapsed: migratedTotal - migratedArticles,
            dedup_rate_pct: migratedTotal ? Math.round((1 - migratedArticles / migratedTotal) * 1000) / 10 : null,
            articles_total_now: allArticles, links_total_now: allLinks,
            enrichment_status: statusMix, lens_scores: lensScores, read_states: readStates,
            broken_links: brokenLinks,
            mismatches: mismatches.slice(0, 20),
        };

        await svc.SystemHealth.create({
            job_type: 'migration_verify', status: 'completed',
            started_at: new Date().toISOString(), completed_at: new Date().toISOString(), metadata: report,
        }).catch((e) => console.error('[verifyMigration] health log failed:', e.message));
        return Response.json(report);
    } catch (err) {
        await svc.SystemHealth.create({ job_type: 'migration_verify', status: 'failed', error_message: String(err.message).slice(0, 1000) }).catch(() => {});
        return Response.json({ error: err.message }, { status: 500 });
    }
});
