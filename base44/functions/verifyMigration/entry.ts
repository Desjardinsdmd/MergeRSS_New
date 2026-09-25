import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

/**
 * verifyMigration — read-only check of the Feed -> Source/Article migration.
 *
 * Uses server-side aggregate() instead of paging rows (the previous version paged
 * full FeedItem records, including content, and crashed the worker on large feeds).
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

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = Number(body.days) > 0 ? Number(body.days) : 90;
    const migrationCutoff = body.migration_cutoff || '2026-09-25T13:44:00Z';
    const svc = base44.asServiceRole.entities;

    try {
        const subs = rowsOf(await svc.Subscription.list({ limit: 5000, fields: ['id', 'source_id', 'legacy_feed_id', 'display_name'] }));
        const sources = rowsOf(await svc.Source.list({ limit: 5000, fields: ['id', 'title'] }));
        const sourceTitle = Object.fromEntries(sources.map(s => [s.id, s.title]));
        const missingSources = subs.filter(s => !sourceTitle[s.source_id]).map(s => s.display_name);

        // The migration filtered on published_date >= (its run time - 90d); add a 1h margin so
        // items that aged out between the migration and this check aren't counted as missing.
        const legacyWindow = new Date(new Date(migrationCutoff).getTime() - days * 86400_000 + 3600_000).toISOString();
        const legacyRows = rowsOf(await svc.FeedItem.aggregate({ query: { published_date: { $gte: legacyWindow } }, groupBy: 'feed_id' }));
        const legacyByFeed = Object.fromEntries(legacyRows.map(r => [r.feed_id, r.count]));

        const linkRows = rowsOf(await svc.SourceItem.aggregate({ query: { legacy_item_id: { $gt: '' } }, groupBy: 'source_id' }));
        const migratedBySource = Object.fromEntries(linkRows.map(r => [r.source_id, r.count]));

        const legacyBySource = {};
        for (const s of subs) legacyBySource[s.source_id] = (legacyBySource[s.source_id] || 0) + (legacyByFeed[s.legacy_feed_id] || 0);

        const perSource = Object.keys(legacyBySource).map(id => ({
            source: sourceTitle[id] || id, legacy: legacyBySource[id], migrated: migratedBySource[id] || 0,
        }));
        const mismatches = perSource.filter(p => p.legacy !== p.migrated).sort((a, b) => Math.abs(b.legacy - b.migrated) - Math.abs(a.legacy - a.migrated));
        const legacyTotal = perSource.reduce((n, p) => n + p.legacy, 0);
        const migratedTotal = perSource.reduce((n, p) => n + p.migrated, 0);

        const total = async (entity, query) => rowsOf(await entity.aggregate(query ? { query } : {}))[0]?.count ?? 0;
        const migratedArticles = await total(svc.Article, { created_date: { $lt: migrationCutoff } });
        const allArticles = await total(svc.Article);
        const allLinks = await total(svc.SourceItem);
        const statusMix = Object.fromEntries(rowsOf(await svc.Article.aggregate({ groupBy: 'enrichment_status' })).map(r => [r.enrichment_status || 'none', r.count]));
        const lensScores = await total(svc.LensScore);
        const readStates = await total(svc.UserItemState);

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
