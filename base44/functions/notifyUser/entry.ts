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

// ─── CANONICAL COPY: brand v3 + emailShell (source of truth: functions/lib/brand.ts) ──
// Design system v3 "briefing studio" (BRAND.md). Solid hex only so Outlook renders it,
// table layout, no webfont links. Keep every inlined copy in sync with lib/brand.ts.
const BRAND = {
    ink: '#0A0910', panel: '#17151F', raised: '#25222F', hairline: '#2A2636', line: '#363244',
    text: '#F3F1F7', body: '#C9C5D4', muted: '#A29DB1', meta: '#7C778B', faint: '#5C576B',
    violet: '#9B5CF6', violetDeep: '#7C3AED', violetLight: '#C4A5FD', chipBg: '#241B3A',
    emerald: '#34D399', emeraldBg: '#1A282B',
    red: '#F87171', redBg: '#2D1E27',
    sky: '#38BDF8', skyBg: '#1A2635',
    amber: '#FBBF24', amberBg: '#2E2620', amberBorder: '#503F20', // warnings only
    violetInt: 10181878, // Discord embed colour for #9B5CF6
    display: "'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif",
    sans: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
    site: 'https://mergerss.com',
    name: 'MergeRSS',
    tagline: 'briefing studio',
    attribution: 'MergeRSS briefing',
    sentBy: 'Sent by MergeRSS, the briefing studio',
};
function brandEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function brandUrl(u) {
    try { const x = new URL(String(u)); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : ''; }
    catch { return ''; }
}
// Mono micro label / eyebrow (10px, uppercase, wide tracking).
function emailMicro(text, color) {
    return `<span style="font:600 10px/1.4 ${BRAND.mono};letter-spacing:0.14em;text-transform:uppercase;color:${color || BRAND.meta};">${brandEsc(text)}</span>`;
}
// Bulletproof primary button: violet fill, white text, 12px radius.
function emailButton(url, label) {
    const href = brandUrl(url);
    if (!href) return '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td align="center" bgcolor="${BRAND.violet}" style="background:${BRAND.violet};border-radius:12px;">
<a href="${brandEsc(href)}" target="_blank" style="display:inline-block;padding:13px 22px;font:600 14px/1 ${BRAND.sans};color:#FFFFFF;text-decoration:none;border-radius:12px;">${brandEsc(label || 'Open in MergeRSS')}</a>
</td></tr></table>`;
}
// Rounded panel (20px radius, hairline border). innerHtml is trusted markup.
function emailPanel(innerHtml, opts = {}) {
    const pad = opts.padding || '24px';
    const border = opts.accent ? BRAND.violetDeep : BRAND.hairline;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.panel};border:1px solid ${border};border-radius:20px;">
<tr><td class="px" style="padding:${pad};">${innerHtml}</td></tr></table>`;
}
// Amber warning card (warnings only: paused, skipped, needs attention).
function emailWarning(text) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.amberBg};border:1px solid ${BRAND.amberBorder};border-radius:12px;">
<tr><td style="padding:12px 16px;font:500 13px/1.6 ${BRAND.sans};color:${BRAND.amber};">${brandEsc(text)}</td></tr></table>`;
}
// Full email document: ink page, logo lockup header, body slot, footer.
// bodyHtml is trusted markup (callers escape their own data). footerLinks: [{ label, url }].
function emailShell({ preheader, title, bodyHtml, footerNote, dateLabel, footerLinks }) {
    const links = (footerLinks || []).filter(l => l && brandUrl(l.url))
        .map(l => `<a href="${brandEsc(brandUrl(l.url))}" style="color:${BRAND.violetLight};text-decoration:underline;">${brandEsc(l.label)}</a>`)
        .join(`<span style="color:${BRAND.faint};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${brandEsc(title || BRAND.name)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.ink}; }
  a { color:${BRAND.violetLight}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .h1 { font-size:24px !important; }
    .thumb { display:none !important; }
    .hide-sm { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.ink};" bgcolor="${BRAND.ink}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${brandEsc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.ink}" style="background:${BRAND.ink};">
<tr><td align="center" style="padding:28px 12px 44px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:0 4px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
        <td width="32" height="32" bgcolor="${BRAND.violet}" style="width:32px;height:32px;background:${BRAND.violet};border-radius:9px;font-size:0;line-height:0;">&nbsp;</td>
        <td valign="middle" style="padding-left:11px;">
          <div style="font:600 17px/1.1 ${BRAND.display};letter-spacing:-0.01em;color:${BRAND.text};">${BRAND.name}</div>
          <div style="font:400 10px/1.4 ${BRAND.mono};letter-spacing:0.08em;color:${BRAND.meta};">${BRAND.tagline}</div>
        </td>
      </tr></table>
    </td>
    ${dateLabel ? `<td align="right" valign="middle" style="font:500 11px/1.4 ${BRAND.mono};letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.meta};">${brandEsc(dateLabel)}</td>` : ''}
  </tr></table>
</td></tr>
<tr><td>${bodyHtml || ''}</td></tr>
<tr><td style="padding:24px 4px 0;">
  ${footerNote ? `<p style="margin:0 0 10px;font:400 12px/1.6 ${BRAND.sans};color:${BRAND.meta};">${brandEsc(footerNote)}</p>` : ''}
  ${links ? `<p style="margin:0 0 10px;font:400 12px/1.6 ${BRAND.sans};color:${BRAND.meta};">${links}</p>` : ''}
  <p style="margin:0;font:400 11px/1.6 ${BRAND.mono};letter-spacing:0.04em;color:${BRAND.faint};">${brandEsc(BRAND.sentBy)} &middot; <a href="${BRAND.site}" style="color:${BRAND.faint};text-decoration:underline;">mergerss.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
// ─── end CANONICAL COPY: brand v3 ──────────────────────────────────────────

// ─── CANONICAL COPY: notifyOwner (source of truth: functions/notifyUser/entry.ts) ──
// Needs the brand v3 CANONICAL COPY (BRAND, emailShell, emailPanel, emailButton) above it.
// tone: 'warning' adds the amber "Needs attention" eyebrow (paused, skipped); default is violet.
function renderNotifyEmail({ heading, lines, ctaUrl, ctaLabel, tone, eyebrow }) {
    const warn = tone === 'warning';
    const paras = (lines || []).filter(Boolean).map(l =>
        `<p style="margin:0 0 12px;font:400 15px/1.7 ${BRAND.sans};color:${BRAND.body};">${brandEsc(l)}</p>`).join('');
    const cta = ctaUrl ? `<div style="margin-top:20px;">${emailButton(ctaUrl, ctaLabel || 'Open in MergeRSS')}</div>` : '';
    const inner = `<p style="margin:0 0 10px;">${emailMicro(eyebrow || (warn ? 'Needs attention' : 'Account notice'), warn ? BRAND.amber : BRAND.violet)}</p>
<h1 class="h1" style="margin:0 0 16px;font:600 22px/1.3 ${BRAND.display};color:${BRAND.text};">${brandEsc(heading)}</h1>
${paras}${cta}`;
    return emailShell({
        preheader: (lines || []).find(Boolean) || heading,
        title: heading,
        bodyHtml: emailPanel(inner),
        footerNote: 'You can turn these emails off in MergeRSS under Settings, Notification preferences.',
        footerLinks: [{ label: 'Notification preferences', url: `${BRAND.site}/Settings` }],
    });
}
// Returns { sent: boolean, reason?: string }
async function notifyOwner(base44, { email, pref, subject, heading, lines, ctaUrl, ctaLabel, tone, eyebrow }) {
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
            body: renderNotifyEmail({ heading, lines, ctaUrl, ctaLabel, tone, eyebrow }),
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
