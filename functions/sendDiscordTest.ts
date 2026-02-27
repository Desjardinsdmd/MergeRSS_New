import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { webhook_url } = await req.json();
        if (!webhook_url) return Response.json({ error: 'webhook_url required' }, { status: 400 });

        const res = await fetch(webhook_url, {
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