import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * runPublicationScheduler — runs every 15 minutes. Nothing here posts to X.
 *
 *   1. SUGGEST: when a publication's slot is due (next_run_at <= now), pick the top
 *      lens-scored story candidates and generate draft PublicationPosts (status 'draft')
 *      for human review. Skipped when enough undecided drafts are already waiting.
 *   2. QUEUE: approved posts (approval is always a human action in the review screen)
 *      are handed to postToX, which only saves them as XDrafts for manual posting.
 *
 * Params (manual trigger): publication_id, suggest_only, queue_only, force_suggest.
 */

const DEFAULT_SUGGEST_COUNT = 2;   // drafts generated per slot
const MAX_PENDING_DRAFTS = 6;      // don't pile up suggestions nobody has reviewed
const PENDING_WINDOW_HOURS = 72;   // drafts older than this are stale and don't block new ones

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

// functions.invoke throws on non-2xx; return the JSON body either way.
async function invokeJson(base44, name, payload) {
    try {
        const res = await base44.asServiceRole.functions.invoke(name, payload);
        return { ok: true, data: res?.data ?? {} };
    } catch (err) {
        const data = err?.response?.data || err?.data || {};
        return { ok: false, data, error: data?.error || err?.message || `${name} failed` };
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { publication_id, suggest_only, queue_only, force_suggest } = body;

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Publishing is admin-only in every path (manual trigger included).
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const pubFilter = publication_id ? { id: publication_id } : { status: { $ne: 'paused' } };
    const pubs = extractItems(await base44.asServiceRole.entities.Publication.filter(pubFilter, '-created_date', 20))
        .filter(p => p.status !== 'paused');

    const suggestions = [];
    const queued = [];

    // ── 1. Suggest drafts for publications whose slot is due ─────────────────
    if (!queue_only) {
        const now = Date.now();
        for (const pub of pubs) {
            const due = force_suggest || !pub.next_run_at || new Date(pub.next_run_at).getTime() <= now;
            if (!due) continue;

            const pendingCutoff = new Date(now - PENDING_WINDOW_HOURS * 3600 * 1000).toISOString();
            const pending = extractItems(await base44.asServiceRole.entities.PublicationPost.filter(
                { publication_id: pub.id, status: 'draft', created_date: { $gte: pendingCutoff } }, '-created_date', 50
            ));
            const room = Math.max(0, MAX_PENDING_DRAFTS - pending.length);
            const want = Math.min(room, Number.isFinite(pub.auto_suggest_count) ? pub.auto_suggest_count : DEFAULT_SUGGEST_COUNT);

            const created = [];
            if (want > 0) {
                const cand = await invokeJson(base44, 'getPublicationCandidates', { publication_id: pub.id, limit: 20 });
                if (!cand.ok) {
                    console.error(`[runPublicationScheduler] candidates failed for ${pub.name}: ${cand.error}`);
                } else {
                    // Candidates exclude clusters already drafted, posted or skipped.
                    const top = (cand.data?.candidates || []).filter(c => c.article_url).slice(0, want);
                    for (const c of top) {
                        const sel = await invokeJson(base44, 'manualSelectCluster', {
                            publication_id: pub.id, cluster_id: c.id, auto: true,
                        });
                        if (sel.ok) created.push({ post_id: sel.data?.post_id, title: c.title, lens_score: c.lens_score });
                        else console.error(`[runPublicationScheduler] draft failed for "${c.title}": ${sel.error}`);
                    }
                }
            }
            suggestions.push({ publication: pub.name, pending_before: pending.length, created });
            console.log(`[runPublicationScheduler] ${pub.name}: ${created.length} suggestion(s), ${pending.length} already pending`);
            await updateNextRun(base44, pub);
        }
    }

    // ── 2. Queue approved posts to X Drafts (manual posting only) ────────────
    if (!suggest_only) {
        const filter = { status: 'approved' };
        if (publication_id) filter.publication_id = publication_id;
        const approvedPosts = extractItems(
            await base44.asServiceRole.entities.PublicationPost.filter(filter, '-created_date', 20)
        );
        const pubMap = Object.fromEntries(pubs.map(p => [p.id, p]));

        for (const post of approvedPosts) {
            const pub = pubMap[post.publication_id];
            if (!pub) { queued.push({ post_id: post.id, skipped: true, reason: 'publication_paused_or_missing' }); continue; }
            const res = await invokeJson(base44, 'postToX', { post_id: post.id });
            if (res.ok) queued.push({ post_id: post.id, publication: pub.name, status: 'queued_draft' });
            else {
                console.error(`[runPublicationScheduler] queue failed for ${post.id}: ${res.error}`);
                queued.push({ post_id: post.id, publication: pub.name, error: res.error });
            }
        }
    }

    return Response.json({ suggestions, queued });
});

async function updateNextRun(base44, pub) {
    const crons = (pub.schedule_cron || '0 11 * * *').split(',').map(s => s.trim()).filter(Boolean);
    const now = new Date();

    const candidates = crons.map(cron => {
        const parts = cron.split(' ');
        const minute = parseInt(parts[0]);
        const hour = parseInt(parts[1]);
        const today = new Date(now);
        today.setUTCHours(hour, minute, 0, 0);
        if (today > now) return today;
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(hour, minute, 0, 0);
        return tomorrow;
    }).filter(d => !isNaN(d.getTime()));
    if (!candidates.length) return;
    candidates.sort((a, b) => a - b);

    await base44.asServiceRole.entities.Publication.update(pub.id, {
        last_run_at: now.toISOString(),
        next_run_at: candidates[0].toISOString(),
    }).catch(() => {});
}
