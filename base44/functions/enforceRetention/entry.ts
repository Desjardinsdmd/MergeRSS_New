import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * enforceRetention — daily. Enforces the retention promised in the Privacy page (section 5):
 * feed items, digest deliveries and newsletter emails older than 90 days are deleted.
 * Also prunes internal diagnostic rows (webhook traces, Stripe event markers) after 30 days.
 * Admin-only (scheduled runs arrive as the app admin). Time-boxed; whatever is left is
 * picked up by the next run. Pass { dry_run: true } to count without deleting.
 */

const RETENTION_DAYS = 90;
const INTERNAL_DAYS = 30;
const BUDGET_MS = 50_000;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const svc = base44.asServiceRole.entities;
    const deadline = Date.now() + BUDGET_MS;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
    const internalCutoff = new Date(Date.now() - INTERNAL_DAYS * 86400_000).toISOString();

    const targets = [
        { name: 'FeedItem', filter: { created_date: { $lt: cutoff } } },
        { name: 'DigestDelivery', filter: { created_date: { $lt: cutoff } } },
        { name: 'NewsletterEmail', filter: { created_date: { $lt: cutoff } } },
        { name: 'SyncState', filter: { key: { $in: ['mailgun_trace', 'mailgun_diagnose', 'purge_shadow_model'] }, created_date: { $lt: internalCutoff } } },
        { name: 'SyncState', filter: { key: { $regex: '^(stripe_evt:|relay:)' }, created_date: { $lt: internalCutoff } } },
    ];

    const result = {};
    for (const t of targets) {
        const label = `${t.name}${t.name === 'SyncState' ? `:${Object.keys(result).filter(k => k.startsWith('SyncState')).length}` : ''}`;
        const r = { deleted: 0, more: false };
        result[label] = r;
        const ent = svc[t.name];
        if (!ent) { r.error = 'entity not available'; continue; }

        if (dryRun) {
            const sample = extractItems(await ent.filter(t.filter, 'created_date', 500, 0, ['id']).catch(() => []));
            r.would_delete_at_least = sample.length;
            continue;
        }

        if (typeof ent.deleteMany === 'function' && Date.now() < deadline) {
            // A large bulk delete keeps running server-side after the proxy times out, so cap the
            // wait and move on; the next daily run picks up anything left.
            const bulk = ent.deleteMany(t.filter).then(d => ({ d })).catch(e => ({ e }));
            const res = await Promise.race([bulk, sleep(20_000).then(() => ({ pending: true }))]);
            if (res.pending) { r.bulk = 'running in background'; continue; }
            if (res.e) r.bulk_error = String(res.e?.message || res.e).slice(0, 200);
            else r.deleted += Number(res.d?.deleted ?? res.d?.count ?? 0);
        }
        // Fallback / remainder: page and delete individually inside the time budget.
        while (Date.now() < deadline) {
            const page = extractItems(await ent.filter(t.filter, 'created_date', 200, 0, ['id']).catch(() => []));
            if (!page.length) break;
            for (const row of page) {
                if (Date.now() >= deadline) break;
                try { await ent.delete(row.id); r.deleted++; }
                catch (e) { if (String(e?.message).includes('429')) await sleep(1500); else { r.error = String(e?.message).slice(0, 200); break; } }
            }
            if (r.error) break;
        }
        r.more = extractItems(await ent.filter(t.filter, 'created_date', 1, 0, ['id']).catch(() => [])).length > 0;
    }

    const out = { cutoff, dry_run: dryRun, result };
    console.log('[enforceRetention]', JSON.stringify(out));
    if (!dryRun) {
        await svc.SystemHealth.create({
            job_type: 'retention', status: 'completed', started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(), metadata: out,
        }).catch(() => {});
    }
    return Response.json(out);
});
