import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ─── CANONICAL COPY: brand v3 chat tokens (source of truth: functions/lib/brand.ts) ──
// Slack / Discord / Teams: violet accent, "MergeRSS briefing" attribution, no amber, no emoji.
const BRAND_CHAT = { violet: '#9B5CF6', violetInt: 10181878, attribution: 'MergeRSS briefing', site: 'https://mergerss.com' };
// ─── end CANONICAL COPY ──────────────────────────────────────────────────────


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
            // Brand v3: violet accent bar + attribution; plain text kept as the notification fallback.
            body: JSON.stringify({
                text: String(text ?? ''),
                attachments: [{
                    color: BRAND_CHAT.violet,
                    blocks: [
                        { type: 'context', elements: [{ type: 'mrkdwn', text: `*${BRAND_CHAT.attribution}*` }] },
                        { type: 'section', text: { type: 'mrkdwn', text: String(text ?? '').slice(0, 2900) || ' ' } },
                    ],
                }],
            }),
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