import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Hard wall-clock budget — stop before Deno's CPU limit hits
const WALL_BUDGET_MS = 45000;
// Max digests per scheduled run. The loop stops earlier when WALL_BUDGET_MS is spent;
// skipped slots no longer re-enter the queue every hour, so the cap is spent on real sends.
const MAX_DIGESTS_PER_RUN = 25;
// Lock constants — same pattern as other background jobs
const LOCK_WINDOW_MS = 10 * 60 * 1000;
const ZOMBIE_TTL_MS  = 15 * 60 * 1000;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'object') return [];
    if (Array.isArray(raw.items))   return raw.items;
    if (Array.isArray(raw.data))    return raw.data;
    if (Array.isArray(raw.results)) return raw.results;
    const found = Object.values(raw).find(v => Array.isArray(v));
    return found || [];
}

// ── Schedule helpers (timezone-aware, no external deps) ─────────────────────
function tzParts(date, timeZone) {
    const f = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
    const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday);
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd };
}
// UTC instant for a wall-clock time in a zone (handles DST by one correction pass).
function zonedToUtc(y, m, d, h, mi, timeZone) {
    let guess = Date.UTC(y, m - 1, d, h, mi);
    for (let k = 0; k < 2; k++) {
        const p = tzParts(new Date(guess), timeZone);
        const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
        guess += Date.UTC(y, m - 1, d, h, mi) - asUtc;
    }
    return new Date(guess);
}
// Most recent scheduled slot <= now, or null if the digest has no schedule_time.
// fallbackTz: the owner's User.timezone, used when the digest has none.
function lastScheduledSlot(digest, now, fallbackTz) {
    const t = digest.schedule_time;
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    const [hh, mm] = t.split(':').map(Number);
    const tz = digest.timezone || fallbackTz || 'America/New_York';
    let local;
    try { local = tzParts(now, tz); } catch { return null; }
    for (let back = 0; back <= 31; back++) {
        const probe = new Date(Date.UTC(local.y, local.m - 1, local.d) - back * 86400000);
        const y = probe.getUTCFullYear(), m = probe.getUTCMonth() + 1, d = probe.getUTCDate();
        const wd = probe.getUTCDay();
        if (digest.frequency === 'weekly' && digest.schedule_day_of_week != null && wd !== digest.schedule_day_of_week) continue;
        if (digest.frequency === 'monthly' && digest.schedule_day_of_month != null && d !== digest.schedule_day_of_month) continue;
        const slot = zonedToUtc(y, m, d, hh, mm, tz);
        if (slot <= now) return slot;
    }
    return null;
}

// Natural coverage window of a digest, in days.
function naturalWindowDays(digest) {
    if (digest.frequency === 'weekly') return 7;
    if (digest.frequency === 'monthly') return 31;
    return 1;
}

