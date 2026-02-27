import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { digest_name, webhook_url } = await req.json();

        let url = webhook_url;
        if (!url && digest_name) {
            const digest = await base44.entities.Digest.filter({ name: digest_name });
            if (!digest || digest.length === 0) {
                return Response.json({ error: `Digest "${digest_name}" not found` }, { status: 404 });
            }
            url = digest[0].discord_webhook_url;
            if (!url) {
                return Response.json({ error: `Digest "${digest_name}" has no Discord webhook configured` }, { status: 400 });
            }
        }

        if (!url) return Response.json({ error: 'webhook_url or digest_name required' }, { status: 400 });

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `✅ **MergeRSS Test Message**\nYour Discord integration is working correctly! Digests will be delivered here.`,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            return Response.json({ error: `Discord returned ${res.status}: ${text}` }, { status: 400 });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});