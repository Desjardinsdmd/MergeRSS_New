import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * purgeShadowModel — one-off (2026-10-01). Deletes every record in the retired shadow
 * Source/Article model so the entity schemas can be removed. Admin-only. Runs for ~50s,
 * then reports what is left; run again until remaining is 0 everywhere.
 * Delete this function once the schemas are gone.
 */

const ENTITIES = ['SourceItem', 'LensScore', 'Article', 'Subscription', 'Source'];

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

    const svc = base44.asServiceRole.entities;
    const deadline = Date.now() + 50_000;
    const deleted = {};
    const remaining = {};
    const errors = {};

    for (const name of ENTITIES) {
        deleted[name] = 0;
        const ent = svc[name];
        if (!ent) { errors[name] = 'entity not available'; continue; }
        // Fast path: bulk delete if the SDK supports it.
        if (typeof ent.deleteMany === 'function' && Date.now() < deadline) {
            try {
                const r = await ent.deleteMany({});
                deleted[name] += Number(r?.deleted ?? r?.count ?? 0);
            } catch (e) { errors[name] = `deleteMany: ${e?.message}`; }
        }
        // Slow path: page through and delete one by one.
        while (Date.now() < deadline) {
            let page = [];
            try { page = extractItems(await ent.filter({}, '-created_date', 200, 0, ['id'])); }
            catch (e) { errors[name] = `filter: ${e?.message}`; break; }
            if (!page.length) break;
            for (const row of page) {
                if (Date.now() >= deadline) break;
                try { await ent.delete(row.id); deleted[name]++; }
                catch (e) {
                    if (String(e?.message).includes('429')) await sleep(1500);
                    else { errors[name] = `delete: ${e?.message}`; }
                }
            }
        }
        try { remaining[name] = extractItems(await ent.filter({}, '-created_date', 1, 0, ['id'])).length ? 'some' : 0; }
        catch { remaining[name] = 'unknown'; }
    }

    const out = { deleted, remaining, errors, done: Object.values(remaining).every(v => v === 0) };
    console.log('[purgeShadowModel]', JSON.stringify(out));
    await svc.SyncState.create({ key: 'purge_shadow_model', history_id: JSON.stringify(out).slice(0, 4000), enabled: false }).catch(() => {});
    return Response.json(out);
});