// ── Candidate selection (2026-09-26) ─────────────────────────────────────────
// Rank by enrichment importance (falls back to recency), then drop near-duplicates:
// same canonical URL, same normalized title, or same story cluster.
function normUrl(u) {
    try {
        const x = new URL(String(u));
        return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
    } catch { return String(u || '').toLowerCase().trim(); }
}
function normTitle(t) {
    return stripTags(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function selectCandidates(items, since, now, max) {
    const span = Math.max(1, now.getTime() - since.getTime());
    const ranked = items.map(i => {
        const ts = new Date(i.published_date || i.created_date).getTime() || since.getTime();
        const recency = Math.min(1, Math.max(0, (ts - since.getTime()) / span)); // 0 oldest .. 1 newest
        const score = typeof i.importance_score === 'number' ? i.importance_score : null;
        // Unscored items sit mid-pack; recency only breaks ties and nudges (max +5).
        const rank = (score ?? 45) + recency * 5;
        return { i, rank, ts };
    }).sort((a, b) => (b.rank - a.rank) || (b.ts - a.ts));

    const seenUrl = new Set(), seenTitle = new Set(), seenCluster = new Set();
    const out = [];
    for (const { i } of ranked) {
        const u = normUrl(i.canonical_url || i.url);
        const t = normTitle(i.title);
        if ((u && seenUrl.has(u)) || (t && seenTitle.has(t)) || (i.cluster_id && seenCluster.has(i.cluster_id))) continue;
        if (u) seenUrl.add(u);
        if (t) seenTitle.add(t);
        if (i.cluster_id) seenCluster.add(i.cluster_id);
        out.push(i);
        if (out.length >= max) break;
    }
    return out;
}

// ── Skip notices (2026-09-26) ──────────────────────────────────────────────
const SKIP_REASON_TEXT = {
    no_feeds: 'none of the sources this briefing used still exist in your account',
    feeds_paused: 'all of the sources it draws from are paused or failing',
    no_items_in_categories: 'none of your sources published a story in its categories during the period',
    no_items_for_tags: 'none of your sources published a story with its tags during the period',
    no_items: 'none of its sources published a new story during the period',
};

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


// ═══ Email + brief helpers (added 2026-09-26, restyled to brand v3 2026-10-01) ═══
// Layout follows BRAND.md "Output surfaces": ink page, rounded panels, numbered section
// bands (01 Key signal in violet, 02 Read first, then one per topic), ranked story rows,
// mono meta lines, violet category chips. Palette and shell come from the brand v3
// CANONICAL COPY above (BRAND, emailShell, emailPanel, emailButton, emailMicro).
// Intelligence tags: semantic colour on a pre-blended 10% fill (solid hex for Outlook).
const TAG_STYLE = {
    Risk: { fg: BRAND.red, bg: BRAND.redBg },
    Opportunity: { fg: BRAND.emerald, bg: BRAND.emeraldBg },
    Trending: { fg: BRAND.sky, bg: BRAND.skyBg },
};

function esc(s) { return brandEsc(s); }
function stripTags(s) {
    return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function safeUrl(u) { return brandUrl(u); }
function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function clip(s, n) {
    const t = String(s ?? '');
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
}
function pad2(n) { return String(n).padStart(2, '0'); }

// Short relative time for meta lines: "45m ago", "6h ago", "Sep 28".
function relTime(iso, nowMs) {
    const t = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(t)) return '';
    const mins = Math.max(0, Math.round(((nowMs || Date.now()) - t) / 60000));
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Section outline shared by email, Slack, Discord and Teams so every surface uses the
// same numbering and names: 01 Key signal, 02 Read first, then one per topic.
function briefOutline(brief) {
    const all = brief.sections.flatMap(s => s.stories);
    const lead = all[0] || null;
    const topics = [];
    let n = lead ? 3 : 2;
    brief.sections.forEach((sec, i) => {
        const stories = (i === 0 && lead) ? sec.stories.slice(1) : sec.stories;
        if (!stories.length) return;
        topics.push({ num: n++, label: sec.label, stories });
    });
    return { lead, topics, total: all.length };
}

function chip(text, fg, bg) {
    return `<span style="display:inline-block;background:${bg};color:${fg};font:600 10px/1 ${BRAND.mono};letter-spacing:0.08em;text-transform:uppercase;padding:5px 8px;border-radius:6px;white-space:nowrap;">${esc(text)}</span>`;
}
function storyChips(story) {
    const out = [];
    if (story.category) out.push(chip(story.category, BRAND.violetLight, BRAND.chipBg));
    const st = TAG_STYLE[story.tag];
    if (st) out.push(chip(story.tag, st.fg, st.bg));
    return out.join('&nbsp;');
}

// Band at the top of each section panel: mono numeral, hairline tick, mono label.
function sectionBand(num, text, isKey) {
    const numColor = isKey ? BRAND.violet : BRAND.meta;
    const txtColor = isKey ? BRAND.violet : BRAND.muted;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
  <td valign="middle" style="font:700 12px/1 ${BRAND.mono};color:${numColor};">${pad2(num)}</td>
  <td valign="middle" style="padding:0 10px;"><div style="width:14px;height:1px;background:${isKey ? BRAND.violetDeep : BRAND.line};font-size:0;line-height:0;">&nbsp;</div></td>
  <td valign="middle">${emailMicro(text, txtColor)}</td>
</tr></table>`;
}

function metaLine(story, nowMs) {
    const url = safeUrl(story.url);
    const parts = [story.source || hostOf(url), relTime(story.published, nowMs)].filter(Boolean).map(esc);
    const sep = `<span style="color:${BRAND.faint};">&nbsp;·&nbsp;</span>`;
    const link = url ? `<a href="${esc(url)}" style="color:${BRAND.violetLight};text-decoration:none;">Read source&nbsp;&rarr;</a>` : '';
    const all = link ? [...parts, link] : parts;
    if (!all.length) return '';
    return `<p style="margin:12px 0 0;font:500 11px/1.5 ${BRAND.mono};letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.meta};">${all.join(sep)}</p>`;
}

function takeawayBlock(story) {
    if (!story.takeaway) return '';
    return `<p style="margin:12px 0 0;">${emailMicro('Why it matters', BRAND.violet)}</p>
<p style="margin:4px 0 0;font:400 14px/1.65 ${BRAND.sans};color:${BRAND.body};">${esc(story.takeaway)}</p>`;
}

function renderLead(story, nowMs) {
    const url = safeUrl(story.url);
    const hero = story.image
        ? `<a href="${esc(url)}"><img src="${esc(story.image)}" width="550" alt="" style="display:block;width:100%;max-width:550px;height:auto;border:0;border-radius:12px;background:${BRAND.raised};margin:0 0 18px;"></a>`
        : '';
    const chips = storyChips(story);
    return `${hero}
${chips ? `<div style="margin:0 0 10px;">${chips}</div>` : ''}
<a href="${esc(url)}" style="font:600 21px/1.3 ${BRAND.display};color:${BRAND.text};text-decoration:none;">${esc(story.headline)}</a>
<p style="margin:10px 0 0;font:400 15px/1.75 ${BRAND.sans};color:${BRAND.body};">${esc(story.summary)}</p>
${takeawayBlock(story)}${metaLine(story, nowMs)}`;
}

// Ranked story row: display numeral (first in violet, others meta), title, summary,
// chips, mono meta line, optional thumbnail on the right.
function renderStory(story, n, isLast, nowMs) {
    const url = safeUrl(story.url);
    const thumb = story.image
        ? `<td class="thumb" width="72" valign="top" style="padding:0 0 0 16px;width:72px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:cover;border:0;border-radius:10px;background:${BRAND.raised};"></a></td>`
        : '';
    const chips = storyChips(story);
    const divider = isLast ? '' : `border-bottom:1px solid ${BRAND.hairline};`;
    const pad = `${n === 1 ? 0 : 18}px 0 ${isLast ? 0 : 18}px`;
    return `<tr><td style="${divider}padding:${pad};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="40" valign="top" style="width:40px;font:600 22px/1.1 ${BRAND.display};color:${n === 1 ? BRAND.violet : BRAND.meta};">${n}</td>
    <td valign="top">
      <a href="${esc(url)}" style="font:600 16px/1.4 ${BRAND.display};color:${BRAND.text};text-decoration:none;">${esc(story.headline)}</a>
      <p style="margin:6px 0 0;font:400 14px/1.7 ${BRAND.sans};color:${BRAND.muted};">${esc(story.summary)}</p>
      ${chips ? `<div style="margin:10px 0 0;">${chips}</div>` : ''}
      ${takeawayBlock(story)}
      ${metaLine(story, nowMs)}
    </td>
    ${thumb}
  </tr></table>
</td></tr>`;
}

const GAP = `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>`;

function renderDigestEmail({ digestName, dateStr, shortDate, scannedCount, brief, inboxUrl, manageUrl, unsubscribeUrl, now }) {
    const nowMs = now ? new Date(now).getTime() : Date.now();
    const { lead, topics, total } = briefOutline(brief);
    const preheader = clip(stripTags(brief.lede || brief.title_line), 150);
    const countLine = `${total} ${total === 1 ? 'story' : 'stories'} · ${scannedCount} scanned`;

    const hero = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:4px 4px 22px;">
  <p style="margin:0 0 8px;">${emailMicro('Briefing', BRAND.violet)}</p>
  <h1 class="h1" style="margin:0;font:600 30px/1.15 ${BRAND.display};letter-spacing:-0.015em;color:${BRAND.text};">${esc(digestName)}</h1>
  <p style="margin:10px 0 0;font:500 11px/1.5 ${BRAND.mono};letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.meta};">${esc(dateStr)}<span style="color:${BRAND.faint};">&nbsp;·&nbsp;</span>${esc(countLine)}</p>
</td></tr></table>`;

    const keySignal = emailPanel(`${sectionBand(1, 'Key signal', true)}
<p style="margin:0;font:600 20px/1.4 ${BRAND.display};color:${BRAND.text};">${esc(brief.title_line)}</p>
${brief.lede ? `<p style="margin:14px 0 0;font:400 15px/1.75 ${BRAND.sans};color:${BRAND.body};">${esc(brief.lede)}</p>` : ''}`, { accent: true });

    const readFirst = lead ? emailPanel(`${sectionBand(2, 'Read first', false)}${renderLead(lead, nowMs)}`) : '';

    const topicPanels = topics.map(t => emailPanel(`${sectionBand(t.num, t.label, false)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${t.stories.map((s, i) => renderStory(s, i + 1, i === t.stories.length - 1, nowMs)).join('')}</table>`));

    const cta = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:26px 0 4px;">
  ${emailButton(inboxUrl, 'Open in MergeRSS')}
  <p style="margin:12px 0 0;font:400 13px/1.6 ${BRAND.sans};color:${BRAND.muted};">The full briefing and every story it drew on are in your Inbox.</p>
</td></tr></table>`;

    const bodyHtml = [hero, keySignal, readFirst, ...topicPanels].filter(Boolean).join(GAP) + cta;

    return emailShell({
        preheader,
        title: digestName,
        dateLabel: shortDate || '',
        bodyHtml,
        footerNote: `You are receiving ${digestName} because email delivery is on for this briefing. Summaries are written by MergeRSS from your sources; check the original story before relying on any detail.`,
        footerLinks: [
            { label: 'Manage briefing', url: manageUrl },
            { label: 'Unsubscribe', url: unsubscribeUrl || manageUrl },
        ],
    });
}

// ── Chat surfaces (Slack / Discord / Teams): same sections and vocabulary as the email ──
function storyLines(s, fmtLink) {
    const url = safeUrl(s.url);
    const meta = [s.source || hostOf(url), s.category].filter(Boolean).join(' · ');
    let out = `*${s.headline}*\n${s.summary}`;
    if (s.takeaway) out += `\n_Why it matters:_ ${s.takeaway}`;
    if (url) out += `\n${fmtLink(url, meta || 'Read source')}`;
    else if (meta) out += `\n${meta}`;
    return out;
}

function briefToSlack(brief, { name, dateStr, count, url }) {
    const { lead, topics, total } = briefOutline(brief);
    const link = (u, t) => `<${u}|${String(t).replace(/[<>|]/g, '')}>`;
    const sec = (text) => ({ type: 'section', text: { type: 'mrkdwn', text: clip(text, 2900) } });
    const blocks = [
        { type: 'context', elements: [{ type: 'mrkdwn', text: `*${BRAND.attribution}*  ·  ${dateStr}  ·  ${total} ${total === 1 ? 'story' : 'stories'} from ${count} scanned` }] },
        { type: 'header', text: { type: 'plain_text', text: clip(name, 150) } },
        sec(`*01  Key signal*\n*${brief.title_line}*${brief.lede ? `\n${brief.lede}` : ''}`),
    ];
    if (lead) blocks.push({ type: 'divider' }, sec(`*02  Read first*\n${storyLines(lead, link)}`));
    for (const t of topics) {
        if (blocks.length > 40) break;
        blocks.push({ type: 'divider' }, sec(`*${pad2(t.num)}  ${t.label}*\n\n${t.stories.map(s => storyLines(s, link)).join('\n\n')}`));
    }
    blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in MergeRSS' }, url, style: 'primary' }] });
    return {
        text: `${BRAND.attribution}: ${name}, ${dateStr}. ${brief.title_line}`,
        attachments: [{ color: BRAND.violet, blocks }],
    };
}

function briefToDiscord(brief, { name, dateStr, count, url }) {
    const { lead, topics, total } = briefOutline(brief);
    const link = (u, t) => `[${String(t).replace(/[[\]]/g, '')}](${u})`;
    const md = (s) => storyLines(s, link).replace(/^\*(.+)\*$/m, '**$1**');
    let budget = 5600; // Discord: 6000 chars per message across all embed text
    const take = (s, max) => {
        const n = Math.min(max, budget);
        if (n < 2) return '';
        const v = clip(s, n);
        budget -= v.length;
        return v;
    };
    const title = take(name, 250);
    const description = take(`**01 · Key signal**\n**${brief.title_line}**${brief.lede ? `\n${brief.lede}` : ''}`, 1500);
    const fields = [];
    if (lead) fields.push({ name: take('02 · Read first', 256) || 'Read first', value: take(md(lead), 1024) || '—' });
    for (const t of topics) {
        if (budget < 200 || fields.length >= 24) break;
        fields.push({ name: take(`${pad2(t.num)} · ${t.label}`, 256) || pad2(t.num), value: take(t.stories.map(md).join('\n\n'), 1024) || '—' });
    }
    return {
        username: 'MergeRSS',
        embeds: [{
            color: BRAND.violetInt,
            author: { name: BRAND.attribution, url: BRAND.site },
            title,
            url,
            description,
            fields,
            footer: { text: `${dateStr} · ${total} ${total === 1 ? 'story' : 'stories'} from ${count} scanned · Open in MergeRSS for the full briefing` },
        }],
    };
}

// Adaptive Cards cannot take a custom hex colour, so the violet accent is carried by the
// theme "Accent" colour on the attribution and section labels.
function briefToTeams(brief, { name, dateStr, count, url }) {
    const { lead, topics, total } = briefOutline(brief);
    const link = (u, t) => `[${String(t).replace(/[[\]]/g, '')}](${u})`;
    const label = (text) => ({ type: 'TextBlock', text, weight: 'Bolder', size: 'Small', color: 'Accent', spacing: 'Large', wrap: true });
    const textBlock = (text) => ({ type: 'TextBlock', text: clip(text, 3000), wrap: true, spacing: 'Small' });
    const body = [
        { type: 'TextBlock', text: BRAND.attribution.toUpperCase(), weight: 'Bolder', size: 'Small', color: 'Accent' },
        { type: 'TextBlock', text: name, weight: 'Bolder', size: 'Large', wrap: true, spacing: 'Small' },
        { type: 'TextBlock', text: `${dateStr} · ${total} ${total === 1 ? 'story' : 'stories'} from ${count} scanned`, isSubtle: true, spacing: 'None', wrap: true },
        label('01  KEY SIGNAL'),
        textBlock(`**${brief.title_line}**${brief.lede ? `\n\n${brief.lede}` : ''}`),
    ];
    if (lead) body.push(label('02  READ FIRST'), textBlock(storyLines(lead, link).replace(/^\*(.+)\*$/m, '**$1**')));
    for (const t of topics) {
        body.push(label(`${pad2(t.num)}  ${String(t.label).toUpperCase()}`),
            textBlock(t.stories.map(s => storyLines(s, link).replace(/^\*(.+)\*$/m, '**$1**')).join('\n\n')));
    }
    body.push({ type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: 'Open in MergeRSS', url }] });
    return {
        type: 'message',
        attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
                type: 'AdaptiveCard',
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                version: '1.4',
                msteams: { width: 'Full' },
                body,
            },
        }],
    };
}

// Markdown version of the brief for web inbox, Slack, Teams and Discord.
function briefToMarkdown(brief) {
    const out = [`### ${brief.title_line}`];
    if (brief.lede) out.push(brief.lede);
    for (const sec of brief.sections) {
        out.push(`#### ${sec.label}`);
        for (const s of sec.stories) {
            const url = safeUrl(s.url);
            let block = `**${s.headline}**\n${s.summary}`;
            if (s.takeaway) block += `\n*Why it matters:* ${s.takeaway}`;
            if (url) block += `\n[Read on ${hostOf(url) || 'source'}](${url})`;
            out.push(block);
        }
    }
    return out.join('\n\n');
}


// ── Structured brief ────────────────────────────────────────────────────────
const STORY_TARGET = { short: 5, medium: 8, long: 12 };
const SUMMARY_GUIDE = {
    short: 'one sentence, max 30 words',
    medium: 'two sentences, max 55 words',
    long: 'three to four sentences, max 90 words, with context',
};
const BRIEF_SCHEMA = {
    type: 'object',
    properties: {
        title_line: { type: 'string' },
        lede: { type: 'string' },
        sections: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    label: { type: 'string' },
                    stories: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                ref: { type: 'number' },
                                headline: { type: 'string' },
                                summary: { type: 'string' },
                                takeaway: { type: 'string' },
                            },
                            required: ['ref', 'headline', 'summary'],
                        },
                    },
                },
                required: ['label', 'stories'],
            },
        },
    },
    required: ['title_line', 'lede', 'sections'],
};

