import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const [users, feeds, deliveries] = await Promise.all([
            base44.asServiceRole.entities.User.list('-created_date', 10000),
            base44.asServiceRole.entities.Feed.list('-created_date', 10000),
            base44.asServiceRole.entities.DigestDelivery.filter({ status: 'sent' }, '-created_date', 10000),
        ]);

        return Response.json({
            users: users.length,
            feeds: feeds.length,
            digests: deliveries.length,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});