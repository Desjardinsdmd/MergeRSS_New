import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * dedupeSourceLinks — removes duplicate SourceItem links (same source_id + article_id).
 *
 * The legacy fetcher stored many feed items more than once (Djinni BI alone: ~10,000
 * repeats of the same job URLs). The migration faithfully created one link per legacy
 * item, so those repeats became duplicate links pointing at a single Article. Left in
 * place, a user's feed would show the same article several times.
 *
 * Keeps one link per (source, article) and deletes the rest. Articles, Sources and the
 * legacy FeedItem table are never touched.
 *
 * Body: { mode: 'dry_run' (default) | 'apply', cursor?: source index }
 * Time-budgeted (45s) with self-continuation. Admin only.
 */

const BUDGET_MS = 45_000;
const PAGE = 5000;
const DELETE_CHUNK = 100;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const apply = body.mode === 'apply';
    const hop = body.hop || 0;
    const svc = base44.asServiceRole.entities;
    const totals = body.totals || { duplicates_found: 0, deleted: 0, by_source: {} };

    const sources = extractItems(await svc.Source.filter({}, 'created_date', 5000, 0, ['id', 'title']));
    let i = body.cursor || 0;
    let outOfTime = false;

    for (; i < sources.length; i++) {
        if (Date.now() - t0 > BUDGET_MS) { outOfTime = true; break; }
        const src = sources[i];

        // Sorted by id, which is unique, so skip-based paging can't drop or repeat rows.
        const links = [];
        for (let skip = 0; ; skip += PAGE) {
            const page = extractItems(await svc.SourceItem.filter({ source_id: src.id }, 'id', PAGE, skip, ['id', 'article_id']));
            links.push(...page);
            if (page.length < PAGE) break;
        }
        const seen = new Set();
        const extras = [];
        for (const l of links) {
            if (seen.has(l.article_id)) extras.push(l.id); else seen.add(l.article_id);
        }
        if (!extras.length) continue;

        if (!apply) {
            totals.duplicates_found += extras.length;
            totals.by_source[src.title || src.id] = extras.length;
            continue;
        }

        let deletedHere = 0;
        for (let c = 0; c < extras.length; c += DELETE_CHUNK) {
            if (Date.now() - t0 > BUDGET_MS) { outOfTime = true; break; }
            await svc.SourceItem.deleteMany({ id: { $in: extras.slice(c, c + DELETE_CHUNK) } });
            deletedHere += Math.min(DELETE_CHUNK, extras.length - c);
        }
        totals.deleted += deletedHere;
        totals.by_source[src.title || src.id] = (totals.by_source[src.title || src.id] || 0) + deletedHere;
        // Unfinished source: the next hop rescans it from scratch, so nothing is skipped.
        if (outOfTime) break;
    }

    const done = !outOfTime;
    await svc.SystemHealth.create({
        job_type: 'dedupe_source_links', status: 'completed',
        started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: { mode: apply ? 'apply' : 'dry_run', hop, done, cursor: i, sources: sources.length, ...totals },
    }).catch(() => {});

    if (outOfTime && hop < 100) {
        base44.asServiceRole.functions.invoke('dedupeSourceLinks', { mode: body.mode, hop: hop + 1, cursor: i, totals }).catch(() => {});
    }
    return Response.json({ mode: apply ? 'apply' : 'dry_run', hop, done, cursor: i, ...totals });
});
