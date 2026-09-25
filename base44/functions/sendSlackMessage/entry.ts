import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';


// Strict webhook host check: parse the URL, https only, exact host or subdomain.
// (A substring check let "https://attacker.example/?hooks.slack.com" through.)
function isAllowedWebhook(url, hosts) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        return hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    } catch { return false; }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { webhook_url, text } = await req.json();

        if (!webhook_url || !isAllowedWebhook(webhook_url, ['hooks.slack.com'])) {
            return Response.json({ error: 'Invalid Slack webhook URL' }, { status: 400 });
        }

        const res = await fetch(webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (!res.ok) {
            // Never echo the upstream body back to the caller.
            return Response.json({ success: false, error: `Slack returned HTTP ${res.status}` }, { status: 200 });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});