function buildBriefPrompt(digest, topItems, since, now, target) {
    const len = digest.output_length || 'medium';
    return `You are the editor of "${digest.name}", a professional intelligence briefing read by senior operators and investors.

Date range: ${since.toLocaleDateString()} to ${now.toLocaleDateString()}
Articles available: ${topItems.length}

Select the ${target} most important articles and organize them into 2 to 4 sections with short plain labels (1 to 3 words, sentence case). Put the single most important story first in the first section.

Return:
- title_line: one sentence, max 14 words, naming the dominant theme of the period.
- lede: 2 to 3 sentences summarizing what happened and why it matters.
- For each story: ref (the article number below), headline (rewritten, max 12 words, sentence case), summary (${SUMMARY_GUIDE[len] || SUMMARY_GUIDE.medium}), takeaway (one sentence on the practical implication for the reader, or an empty string if there is none).

Style rules: plain, confident, institutional English. No em dashes. No emojis. No markdown. No URLs. Use only facts stated in the article text. Never reuse an article number.

Articles:
${topItems.map((item, idx) => `${idx + 1}. [${item.category || 'General'}] ${stripTags(item.title)}
   ${stripTags(item.ai_summary || item.description).slice(0, 500)}`).join('\n\n')}`;
}

// Validates the LLM output and attaches the real URL/tag from the source item,
// so links can never be hallucinated.
function normalizeBrief(raw, topItems) {
    let b = raw;
    if (typeof b === 'string') { try { b = JSON.parse(b.replace(/```json|```/g, '').trim()); } catch { return null; } }
    if (!b || !Array.isArray(b.sections)) return null;
    const used = new Set();
    const sections = [];
    for (const sec of b.sections) {
        const stories = [];
        for (const s of (sec?.stories || [])) {
            const idx = Math.round(Number(s?.ref)) - 1;
            const item = topItems[idx];
            if (!item || used.has(idx) || !s.headline || !s.summary) continue;
            used.add(idx);
            stories.push({
                headline: stripTags(s.headline),
                summary: stripTags(s.summary),
                takeaway: stripTags(s.takeaway || ''),
                url: safeUrl(item.url),
                tag: item.intelligence_tag && item.intelligence_tag !== 'Neutral' ? item.intelligence_tag : '',
                category: item.category && item.category !== 'General' ? String(item.category) : '',
                source: item.__source_name || hostOf(item.url),
                published: item.published_date || item.created_date || '',
                image: item.image_url || '',
            });
        }
        if (stories.length) sections.push({ label: stripTags(sec.label) || 'Top stories', stories });
    }
    if (!sections.length) return null;
    return {
        title_line: stripTags(b.title_line) || 'Your briefing',
        lede: stripTags(b.lede || ''),
        sections,
    };
}

