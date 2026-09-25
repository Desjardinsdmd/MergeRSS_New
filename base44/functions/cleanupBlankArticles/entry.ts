import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cleanupBlankArticles — one-off repair for the new pipeline (2026-09-25).
 *
 * Before the podcast-link fix, fetchSources stored podcast episodes with no URL (their feeds
 * carry an audio enclosure instead of a <link>), keyed by guid, including entire back
 * catalogues. Those Articles are unusable and would duplicate the correctly-linked copies
 * the fixed fetcher now creates.
 *
 * Deletes Articles created by the new fetcher (no legacy_item_ids) with an empty url, plus
 * their SourceItem links and any LensScore/UserItemState rows. Migrated Articles and legacy
 * tables are never touched. Body: { mode: 'dry_run' (default) | 'apply' }. Admin only.
 */

const PAGE = 5000;
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
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { mode = 'dry_run' } = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole.entities;

    const blank = [];
    for (let skip = 0; ; skip += PAGE) {
        const page = extractItems(await svc.Article.filter({ url: '' }, 'id', PAGE, skip, ['id', 'legacy_item_ids', 'created_date']));
        blank.push(...page);
        if (page.length < PAGE) break;
    }
    const targets = blank.filter(a => !(a.legacy_item_ids || []).length).map(a => a.id);
    const report = { mode, blank_articles: blank.length, targets: targets.length, migrated_kept: blank.length - targets.length };

    if (mode === 'apply') {
        let links = 0;
        for (let i = 0; i < targets.length; i += 100) {
            const ids = targets.slice(i, i + 100);
            const r = await svc.SourceItem.deleteMany({ article_id: { $in: ids } });
            links += Number(r?.deleted ?? r?.count ?? 0);
            await svc.LensScore.deleteMany({ article_id: { $in: ids } }).catch(() => {});
            await svc.UserItemState.deleteMany({ article_id: { $in: ids } }).catch(() => {});
            await svc.Article.deleteMany({ id: { $in: ids } });
        }
        report.links_deleted_reported = links;
        report.articles_deleted = targets.length;
    }
    await svc.SystemHealth.create({ job_type: 'cleanup_blank_articles', status: 'completed', completed_at: new Date().toISOString(), metadata: report }).catch(() => {});
    return Response.json(report);
});
