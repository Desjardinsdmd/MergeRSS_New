import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * tenantBackfill — one-off: stamps owner_email on existing DigestDelivery and
 * NewsletterEmail rows so owner-only RLS can apply. Time-budgeted with
 * self-continuation; safe to re-run (only touches rows missing owner_email).
 * Writes a SystemHealth record (job_type 'tenant_backfill') with counts.
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const hop = body.hop || 0;
    const svc = base44.asServiceRole.entities;
    const stats = { deliveries_stamped: 0, deliveries_orphaned: 0, emails_stamped: 0, emails_orphaned: 0 };

    const digests = extractItems(await svc.Digest.list('-created_date', 5000));
    const ownerByDigest = Object.fromEntries(digests.map(d => [d.id, d.created_by]));
    const subs = extractItems(await svc.EmailSubscription.list('-created_date', 5000));
    const ownerBySub = Object.fromEntries(subs.map(s => [s.id, s.created_by]));

    let outOfTime = false;
    const stamp = async (entity, ownerOf, keyStamped, keyOrphan) => {
        for (let skip = 0; !outOfTime; skip += PAGE) {
            const page = extractItems(await entity.list('-created_date', PAGE, skip));
            for (const r of page) {
                if (r.owner_email) continue;
                if (Date.now() - t0 > BUDGET_MS) { outOfTime = true; break; }
                const owner = ownerOf(r);
                if (!owner) { stats[keyOrphan]++; continue; }
                await entity.update(r.id, { owner_email: owner }).catch(() => {});
                stats[keyStamped]++;
                await sleep(30);
            }
            if (page.length < PAGE) break;
        }
    };
    await stamp(svc.DigestDelivery, r => ownerByDigest[r.digest_id], 'deliveries_stamped', 'deliveries_orphaned');
    await stamp(svc.NewsletterEmail, r => ownerBySub[r.subscription_id], 'emails_stamped', 'emails_orphaned');

    await svc.SystemHealth.create({
        job_type: 'tenant_backfill', status: 'completed',
        started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: { ...stats, hop, out_of_time: outOfTime },
    }).catch(() => {});

    if (outOfTime && hop < 50) {
        base44.asServiceRole.functions.invoke('tenantBackfill', { hop: hop + 1 }).catch(() => {});
    }
    return Response.json({ ...stats, hop, continued: outOfTime });
});
