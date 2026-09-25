import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * shadowCompare — read-only cutover gate. Compares what the legacy pipeline (Feed/FeedItem)
 * and the new pipeline (Source/SourceItem/Article) each captured over the same window.
 *
 * For each Source (mapped to its legacy feeds) over the last `hours` (default 6):
 *   legacy_only  articles the old fetcher stored that the new one never linked (the new
 *                pipeline would have MISSED these after cutover)
 *   new_only     articles the new fetcher linked that the old one never stored
 *   both         captured by both
 * Matching is by the same url_key normalization both pipelines use; items with no usable
 * URL fall back to guid. Also reports score adoption for articles captured by both.
 *
 * Body: { hours = 6 }. Writes one SystemHealth row (job_type 'shadow_compare'). Admin only.
 */

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|ncid)$/i;
const PAGE = 5000;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
function urlKey(raw = '') {
    try {
        const u = new URL(String(raw).trim());
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
        u.searchParams.sort();
        const path = u.pathname.replace(/\/+$/, '');
        const qs = u.searchParams.toString();
        return `${host}${path}${qs ? '?' + qs : ''}`;
    } catch {
        return '';
    }
}
async function scan(entity, query, fields) {
    const out = [];
    for (let skip = 0; ; skip += PAGE) {
        const page = extractItems(await entity.filter(query, 'id', PAGE, skip, fields));
        out.push(...page);
        if (page.length < PAGE) return out;
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { hours = 6 } = await req.json().catch(() => ({}));
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const svc = base44.asServiceRole.entities;

    try {
        const sources = await scan(svc.Source, {}, ['id', 'title', 'legacy_feed_ids']);
        const sourceByFeed = {};
        for (const s of sources) for (const f of s.legacy_feed_ids || []) sourceByFeed[f] = s;

        // Legacy side: items the old fetcher created in the window
        const legacy = await scan(svc.FeedItem, { created_date: { $gte: since } }, ['id', 'feed_id', 'url', 'guid', 'enrichment_status']);
        // New side: links the new fetcher created in the window (migration links carry legacy_item_id)
        const links = (await scan(svc.SourceItem, { created_date: { $gte: since } }, ['id', 'source_id', 'article_id', 'guid', 'legacy_item_id']))
            .filter(l => !l.legacy_item_id);
        const articleIds = [...new Set(links.map(l => l.article_id))];
        const articles = {};
        for (let i = 0; i < articleIds.length; i += 100) {
            for (const a of extractItems(await svc.Article.filter({ id: { $in: articleIds.slice(i, i + 100) } }, 'id', 200, 0, ['id', 'url', 'url_key', 'enrichment_status', 'enrichment_source']))) {
                articles[a.id] = a;
            }
        }

        const per = {};
        const bucket = (sid) => (per[sid] ||= { legacy: new Map(), fresh: new Map() });
        for (const it of legacy) {
            const s = sourceByFeed[it.feed_id];
            if (!s) continue;
            const key = urlKey(it.url) || `guid:${it.guid || it.url}`;
            bucket(s.id).legacy.set(key, it);
        }
        for (const l of links) {
            const a = articles[l.article_id];
            if (!a) continue;
            const key = urlKey(a.url) || `guid:${l.guid}`;
            bucket(l.source_id).fresh.set(key, a);
        }

        const titleOf = Object.fromEntries(sources.map(s => [s.id, s.title]));
        const rows = [];
        const tot = { legacy_only: 0, new_only: 0, both: 0, both_adopted: 0, both_skipped: 0, both_pending: 0, no_usable_url_new: 0 };
        for (const [sid, b] of Object.entries(per)) {
            let lo = 0, no = 0, both = 0;
            for (const k of b.legacy.keys()) if (!b.fresh.has(k)) lo++;
            for (const [k, a] of b.fresh) {
                if (!a.url) tot.no_usable_url_new++;
                if (b.legacy.has(k)) {
                    both++;
                    if (a.enrichment_source === 'legacy') tot.both_adopted++;
                    else if (a.enrichment_status === 'skipped') tot.both_skipped++;
                    else if (a.enrichment_status === 'pending') tot.both_pending++;
                } else no++;
            }
            tot.legacy_only += lo; tot.new_only += no; tot.both += both;
            if (lo || no) rows.push({ source: titleOf[sid] || sid, legacy_only: lo, new_only: no, both });
        }
        rows.sort((a, b) => (b.legacy_only + b.new_only) - (a.legacy_only + a.new_only));

        const report = { hours, since, ...tot, sources_compared: Object.keys(per).length, top_differences: rows.slice(0, 15) };
        await svc.SystemHealth.create({ job_type: 'shadow_compare', status: 'completed', started_at: since, completed_at: new Date().toISOString(), metadata: report }).catch(() => {});
        return Response.json(report);
    } catch (err) {
        await svc.SystemHealth.create({ job_type: 'shadow_compare', status: 'failed', error_message: String(err.message).slice(0, 1000) }).catch(() => {});
        return Response.json({ error: err.message }, { status: 500 });
    }
});
