import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * notifyUser: send a short operational email to one user, honouring their
 * User.notification_prefs. Missing keys default to ON.
 *
 * Preference keys (set in Settings > Notification Preferences):
 *   emailNotifications  master switch for all operational email
 *   digestReminders     digest skipped / stalled alerts
 *   feedErrors          feed auto-paused alerts
 *
 * Callers: admin/scheduler, or another function with x-internal-secret.
 * Normal users cannot call this (it would be an email relay).
 *
 * Base44 functions cannot import each other, so generateDigests and fetchFeeds
 * carry a CANONICAL COPY of notifyOwner() below. Keep them in sync.
 *
 * Body: { to, pref, subject, heading, lines: string[], cta_url, cta_label }
 */

// ─── CANONICAL COPY: notifyOwner (keep in sync with generateDigests, fetchFeeds) ──
const NOTIFY_PRIMARY = '#9463e3';
const NOTIFY_FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
function notifyEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function renderNotifyEmail({ heading, lines, ctaUrl, ctaLabel }) {
    const paras = (lines || []).filter(Boolean).map(l =>
        `<p style="margin:0 0 12px;font:400 14px/1.7 ${NOTIFY_FONT};color:#d6d3d1;">${notifyEsc(l)}</p>`).join('');
    const cta = ctaUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr><td style="background:${NOTIFY_PRIMARY};"><a href="${notifyEsc(ctaUrl)}" style="display:inline-block;padding:11px 18px;font:600 14px/1 ${NOTIFY_FONT};color:#1c1917;text-decoration:none;">${notifyEsc(ctaLabel || 'Open MergeRSS')}</a></td></tr></table>`
        : '';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0a06;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0a06;"><tr><td align="center" style="padding:24px 12px 40px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;">
<tr><td style="padding:0 0 16px;font:700 18px/1 ${NOTIFY_FONT};color:#f5f5f4;">MergeRSS</td></tr>
<tr><td style="background:#0c0a09;border:1px solid #292524;padding:24px;">
<h1 style="margin:0 0 14px;font:700 19px/1.35 ${NOTIFY_FONT};color:#f5f5f4;">${notifyEsc(heading)}</h1>
${paras}${cta}
</td></tr>
<tr><td style="padding:16px 0 0;font:400 12px/1.6 ${NOTIFY_FONT};color:#78716c;">You can turn these emails off in MergeRSS under Settings, Notification Preferences.</td></tr>
</table></td></tr></table></body></html>`;
}
// Returns { sent: boolean, reason?: string }
async function notifyOwner(base44, { email, pref, subject, heading, lines, ctaUrl, ctaLabel }) {
    if (!email) return { sent: false, reason: 'no_email' };
    let user = null;
    try {
        const raw = await base44.asServiceRole.entities.User.filter({ email }, '-created_date', 1);
        const list = Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
        user = list[0] || null;
    } catch { user = null; }
    if (!user) return { sent: false, reason: 'user_not_found' };
    const prefs = (user.notification_prefs && typeof user.notification_prefs === 'object') ? user.notification_prefs : {};
    if (prefs.emailNotifications === false) return { sent: false, reason: 'email_off' };
    if (pref && prefs[pref] === false) return { sent: false, reason: `${pref}_off` };
    try {
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            from_name: 'MergeRSS',
            subject: String(subject || heading || 'MergeRSS').slice(0, 140),
            body: renderNotifyEmail({ heading, lines, ctaUrl, ctaLabel }),
        });
        return { sent: true };
    } catch (e) {
        console.warn(`[notifyOwner] SendEmail failed for ${email}: ${e?.message}`);
        return { sent: false, reason: 'send_failed' };
    }
}
// ─── end CANONICAL COPY ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const internalSecret = req.headers.get('x-internal-secret');
        const expected = Deno.env.get('INTERNAL_SECRET');
        const isInternal = !!(internalSecret && expected && internalSecret === expected);
        if (!isInternal) {
            const user = await base44.auth.me().catch(() => null);
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { to, pref, subject, heading, lines, cta_url, cta_label } = body || {};
        if (!to || !heading) return Response.json({ error: 'to and heading are required' }, { status: 400 });
        if (pref && !['digestReminders', 'feedErrors'].includes(pref)) {
            return Response.json({ error: 'unknown pref' }, { status: 400 });
        }
        const result = await notifyOwner(base44, {
            email: to, pref, subject, heading,
            lines: Array.isArray(lines) ? lines.map(String).slice(0, 12) : [],
            ctaUrl: cta_url, ctaLabel: cta_label,
        });
        return Response.json(result);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
