import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * migrateArticles — step 2 of the Feed -> Source migration.
 *
 * Copies the last `days` (default 90) of legacy FeedItems into the new model:
 *   Article      one row per unique url_key (dedupes the same story across sources)
 *   SourceItem   link: which Source carried which Article
 *   UserItemState  read state, owned by the subscriber
 *   LensScore    per-lens scores, owned by the lens owner
 *
 * Requires migrateToSources { mode: 'apply' } to have run (it creates Subscriptions
 * with legacy_feed_id). Nothing legacy is modified or deleted; the old FeedItem
 * table stays as a read-only archive.
 *
 * Idempotent: an item already linked (SourceItem.legacy_item_id) is skipped, and
 * read state / lens scores are only written for items linked in this run.
 * Time-budgeted (45s) with self-continuation via cursor. Admin only.
 */

const BUDGET_MS = 45_000;
const PAGE = 200;
const CHUNK = 100;
const MAX_HOPS = 300;
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|ncid)$/i;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

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
        return String(raw).trim().toLowerCase();
    }
}
const itemKey = (it) => urlKey(it.canonical_url || it.url || '') || `guid:${it.guid || it.id}`;

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = Number(body.days) > 0 ? Number(body.days) : 90;
    const hop = body.hop || 0;
    let subIndex = body.cursor?.sub_index || 0;
    let skip = body.cursor?.skip || 0;
    const svc = base44.asServiceRole.entities;
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();

    const subs = extractItems(await svc.Subscription.filter({}, 'created_date', 5000))
        .filter(s => s.legacy_feed_id && s.source_id);
    if (!subs.length) {
        return Response.json({ error: 'No subscriptions found. Run migrateToSources with mode apply first.' }, { status: 409 });
    }
    const lensOwner = Object.fromEntries(
        extractItems(await svc.CustomLens.list('-created_date', 1000)).map(l => [l.id, l.created_by])
    );

    const stats = { items_seen: 0, items_skipped_linked: 0, articles_created: 0, articles_reused: 0,
        links_created: 0, read_states: 0, lens_scores: 0, lens_scores_skipped_cross_tenant: 0 };
    let outOfTime = false;

    outer:
    for (; subIndex < subs.length; subIndex++, skip = 0) {
        const sub = subs[subIndex];
        while (true) {
            if (Date.now() - t0 > BUDGET_MS) { outOfTime = true; break outer; }
            const page = extractItems(await svc.FeedItem.filter(
                { feed_id: sub.legacy_feed_id, published_date: { $gte: cutoff } }, 'published_date', PAGE, skip));
            if (!page.length) break;
            stats.items_seen += page.length;

            // 1. Skip items already migrated
            const linked = new Set();
            for (const ids of chunks(page.map(i => i.id), CHUNK)) {
                for (const l of extractItems(await svc.SourceItem.filter({ legacy_item_id: { $in: ids } }, '-created_date', CHUNK))) {
                    linked.add(l.legacy_item_id);
                }
            }
            const todo = page.filter(i => !linked.has(i.id));
            stats.items_skipped_linked += page.length - todo.length;

            if (todo.length) {
                // 2. Resolve or create one Article per url_key
                const keys = [...new Set(todo.map(itemKey))];
                const articleByKey = {};
                const loadExisting = async (ks) => {
                    for (const c of chunks(ks, CHUNK)) {
                        for (const a of extractItems(await svc.Article.filter({ url_key: { $in: c } }, '-created_date', CHUNK * 2))) {
                            if (!articleByKey[a.url_key]) articleByKey[a.url_key] = a;
                        }
                    }
                };
                await loadExisting(keys);
                const missing = keys.filter(k => !articleByKey[k]);
                stats.articles_reused += keys.length - missing.length;
                if (missing.length) {
                    const firstByKey = {};
                    for (const it of todo) { const k = itemKey(it); if (!firstByKey[k]) firstByKey[k] = it; }
                    const rows = missing.map(k => {
                        const it = firstByKey[k];
                        return {
                            url_key: k, url: it.url, title: it.title || '(untitled)', description: it.description || '',
                            content: it.content || '', author: it.author || '', published_date: it.published_date,
                            first_seen_at: it.created_date, category: it.category || '', entities: it.entities || [],
                            ai_summary: it.ai_summary || '', importance_score: it.importance_score ?? null,
                            intelligence_tag: it.intelligence_tag || undefined,
                            enrichment_status: it.enrichment_status || 'pending',
                            legacy_item_ids: todo.filter(t => itemKey(t) === k).map(t => t.id),
                        };
                    });
                    for (const c of chunks(rows, CHUNK)) await svc.Article.bulkCreate(c);
                    stats.articles_created += rows.length;
                    await loadExisting(missing);
                }

                // 3. Links, read state, lens scores (only for items linked now)
                const links = [], states = [], scores = [];
                for (const it of todo) {
                    const art = articleByKey[itemKey(it)];
                    if (!art) continue;
                    links.push({ source_id: sub.source_id, article_id: art.id, guid: it.guid || '',
                        published_date: it.published_date, fetched_at: it.created_date, legacy_item_id: it.id });
                    if (it.is_read) states.push({ user_email: sub.user_email, article_id: art.id, is_read: true, legacy_item_id: it.id });
                    for (const cls of it.custom_lens_scores || []) {
                        const owner = lensOwner[cls.lens_id];
                        if (!owner || owner !== sub.user_email) { stats.lens_scores_skipped_cross_tenant++; continue; }
                        scores.push({ lens_id: cls.lens_id, owner_email: owner, article_id: art.id,
                            importance_score: cls.importance_score ?? null, intelligence_tag: cls.intelligence_tag || undefined,
                            ai_summary: cls.ai_summary || '', structured_metadata: cls.structured_metadata || {},
                            scored_at: cls.scored_at || null });
                    }
                }
                for (const c of chunks(links, CHUNK)) await svc.SourceItem.bulkCreate(c);
                for (const c of chunks(states, CHUNK)) await svc.UserItemState.bulkCreate(c);
                for (const c of chunks(scores, CHUNK)) await svc.LensScore.bulkCreate(c);
                stats.links_created += links.length;
                stats.read_states += states.length;
                stats.lens_scores += scores.length;
            }

            skip += page.length;
            if (page.length < PAGE) break;
        }
    }

    const done = !outOfTime;
    await svc.SystemHealth.create({
        job_type: 'article_migration', status: 'completed',
        started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: { ...stats, hop, days, done, cursor: { sub_index: subIndex, skip }, subscriptions: subs.length },
    }).catch(() => {});

    if (outOfTime && hop < MAX_HOPS) {
        base44.asServiceRole.functions.invoke('migrateArticles', { days, hop: hop + 1, cursor: { sub_index: subIndex, skip } }).catch(() => {});
    }
    return Response.json({ ...stats, hop, done, cursor: { sub_index: subIndex, skip } });
});