// No-LLM fallback so a briefing still goes out cleanly if the model call fails.
function fallbackBrief(topItems, target) {
    return {
        title_line: `${Math.min(target, topItems.length)} stories worth your time`,
        lede: '',
        sections: [{
            label: 'Top stories',
            stories: topItems.slice(0, target).map(item => ({
                headline: clip(stripTags(item.title), 120),
                summary: clip(stripTags(item.ai_summary || item.description), 280),
                takeaway: '',
                url: safeUrl(item.url),
                tag: item.intelligence_tag && item.intelligence_tag !== 'Neutral' ? item.intelligence_tag : '',
                category: item.category && item.category !== 'General' ? String(item.category) : '',
                source: item.__source_name || hostOf(item.url),
                published: item.published_date || item.created_date || '',
                image: item.image_url || '',
            })),
        }],
    };
}

// Pulls og:image from the article page. Reads only the <head>, gives up fast.
async function fetchOgImage(url, timeoutMs = 2500) {
    const target = safeUrl(url);
    if (!target) return '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(target, {
            signal: ctrl.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)', 'Accept': 'text/html' },
        });
        if (!res.ok || !res.body) return '';
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let html = '';
        while (html.length < 200000) {
            const { done, value } = await reader.read();
            if (done) break;
            html += dec.decode(value, { stream: true });
            if (/<\/head>/i.test(html)) break;
        }
        try { await reader.cancel(); } catch {}
        const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
        if (!m) return '';
        const img = new URL(m[1].replace(/&amp;/g, '&'), target).toString();
        return img.startsWith('https://') ? img : '';
    } catch {
        return '';
    } finally {
        clearTimeout(timer);
    }
}

