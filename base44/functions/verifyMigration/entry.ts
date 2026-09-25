import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * verifyMigration — read-only check of the Feed -> Source/Article migration.
 *
 * For each Subscription, compares the number of legacy FeedItems in the window
 * with the number of SourceItem links migrated from that feed, and checks that
 * every Subscription points to a real Source and sampled links point to real
 * Articles. Writes nothing except a SystemHealth report (job_type
 * 'migration_verify'). Time-budgeted with self-continuation; the report from
 * the final hop has done: true and the full totals.
 *
 * Admin only.
 */

const BUDGET_MS = 45_000;
const PAGE = 500;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

async function countAll(entity, query, t0) {
    let n = 0;
    for (let skip = 0; ; skip += PAGE) {
        if (Date.now() - t0 > BUDGET_MS) return { n, partial: true };
        const page = extractItems(await entity.filter(query, 'created_date', PAGE, skip));
        n += page.length;
        if (page.length < PAGE) return { n, partial: false };
    }
}

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = Number(body.days) > 0 ? Number(body.days) : 90;
    const hop = body.hop || 0;
    const start = body.cursor || 0;
    const acc = body.acc || { legacy: 0, migrated: 0, mismatches: [], missing_sources: [], broken_links: 0, checked_links: 0 };
    const cutoff = body.cutoff || new Date(Date.now() - days * 86400_000).toISOString();
    const svc = base44.asServiceRole.entities;

    const subs = extractItems(await svc.Subscription.filter({}, 'created_date', 5000));
    const sourceIds = new Set(extractItems(await svc.Source.list('created_date', 5000)).map(s => s.id));

    let i = start;
    let outOfTime = false;
    let error = null;
    try {
    for (; i < subs.length; i++) {
        if (Date.now() - t0 > BUDGET_MS) { outOfTime = true; break; }
        const sub = subs[i];
        if (!sourceIds.has(sub.source_id)) acc.missing_sources.push({ subscription: sub.id, name: sub.display_name });

        // One pass over the legacy window, one pass over this source's links.
        // A single feed is never split across hops, so a slow feed is retried whole next hop.
        const legacyIds = new Set();
        let partial = false;
        for (let skip = 0; ; skip += PAGE) {
            if (Date.now() - t0 > BUDGET_MS) { partial = true; break; }
            const page = extractItems(await svc.FeedItem.filter(
                { feed_id: sub.legacy_feed_id, published_date: { $gte: cutoff } }, 'created_date', PAGE, skip));
            page.forEach(p => legacyIds.add(p.id));
            if (page.length < PAGE) break;
        }
        const links = [];
        for (let skip = 0; !partial; skip += PAGE) {
            if (Date.now() - t0 > BUDGET_MS) { partial = true; break; }
            const page = extractItems(await svc.SourceItem.filter({ source_id: sub.source_id }, 'created_date', PAGE, skip));
            links.push(...page);
            if (page.length < PAGE) break;
        }
        if (partial) {
            // If even a fresh hop can't finish this feed, record it and move on instead of looping.
            if (i === start && hop > 0) { acc.mismatches.push({ name: sub.display_name, error: 'too large to verify in one hop' }); continue; }
            outOfTime = true; break;
        }
        const legacy = { n: legacyIds.size };
        const migrated = links.filter(l => legacyIds.has(l.legacy_item_id)).length;

        acc.legacy += legacy.n;
        acc.migrated += migrated;
        if (migrated !== legacy.n) {
            acc.mismatches.push({ name: sub.display_name, legacy: legacy.n, migrated, missing: legacy.n - migrated });
        }

        // Sample up to 20 links and confirm their Articles exist (one batched lookup)
        const sample = [...new Set(links.slice(0, 20).map(l => l.article_id))];
        if (sample.length) {
            const found = new Set(extractItems(await svc.Article.filter({ id: { $in: sample } }, '-created_date', sample.length)).map(a => a.id));
            acc.checked_links += sample.length;
            acc.broken_links += sample.filter(id => !found.has(id)).length;
        }
    }

    } catch (e) {
        error = `sub ${i}: ${String(e?.message || e).slice(0, 400)}`;
    }

    const done = !outOfTime && !error;
    // Totals come from the migration's own SystemHealth logs; counting ~90k rows here would blow the time budget.
    const articles = null, allLinks = null;

    const report = {
        hop, days, cutoff, done, error, cursor: i, subscriptions: subs.length,
        legacy_items_in_window: acc.legacy,
        migrated_items: acc.migrated,
        missing_items: acc.legacy - acc.migrated,
        articles_total: articles?.n ?? null,
        links_total: allLinks?.n ?? null,
        dedup_rate_pct: articles && allLinks && allLinks.n ? Math.round((1 - articles.n / allLinks.n) * 1000) / 10 : null,
        mismatches: acc.mismatches.slice(0, 30),
        missing_sources: acc.missing_sources,
        checked_links: acc.checked_links,
        broken_links: acc.broken_links,
    };

    await svc.SystemHealth.create({
        job_type: 'migration_verify', status: 'completed',
        started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: report,
    }).catch(() => {});

    if (outOfTime && !error && hop < 100) {
        base44.asServiceRole.functions.invoke('verifyMigration', { days, hop: hop + 1, cursor: i, cutoff, acc }).catch(() => {});
    }
    return Response.json(report);
});
