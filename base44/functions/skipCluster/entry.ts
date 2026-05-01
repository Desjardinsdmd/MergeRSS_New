import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * skipCluster — records negative feedback when a user skips a cluster.
 * Helps the system learn what the user doesn't want over time.
 *
 * Params:
 *   publication_id — required
 *   cluster_id — required
 *   cluster_title — optional (for readability)
 *   user_notes — optional
 */

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}

    const { publication_id, cluster_id, cluster_title, user_notes } = body;
    if (!publication_id || !cluster_id) {
        return Response.json({ error: 'publication_id and cluster_id required' }, { status: 400 });
    }

    await base44.asServiceRole.entities.SelectionFeedback.create({
        publication_id,
        cluster_id,
        action: 'skip',
        cluster_title: cluster_title || '',
        user_notes: user_notes || '',
    });

    return Response.json({ success: true });
});