// Stories already carry the image saved at fetch time (FeedItem.image_url). Only the
// few without one are looked up live, so a send never waits on many page fetches.
async function attachImages(brief, max = 8) {
    const stories = brief.sections.flatMap(s => s.stories).slice(0, max).filter(s => !s.image);
    const images = await Promise.all(stories.map(s => fetchOgImage(s.url)));
    stories.forEach((s, i) => { s.image = images[i] || ''; });
}


Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const startedAt = new Date().toISOString();
        const startTime = Date.now();
        const now = new Date();

        const body = await req.json().catch(() => ({}));
        const { digest_id, force } = body;

        // ── Distributed lock — same SystemHealth-based pattern as other jobs ──────
        // For single-digest manual runs (digest_id provided) skip the global lock,
        // since those are user-triggered and not at risk of scheduler overlap.
        let lockRecord = null;
        if (!digest_id) {
            const activeLocks = extractItems(await base44.asServiceRole.entities.SystemHealth.filter(
                { job_type: 'digest_generation', status: 'running' }, '-started_at', 5
            ).catch(() => []));

            for (const stale of activeLocks) {
                const age = Date.now() - new Date(stale.started_at).getTime();
                const lastHb = stale.metadata?.last_heartbeat_at
                    ? Date.now() - new Date(stale.metadata.last_heartbeat_at).getTime()
                    : age;
                if (age >= ZOMBIE_TTL_MS || lastHb > ZOMBIE_TTL_MS) {
                    await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                        status: 'failed', completed_at: new Date().toISOString(),
                        error_message: `Zombie reclaimed by new digest run at ${startedAt}`,
                    }).catch(() => {});
                }
            }

            const liveLock = activeLocks.find(r => {
                const age = Date.now() - new Date(r.started_at).getTime();
                const lastHb = r.metadata?.last_heartbeat_at
                    ? Date.now() - new Date(r.metadata.last_heartbeat_at).getTime()
                    : age;
                return age < LOCK_WINDOW_MS && lastHb < ZOMBIE_TTL_MS;
            });
            if (liveLock) {
                console.warn(`[generateDigests] SKIPPED — another run is active since ${liveLock.started_at}`);
                return Response.json({ skipped: true, reason: 'Another digest generation run is active' });
            }

            try {
                lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
                    job_type: 'digest_generation',
                    status: 'running',
                    started_at: startedAt,
                    metadata: { last_heartbeat_at: startedAt },
                });
            } catch {}
        }

        console.log(`[generateDigests] Run started — digest_id=${digest_id || 'all'} force=${force || false}`);

        // Allowlist for outbound webhook fetches — prevents SSRF
        const ALLOWED_WEBHOOK_HOSTS = [
            'hooks.slack.com',
            'discord.com',
            'discordapp.com',
            'outlook.office.com',
            'outlook.office365.com',
            'webhook.office.com',
        ];
        function isAllowedWebhookUrl(url) {
            try {
                const { hostname, protocol } = new URL(url);
                if (!['https:', 'http:'].includes(protocol)) return false;
                return ALLOWED_WEBHOOK_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
            } catch { return false; }
        }

        // Auth check
        let callerEmail = null;
        let callerUser = null;
        try { callerUser = await base44.auth.me(); } catch { callerUser = null; }
        callerEmail = callerUser?.email || null;
        // Hardened 2026-09-25: single-digest runs need a logged-in owner;
        // the full batch (no digest_id) is admin/scheduler only.
        if (!callerUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (!digest_id && callerUser.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        let digests;
        if (digest_id) {
            const all = extractItems(await base44.asServiceRole.entities.Digest.list());
            const d = all.find(x => x.id === digest_id);
            if (d && callerEmail && d.created_by !== callerEmail) {
                // Shared briefing: an active owner/editor of its workspace may also run it.
                let teamOk = false;
                if (d.workspace_id) {
                    const mine = extractItems(await base44.asServiceRole.entities.WorkspaceMember.filter(
                        { workspace_id: d.workspace_id, user_email: callerEmail.toLowerCase(), status: 'active' }, '-created_date', 1
                    ).catch(() => []));
                    teamOk = !!mine[0] && ['owner', 'editor'].includes(mine[0].role);
                }
                if (!teamOk) return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
            digests = d ? [d] : [];
        } else {
            digests = extractItems(await base44.asServiceRole.entities.Digest.filter({ status: 'active' }, '-created_date', 2000));
        }

        // Owner lookup (2026-09-26): one query for every digest owner. Used for the
        // owner's timezone default, plan enforcement and notification prefs.
        const ownerEmails = [...new Set(digests.map(d => d.created_by).filter(Boolean))];
        const ownerByEmail = {};
        if (ownerEmails.length) {
            const owners = extractItems(await base44.asServiceRole.entities.User.filter(
                { email: { $in: ownerEmails } }, '-created_date', 1000
            ).catch(() => []));
            for (const u of owners) if (u?.email) ownerByEmail[u.email] = u;
        }
        // ── Team workspaces (shared briefings) ──────────────────────────────────
        // A digest with workspace_id is a shared briefing only while the workspace is live
        // and the digest's creator is still an active member. Its feed pool is the feeds
        // shared into the workspace by active members; it is delivered web + email to every
        // active member (email respects each member's master switch) and, only when
        // workspace.plan === 'team', once to the workspace's Slack / Discord / Teams webhooks.
        // A digest whose workspace context is invalid is dropped from this run (never sent to
        // a stale audience, never silently turned personal). Personal digests are unchanged.
        const sharedCtx = new Map(); // digest.id -> { ws, members: [{ email, role, user }] }
        const wsIds = [...new Set(digests.map(d => d.workspace_id).filter(Boolean))];
        if (wsIds.length) {
            const svcE = base44.asServiceRole.entities;
            const wss = extractItems(await svcE.Workspace.filter({ id: { $in: wsIds } }, '-created_date', 500).catch(() => []))
                .filter(w => w.status !== 'deleted');
            const wsMap = Object.fromEntries(wss.map(w => [w.id, w]));
            const mems = extractItems(await svcE.WorkspaceMember.filter(
                { workspace_id: { $in: wsIds }, status: 'active' }, '-created_date', 2000
            ).catch(() => []));
            const memEmails = [...new Set(mems.map(m => String(m.user_email || '').toLowerCase()).filter(Boolean))];
            const memUsers = {};
            if (memEmails.length) {
                for (const u of extractItems(await svcE.User.filter({ email: { $in: memEmails } }, '-created_date', 1000).catch(() => []))) {
                    if (u?.email) memUsers[u.email.toLowerCase()] = u;
                }
            }
            for (const d of digests) {
                if (!d.workspace_id) continue;
                const ws = wsMap[d.workspace_id];
                const members = mems.filter(m => m.workspace_id === d.workspace_id).map(m => {
                    const email = String(m.user_email || '').toLowerCase();
                    return { email, role: m.role, user: memUsers[email] || null };
                });
                const creatorActive = members.some(m => m.email === String(d.created_by || '').toLowerCase());
                if (ws && creatorActive) sharedCtx.set(d.id, { ws, members });
            }
            const before = digests.length;
            digests = digests.filter(d => !d.workspace_id || sharedCtx.has(d.id));
            if (digests.length < before) console.log(`[generateDigests] Dropped ${before - digests.length} shared digest(s) with no live workspace context`);
        }

        const ownerTz = (d) => {
            const tz = ownerByEmail[d.created_by]?.timezone;
            if (!tz) return null;
            try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
        };
        const slotOf = new Map();

        // Due check: a digest is due once its most recent scheduled slot has passed
        // and that slot has not been evaluated yet (sent OR skipped). Marking skipped
        // slots in last_evaluated_slot (2026-09-26) stops a skipped digest from being
        // re-processed every hour for the same slot and eating the per-run cap.
        // Digests without a schedule_time keep the elapsed-time rule, using the later
        // of last_sent and last_skip_at.
        const dueDigests = force ? digests : digests.filter(digest => {
            const slot = lastScheduledSlot(digest, now, ownerTz(digest));
            if (slot) {
                slotOf.set(digest.id, slot);
                if (!digest_id && digest.last_evaluated_slot && new Date(digest.last_evaluated_slot) >= slot) return false;
                if (!digest.last_sent) return true;
                return new Date(digest.last_sent) < slot;
            }
            let minHours = 20;
            if (digest.frequency === 'weekly') minHours = 168;
            if (digest.frequency === 'monthly') minHours = 24 * 28;
            // Legacy day checks for digests without schedule_time (moved out of the
            // processing loop so off-days do not consume the cap).
            const tz = digest.timezone || ownerTz(digest) || 'America/New_York';
            let local = null;
            try { local = tzParts(now, tz); } catch { local = null; }
            if (local && digest.frequency === 'weekly' && digest.schedule_day_of_week != null && local.wd !== digest.schedule_day_of_week) return false;
            if (local && digest.frequency === 'monthly' && digest.schedule_day_of_month != null && local.d !== digest.schedule_day_of_month) return false;
            const marks = [digest.last_sent, digest_id ? null : digest.last_skip_at].filter(Boolean).map(x => new Date(x).getTime());
            if (!marks.length) return true;
            return (now.getTime() - Math.max(...marks)) / 3600000 >= minHours;
        });

        console.log(`[generateDigests] Total active digests=${digests.length} due=${dueDigests.length}`);

        // Oldest last_sent first. The loop below runs until the wall budget is spent
        // or MAX_DIGESTS_PER_RUN is reached; anything left is picked up next run.
        const toProcess = dueDigests
            .sort((a, b) => {
                const aTime = a.last_sent ? new Date(a.last_sent).getTime() : 0;
                const bTime = b.last_sent ? new Date(b.last_sent).getTime() : 0;
                return aTime - bTime;
            })
            .slice(0, MAX_DIGESTS_PER_RUN);

        const results = [];
        let deferred = 0;
        const isScheduledRun = !digest_id && !force;

        for (const digest of toProcess) {
            // Check wall-clock budget before each digest (LLM call is expensive)
            if (Date.now() - startTime > WALL_BUDGET_MS) {
                deferred++;
                continue;
            }

            console.log(`[generateDigests] Processing digest="${digest.name}" id=${digest.id}`);
            const ownerUser = ownerByEmail[digest.created_by] || null;
            const slot = slotOf.get(digest.id) || null;
            try {
                const lookbackDays = force ? 30 : naturalWindowDays(digest);
                const windowStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
                // Cap the look-back at the digest's natural window (2026-09-26). A digest
                // that has not sent in months covers the last period only, not months.
                const lastSent = digest.last_sent ? new Date(digest.last_sent) : null;
                const since = (!force && lastSent && lastSent > windowStart) ? lastSent : windowStart;

                // ── Feed scope ─────────────────────────────────────────────────────
                // digest.feed_ids is user-editable, so it is intersected with feeds the
                // owner actually has (tenant guard, 2026-09-25). Dangling ids are pruned
                // from the digest (2026-09-26); if none are left the digest falls back to
                // its categories, or all owner feeds, and the change is recorded.
                const shared = sharedCtx.get(digest.id) || null;
                const ownerFeeds = shared
                    ? extractItems(await base44.asServiceRole.entities.Feed.filter(
                        { workspace_id: shared.ws.id }, '-created_date', 1000
                    )).filter(f => shared.members.some(m => m.email === String(f.created_by || '').toLowerCase()))
                    : extractItems(await base44.asServiceRole.entities.Feed.filter(
                        { created_by: digest.created_by }, '-created_date', 1000
                    ));
                const ownerFeedById = Object.fromEntries(ownerFeeds.map(f => [f.id, f]));
                const notes = [];
                const digestPatch = {};
                let scopedFeeds = ownerFeeds;
                if (digest.feed_ids?.length > 0) {
                    const valid = digest.feed_ids.filter(id => ownerFeedById[id]);
                    const dangling = digest.feed_ids.length - valid.length;
                    if (dangling > 0) {
                        digestPatch.feed_ids = valid;
                        if (valid.length === 0) {
                            notes.push(digest.workspace_id
                                ? `All ${dangling} selected source(s) are no longer shared with the team, so this briefing now uses ${digest.categories?.length ? `shared ${digest.categories.join(', ')} sources` : 'all shared sources'}.`
                                : `All ${dangling} selected source(s) were removed from your account, so this briefing now uses ${digest.categories?.length ? `your ${digest.categories.join(', ')} sources` : 'all of your sources'}.`);
                        } else {
                            notes.push(`${dangling} selected source(s) are no longer available and were removed from this briefing.`);
                        }
                    }
                    if (valid.length > 0) scopedFeeds = valid.map(id => ownerFeedById[id]);
                }
                const scopedFeedIds = scopedFeeds.map(f => f.id);

                // Tags: item tags are copied from feed tags at fetch time. A tag no current
                // feed carries can never match, so it is ignored (not deleted) and noted.
                let liveTags = [];
                if (digest.tags?.length > 0) {
                    const carried = new Set(scopedFeeds.flatMap(f => f.tags || []));
                    liveTags = digest.tags.filter(t => carried.has(t));
                    const dead = digest.tags.filter(t => !carried.has(t));
                    if (dead.length) {
                        notes.push(liveTags.length
                            ? `Tag filter ${dead.map(t => `"${t}"`).join(', ')} ignored: none of your current sources carry it.`
                            : `Tag filter ${dead.map(t => `"${t}"`).join(', ')} ignored: none of your current sources carry it, so the briefing uses its categories instead.`);
                    }
                }

                if (notes.length) {
                    const note = notes.join(' ');
                    if (note !== digest.auto_adjustment_note) digestPatch.auto_adjustment_note = note;
                }
                if (Object.keys(digestPatch).length) {
                    await base44.asServiceRole.entities.Digest.update(digest.id, digestPatch).catch(e =>
                        console.warn(`[generateDigests] Could not record adjustments for "${digest.name}": ${e.message}`));
                    Object.assign(digest, digestPatch);
                }

                // ── Items: category and tag filters run in the DB query, before the
                // limit, so busy off-topic feeds cannot crowd matching items out. ──
                const baseQuery = { feed_id: { $in: scopedFeedIds } };
                if (digest.categories?.length > 0) baseQuery.category = { $in: digest.categories };
                if (liveTags.length > 0) baseQuery.tags = { $in: liveTags };
                let allItems = [];
                if (scopedFeedIds.length > 0) {
                    allItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                        ...baseQuery,
                        published_date: { $gte: since.toISOString() },
                    }, '-published_date', 300));
                }

                // Defensive in-memory pass (same filters)
                let items = allItems.filter(i => new Date(i.published_date || i.created_date) > since);
                if (digest.categories?.length > 0) {
                    items = items.filter(i => digest.categories.includes(i.category));
                }
                if (liveTags.length > 0) {
                    items = items.filter(i => i.tags?.some(t => liveTags.includes(t)));
                }

                console.log(`[generateDigests] digest="${digest.name}" since=${since.toISOString()} feeds=${scopedFeedIds.length} items=${items.length}`);

                if (items.length === 0) {
                    if (!force) {
                        let reasonCode = 'no_items';
                        if (scopedFeedIds.length === 0) reasonCode = 'no_feeds';
                        else if (scopedFeeds.every(f => f.status === 'paused' || f.status === 'error')) reasonCode = 'feeds_paused';
                        else if (liveTags.length > 0) reasonCode = 'no_items_for_tags';
                        else if (digest.categories?.length > 0) reasonCode = 'no_items_in_categories';
                        console.log(`[generateDigests] Skipping digest="${digest.name}" reason=${reasonCode}`);
                        const result = { digest: digest.name, digest_id: digest.id, skipped: true, reason: reasonCode };

                        if (isScheduledRun) {
                            const skips = (digest.consecutive_skips || 0) + 1;
                            const skipPatch = {
                                consecutive_skips: skips,
                                last_skip_reason: reasonCode,
                                last_skip_at: now.toISOString(),
                                last_evaluated_slot: (slot || now).toISOString(),
                            };
                            // After 2 skipped slots in a row, email the owner once per stall.
                            if (skips >= 2 && !digest.last_notified_skip_at) {
                                const lines = [
                                    `Your ${digest.frequency || 'scheduled'} briefing "${digest.name}" has not been sent for the last ${skips} scheduled deliveries, because ${SKIP_REASON_TEXT[reasonCode] || SKIP_REASON_TEXT.no_items}.`,
                                ];
                                if (digest.categories?.length) lines.push(`Categories: ${digest.categories.join(', ')}.`);
                                if (digest.tags?.length) lines.push(`Tags: ${digest.tags.join(', ')}.`);
                                if (digest.auto_adjustment_note) lines.push(digest.auto_adjustment_note);
                                if (reasonCode === 'feeds_paused') lines.push('Check the Sources page for errors, or add sources in these categories.');
                                else if (reasonCode === 'no_feeds') lines.push('Pick new sources for this briefing, or let it use all sources in its categories.');
                                else lines.push('Broaden its categories or tags, or add sources that cover them. We will keep trying at each scheduled time.');
                                const n = await notifyOwner(base44, {
                                    email: digest.created_by,
                                    pref: 'digestReminders',
                                    subject: `Your briefing "${clip(digest.name, 60)}" is not sending`,
                                    heading: `"${digest.name}" has been skipped ${skips} times`,
                                    lines,
                                    ctaUrl: 'https://mergerss.com/Digests',
                                    ctaLabel: 'Fix this briefing',
                                    tone: 'warning',
                                }).catch(() => ({ sent: false }));
                                if (n?.sent) skipPatch.last_notified_skip_at = now.toISOString();
                                result.owner_notified = !!n?.sent;
                                if (!n?.sent) result.notify_skipped = n?.reason || 'unknown';
                            }
                            await base44.asServiceRole.entities.Digest.update(digest.id, skipPatch).catch(e =>
                                console.warn(`[generateDigests] Could not record skip for "${digest.name}": ${e.message}`));
                            result.consecutive_skips = skips;
                        }
                        results.push(result);
                        continue;
                    }
                    // Forced test: use most recent items regardless of date
                    let fallbackItems = [];
                    if (scopedFeedIds.length > 0) {
                        fallbackItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
                            baseQuery, '-published_date', 50
                        ));
                    }
                    if (fallbackItems.length > 0) {
                        items = fallbackItems;
                    } else {
                        results.push({ digest: digest.name, skipped: true, reason: 'No stories available for the selected sources and categories' });
                        continue;
                    }
                }

                // Pick the 20 strongest candidates by enrichment importance (falls back to
                // recency) and drop duplicate stories, keeping prompt size unchanged.
                const topItems = selectCandidates(items, since, now, 20);
                // Source name for the email / chat meta line (in-memory only, never saved).
                for (const it of topItems) it.__source_name = ownerFeedById[it.feed_id]?.name || '';

                const storyTarget = Math.min(STORY_TARGET[digest.output_length] || STORY_TARGET.medium, topItems.length);
                const prompt = buildBriefPrompt(digest, topItems, since, now, storyTarget);

                // ── Idempotency guard ─────────────────────────────────────────────────
                // Stamp last_sent + a delivery_nonce BEFORE making the LLM call.
                // The nonce is based on the run's start timestamp so that if two
                // scheduled runs fire simultaneously, only the first one proceeds.
                // A second run hitting the same digest will see last_sent < 5 min
                // (the dueDigests filter at the top) and skip it automatically.
                const deliveryNonce = `${digest.id}_${now.toISOString().slice(0, 16)}`; // minute-level granularity
                await base44.asServiceRole.entities.Digest.update(digest.id, {
                    last_sent: now.toISOString(),
                    // Store nonce in metadata so admin can inspect it if needed
                    metadata_json: JSON.stringify({ last_delivery_nonce: deliveryNonce }),
                    // Successful send: mark the slot and reset the skip tracking (2026-09-26)
                    ...(slot ? { last_evaluated_slot: slot.toISOString() } : {}),
                    ...(digest.consecutive_skips || digest.last_notified_skip_at || digest.last_skip_reason
                        ? { consecutive_skips: 0, last_skip_reason: '', last_notified_skip_at: null }
                        : {}),
                });

                // Structured output so the email can be laid out properly. Falls back to a
                // clean article list if the model call fails or returns something unusable.
                let brief = null;
                try {
                    const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, response_json_schema: BRIEF_SCHEMA });
                    brief = normalizeBrief(raw, topItems);
                } catch (llmErr) {
                    console.warn(`[generateDigests] Structured brief failed for "${digest.name}": ${llmErr.message}`);
                }
                if (!brief) brief = fallbackBrief(topItems, storyTarget);
                // Markdown copy for web inbox, Slack, Teams and Discord
                const content = briefToMarkdown(brief);

                const itemsList = topItems.map(i => ({ title: i.title, url: i.url, image_url: i.image_url || '', source: i.__source_name || '' }));

                // Web delivery (shared briefings: one inbox copy per active member)
                const webRecord = (ownerEmail) => base44.asServiceRole.entities.DigestDelivery.create({
                    owner_email: ownerEmail,
                    digest_id: digest.id,
                    delivery_type: 'web',
                    status: 'sent',
                    content: content,
                    item_count: items.length,
                    items: itemsList,
                    date_range_start: since.toISOString(),
                    date_range_end: now.toISOString(),
                    sent_at: now.toISOString(),
                });
                const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || 'https://mergerss.com';
                const memberInbox = {}; // member email -> inbox url of their own copy
                let webDelivery;
                if (shared) {
                    for (const m of shared.members) {
                        try {
                            const rec = await webRecord(m.email);
                            memberInbox[m.email] = `${origin}/Inbox?delivery_id=${rec.id}`;
                            if (!webDelivery || m.email === String(digest.created_by || '').toLowerCase()) webDelivery = rec;
                        } catch (e) {
                            console.warn(`[generateDigests] web copy failed for member ${m.email}: ${e.message}`);
                        }
                    }
                    if (!webDelivery) webDelivery = await webRecord(digest.created_by);
                } else {
                    webDelivery = await webRecord(digest.created_by);
                }
                const inboxUrl = `${origin}/Inbox?delivery_id=${webDelivery.id}`;
                const deliveryTypes = ['web'];
                const skippedChannels = [];

                // Plan enforcement at send time (2026-09-26): free accounts get web + email
                // only. Slack, Teams and Discord need premium (admins are exempt).
                const ownerPlan = ownerUser?.plan || 'free';
                const paidChannelsAllowed = ownerPlan === 'premium' || ownerUser?.role === 'admin';
                const teamChannels = !!shared && shared.ws.plan === 'team';
                const teamDateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const teamInbox = `${origin}/Inbox`;
                const postTeam = async (channel, url, payload) => {
                    if (!teamChannels) {
                        if (url) skippedChannels.push({ channel, reason: 'team_plan' });
                        return;
                    }
                    if (!url) return;
                    if (!isAllowedWebhookUrl(url)) {
                        console.warn(`[generateDigests] Blocked team ${channel} webhook to disallowed host`);
                        return;
                    }
                    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const ok = res.ok || res.status === 202 || res.status === 204;
                    if (channel !== 'teams') {
                        await base44.asServiceRole.entities.DigestDelivery.create({
                            owner_email: shared.ws.owner_email,
                            digest_id: digest.id,
                            delivery_type: channel,
                            status: ok ? 'sent' : 'failed',
                            content: content,
                            item_count: items.length,
                            date_range_start: since.toISOString(),
                            date_range_end: now.toISOString(),
                            sent_at: now.toISOString(),
                            error_message: ok ? '' : `HTTP ${res.status}`,
                        }).catch(() => {});
                    }
                    if (ok) deliveryTypes.push(`team_${channel}`);
                };
                const planBlocks = (channel) => {
                    if (paidChannelsAllowed) return false;
                    console.log(`[generateDigests] ${channel} skipped for "${digest.name}": owner plan=${ownerPlan}`);
                    skippedChannels.push({ channel, reason: 'plan' });
                    return true;
                };

                // Run all channel deliveries in parallel to save time
                await Promise.allSettled(shared ? [
                    // Shared briefing email: every active member, respecting their master switch.
                    (async () => {
                        let tz = digest.timezone || ownerTz(digest) || 'America/New_York';
                        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/New_York'; }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
                        const shortDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz });
                        await attachImages(brief, 4);
                        let sent = 0;
                        for (const m of shared.members) {
                            const prefs = (m.user?.notification_prefs && typeof m.user.notification_prefs === 'object') ? m.user.notification_prefs : {};
                            if (prefs.emailNotifications === false) continue;
                            try {
                                await base44.asServiceRole.integrations.Core.SendEmail({
                                    to: m.email,
                                    from_name: 'MergeRSS',
                                    subject: clip(`${digest.name}, ${shortDate}: ${brief.title_line}`, 110),
                                    body: renderDigestEmail({
                                        digestName: digest.name,
                                        dateStr,
                                        shortDate,
                                        scannedCount: items.length,
                                        brief,
                                        inboxUrl: memberInbox[m.email] || teamInbox,
                                        manageUrl: `${origin}/Digests`,
                                        // Team members opt out with their email master switch.
                                        unsubscribeUrl: `${origin}/Settings`,
                                        now,
                                    }),
                                });
                                sent++;
                            } catch (e) {
                                console.warn(`[generateDigests] team email failed for ${m.email}: ${e.message}`);
                            }
                        }
                        if (sent) deliveryTypes.push(`email x${sent}`);
                    })(),
                    // Team channels: once per briefing, only on an active Team plan.
                    (async () => {
                        await postTeam('slack', shared.ws.slack_webhook_url,
                            briefToSlack(brief, { name: digest.name, dateStr: teamDateStr, count: items.length, url: teamInbox }));
                    })(),
                    (async () => {
                        await postTeam('discord', shared.ws.discord_webhook_url,
                            briefToDiscord(brief, { name: digest.name, dateStr: teamDateStr, count: items.length, url: teamInbox }));
                    })(),
                    (async () => {
                        await postTeam('teams', shared.ws.teams_webhook_url,
                            briefToTeams(brief, { name: digest.name, dateStr: teamDateStr, count: items.length, url: teamInbox }));
                    })(),
                ] : [
                    // Email
                    (async () => {
                        if (!digest.delivery_email || !digest.created_by) return;
                        let tz = digest.timezone || ownerTz(digest) || 'America/New_York';
                        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/New_York'; }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
                        const shortDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz });
                        await attachImages(brief, 4);
                        const emailBody = renderDigestEmail({
                            digestName: digest.name,
                            dateStr,
                            shortDate,
                            scannedCount: items.length,
                            brief,
                            inboxUrl,
                            manageUrl: `${origin}/Digests`,
                            // Personal briefing email is switched off per briefing (delivery_email).
                            unsubscribeUrl: `${origin}/Digests`,
                            now,
                        });
                        await base44.asServiceRole.integrations.Core.SendEmail({
                            to: digest.created_by,
                            from_name: 'MergeRSS',
                            subject: clip(`${digest.name}, ${shortDate}: ${brief.title_line}`, 110),
                            body: emailBody,
                        });
                        deliveryTypes.push('email');
                    })(),

                    // Slack
                    (async () => {
                        if (!digest.delivery_slack) return;
                        if (planBlocks('slack')) return;
                        const slackIntegrations = extractItems(await base44.asServiceRole.entities.Integration.filter({ type: 'slack', status: 'connected', created_by: digest.created_by }));
                        const slackInt = slackIntegrations[0];
                        if (!slackInt?.webhook_url) return;
                        if (!isAllowedWebhookUrl(slackInt.webhook_url)) {
                            console.warn(`[generateDigests] Blocked Slack webhook to disallowed host: ${slackInt.webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const slackRes = await fetch(slackInt.webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(briefToSlack(brief, { name: digest.name, dateStr, count: items.length, url: inboxUrl })),
                        });
                        await base44.asServiceRole.entities.DigestDelivery.create({
                    owner_email: digest.created_by,
                            digest_id: digest.id,
                            delivery_type: 'slack',
                            status: slackRes.ok ? 'sent' : 'failed',
                            content: content,
                            item_count: items.length,
                            date_range_start: since.toISOString(),
                            date_range_end: now.toISOString(),
                            sent_at: now.toISOString(),
                            error_message: slackRes.ok ? '' : `HTTP ${slackRes.status}`,
                        });
                        if (slackRes.ok) deliveryTypes.push('slack');
                    })(),

                    // Teams
                    (async () => {
                        if (!digest.delivery_teams) return;
                        if (planBlocks('teams')) return;
                        const teamsIntegrations = extractItems(await base44.asServiceRole.entities.Integration.filter({ type: 'teams', status: 'connected' }));
                        // Owner's own integration only. The old `|| teamsIntegrations[0]` fallback posted digests
                        // into another account's Teams channel when the owner had none (2026-09-25).
                        const teamsInt = teamsIntegrations.find(i => i.created_by === digest.created_by);
                        if (!teamsInt?.webhook_url) return;
                        if (!isAllowedWebhookUrl(teamsInt.webhook_url)) {
                            console.warn(`[generateDigests] Blocked Teams webhook to disallowed host: ${teamsInt.webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const teamsBody = briefToTeams(brief, { name: digest.name, dateStr, count: items.length, url: inboxUrl });
                        const teamsRes = await fetch(teamsInt.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamsBody) });
                        if (teamsRes.ok || teamsRes.status === 202) deliveryTypes.push('teams');
                    })(),

                    // Discord
                    (async () => {
                        if (!digest.delivery_discord || !digest.discord_webhook_url) return;
                        if (planBlocks('discord')) return;
                        if (!isAllowedWebhookUrl(digest.discord_webhook_url)) {
                            console.warn(`[generateDigests] Blocked Discord webhook to disallowed host: ${digest.discord_webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        // Violet embed; briefToDiscord keeps all embed text under Discord's 6000-char cap.
                        const discordPayload = briefToDiscord(brief, { name: digest.name, dateStr, count: items.length, url: inboxUrl });
                        const discordRes = await fetch(digest.discord_webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(discordPayload),
                        });
                        const ok = discordRes.ok || discordRes.status === 204;
                        await base44.asServiceRole.entities.DigestDelivery.create({
                    owner_email: digest.created_by,
                            digest_id: digest.id,
                            delivery_type: 'discord',
                            status: ok ? 'sent' : 'failed',
                            content: content,
                            item_count: items.length,
                            date_range_start: since.toISOString(),
                            date_range_end: now.toISOString(),
                            sent_at: now.toISOString(),
                            error_message: ok ? '' : `HTTP ${discordRes.status}`,
                        });
                        if (ok) deliveryTypes.push('discord');
                    })(),
                ]);

                console.log(`[generateDigests] Delivered digest="${digest.name}" via ${deliveryTypes.join(',')}`);
                results.push({ digest: digest.name, items_included: items.length, deliveries: deliveryTypes, skipped_channels: skippedChannels, status: 'ok', ...(shared ? { workspace_id: shared.ws.id, members: shared.members.length } : {}) });

            } catch (err) {
                console.error(`[generateDigests] Error processing digest="${digest.name}":`, err.message);
                results.push({ digest: digest.name, digest_id: digest.id, owner: digest.created_by || null, error: err.message, status: 'error' });
            }
        }

        const okCount = results.filter(r => r.status === 'ok').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const skippedCount = results.filter(r => r.skipped).length;

        console.log(`[generateDigests] Run complete — ok=${okCount} errors=${errorCount} skipped=${skippedCount}`);

        const finalStatus = errorCount > 0 && okCount === 0 ? 'failed' : 'completed';
        if (deferred > 0) console.log(`[generateDigests] ${deferred} due digest(s) deferred to next run (budget)`);
        const finalMeta = { total: digests.length, due: dueDigests.length, processed: toProcess.length - deferred, deferred, ok: okCount, errors: errorCount, skipped: skippedCount, results };

        // Close the lock record (if we acquired one) or create a log entry for single-digest runs
        if (lockRecord?.id) {
            await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                status: finalStatus,
                completed_at: new Date().toISOString(),
                metadata: finalMeta,
            }).catch(() => {});
        } else {
            // Single-digest manual run — log a one-off record for admin visibility
            await base44.asServiceRole.entities.SystemHealth.create({
                job_type: 'digest_generation',
                status: finalStatus,
                started_at: startedAt,
                completed_at: new Date().toISOString(),
                metadata: { ...finalMeta, manual_digest_id: digest_id },
            }).catch(() => {});
        }

        return Response.json({ success: true, deferred, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});