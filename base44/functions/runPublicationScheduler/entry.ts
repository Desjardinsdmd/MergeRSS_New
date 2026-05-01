import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * runPublicationScheduler — posts approved PublicationPosts when their publication is due.
 *
 * No auto-selection of clusters. The user manually picks stories via the Candidate Pipeline,
 * which creates draft posts. This scheduler:
 *   1. Finds approved posts ready to be posted
 *   2. Posts them via postToX (or other channel handlers)
 *
 * Manual trigger also supported via publication_id param.
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { publication_id } = body;

    // Auth: must be logged in
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // If no specific publication, require admin for scheduled runs
    if (!publication_id && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find approved posts ready to be posted
    const filter = { status: 'approved' };
    if (publication_id) filter.publication_id = publication_id;

    const approvedPosts = extractItems(
        await base44.asServiceRole.entities.PublicationPost.filter(filter, '-created_date', 20)
    );

    if (!approvedPosts.length) {
        return Response.json({ processed: 0, reason: 'no_approved_posts' });
    }

    // Load publications for these posts
    const pubIds = [...new Set(approvedPosts.map(p => p.publication_id))];
    const allPubs = [];
    for (const pid of pubIds) {
        const pubs = extractItems(await base44.asServiceRole.entities.Publication.filter(
            { id: pid }, '-created_date', 1
        ));
        if (pubs[0]) allPubs.push(pubs[0]);
    }
    const pubMap = Object.fromEntries(allPubs.map(p => [p.id, p]));

    const results = [];

    for (const post of approvedPosts) {
        const pub = pubMap[post.publication_id];
        if (!pub) {
            results.push({ post_id: post.id, error: 'Publication not found' });
            continue;
        }

        // Skip paused publications
        if (pub.status === 'paused') {
            results.push({ post_id: post.id, skipped: true, reason: 'publication_paused' });
            continue;
        }

        // Post it
        try {
            await base44.asServiceRole.functions.invoke('postToX', { post_id: post.id });
            console.log(`[runPublicationScheduler] Posted ${post.id} for ${pub.name}`);
            results.push({ post_id: post.id, publication: pub.name, status: 'posted' });
        } catch (postErr) {
            console.error(`[runPublicationScheduler] Post failed for ${post.id}: ${postErr.message}`);
            results.push({ post_id: post.id, publication: pub.name, error: postErr.message });
        }
    }

    // Update next_run timestamps for affected publications
    for (const pub of allPubs) {
        await updateNextRun(base44, pub);
    }

    return Response.json({ processed: results.length, results });
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
    });
    candidates.sort((a, b) => a - b);
    const nextRun = candidates[0].toISOString();

    await base44.asServiceRole.entities.Publication.update(pub.id, {
        last_run_at: new Date().toISOString(),
        next_run_at: nextRun,
    }).catch(() => {});
}