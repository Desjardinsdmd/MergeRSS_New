import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { webhook_url, text } = await req.json();

        if (!webhook_url || !webhook_url.includes('hooks.slack.com')) {
            return Response.json({ error: 'Invalid Slack webhook URL' }, { status: 400 });
        }

        const res = await fetch(webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (!res.ok) {
            const errText = await res.text();
            return Response.json({ success: false, error: errText }, { status: 200 });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});