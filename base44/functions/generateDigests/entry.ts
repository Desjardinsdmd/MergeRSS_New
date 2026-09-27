import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Hard wall-clock budget — stop before Deno's CPU limit hits
const WALL_BUDGET_MS = 45000;
// Max digests to process per scheduled run (lower cap to stay under budget)
const MAX_DIGESTS_PER_RUN = 8;
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
    no_feeds: 'none of the feeds this digest used still exist in your account',
    feeds_paused: 'all of the feeds it draws from are paused or failing',
    no_items_in_categories: 'none of your feeds published anything in its categories during the period',
    no_items_for_tags: 'none of your feeds published anything with its tags during the period',
    no_items: 'none of its feeds published anything new during the period',
};

// ─── CANONICAL COPY: notifyOwner (source of truth: functions/notifyUser/entry.ts) ──
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


// ═══ Email + brief helpers (added 2026-09-26) ═══════════════════════════════
// ── Email design system: MergeRSS brand (see BRAND.md at the app root) ──
// Mirrors src/components/reports/ReportViewer.jsx class-for-class: stone surfaces,
// numbered section bands, primary used for section 01, labels and the lead rule.
// Tailwind alpha classes are pre-blended to solid hex so Outlook renders them.
const BRAND = {
    shell: '#0d0a06',      // app shell bg-[#0d0a06]
    s950: '#0c0a09',       // stone-950, section bodies
    s900: '#1c1917',       // stone-900, section bands and callouts
    s800: '#292524',       // stone-800, borders
    s800_60: '#1d1a19',    // divide-stone-800/60 on stone-950
    s700: '#44403c',       // stone-700, band dividers and dots
    s600: '#57534e',       // stone-600, row numbers
    s500: '#78716c',       // stone-500, meta
    s400: '#a8a29e',       // stone-400, secondary copy and band labels
    s300: '#d6d3d1',       // stone-300, body copy
    s200: '#e7e5e4',       // stone-200, takeaway copy
    s100: '#f5f5f4',       // stone-100, headlines
    s900Text: '#1c1917',   // text-stone-900 on primary
    primary: '#9463e3',    // --primary (Violet Pulse, 263 70% 64%)
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
// TrajectoryBadge / intelligence tags: text-{c}-400 on bg-{c}-400/10, pre-blended on stone-950
const TAG_STYLE = {
    Risk: { fg: '#f87171', bg: '#241413' },
    Opportunity: { fg: '#34d399', bg: '#101e17' },
    Trending: { fg: '#60a5fa', bg: '#141a21' },
};

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function stripTags(s) {
    return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function safeUrl(u) {
    try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : ''; }
    catch { return ''; }
}
function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function clip(s, n) {
    const t = String(s ?? '');
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
}
function pad2(n) { return String(n).padStart(2, '0'); }

// text-[10px] font-bold uppercase tracking-widest
function label(text, color, spacing = '0.1em') {
    return `<span style="font:700 10px/1.4 ${FONT};letter-spacing:${spacing};text-transform:uppercase;color:${color};">${esc(text)}</span>`;
}

// TrajectoryBadge: text-[10px] px-2 py-0.5 font-semibold, square, no border
function tagChip(tag) {
    const st = TAG_STYLE[tag];
    if (!st) return '';
    return `<span style="display:inline-block;background:${st.bg};color:${st.fg};font:600 10px/1 ${FONT};padding:4px 8px;white-space:nowrap;">${esc(tag)}</span>`;
}

// Numbered band. Section 01 is solid primary; the rest are stone-900.
function bandRow(num, text, isPrimary) {
    const bg = isPrimary ? BRAND.primary : BRAND.s900;
    const numColor = isPrimary ? BRAND.s900Text : BRAND.s500;
    const rule = isPrimary ? '#704da6' : BRAND.s700; // bg-stone-900/30 on primary | bg-stone-700
    const txt = isPrimary ? BRAND.s900Text : BRAND.s400;
    const bottom = isPrimary ? '' : `border-bottom:1px solid ${BRAND.s800};`;
    return `
<tr><td class="px" style="background:${bg};${bottom}padding:12px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle" style="font:700 10px/1 ${FONT};color:${numColor};">${pad2(num)}</td>
    <td valign="middle" style="padding:0 12px;"><div style="width:1px;height:12px;background:${rule};font-size:0;line-height:0;">&nbsp;</div></td>
    <td valign="middle">${label(text, txt)}</td>
  </tr></table>
</td></tr>`;
}

function sectionFrame(inner) {
    // border border-stone-800 border-t-0
    return `<tr><td style="border:1px solid ${BRAND.s800};border-top:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td></tr>`;
}

function metaLine(story) {
    const url = safeUrl(story.url);
    const host = hostOf(url);
    const link = url ? `<a href="${esc(url)}" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">Read source</a>` : '';
    const dot = host && link ? `<span style="color:${BRAND.s700};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` : '';
    return `<p style="margin:12px 0 0;font:400 12px/1.4 ${FONT};color:${BRAND.s500};">${esc(host)}${dot}${link}</p>`;
}

// Inflection-point pattern: primary label, stone-400 copy
function takeawayBlock(story) {
    if (!story.takeaway) return '';
    return `<p style="margin:12px 0 0;">${label('Why it matters', BRAND.primary)}</p>
<p style="margin:4px 0 0;font:400 14px/1.65 ${FONT};color:${BRAND.s300};">${esc(story.takeaway)}</p>`;
}

function renderLead(story) {
    const url = safeUrl(story.url);
    const hero = story.image
        ? `<tr><td style="padding:0 0 20px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="550" alt="" style="display:block;width:100%;max-width:550px;height:auto;border:1px solid ${BRAND.s800};background:${BRAND.s900};"></a></td></tr>`
        : '';
    const chip = tagChip(story.tag);
    return `
<tr><td class="px" style="background:${BRAND.s950};padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${hero}
    ${chip ? `<tr><td style="padding:0 0 10px;">${chip}</td></tr>` : ''}
    <tr><td><a href="${esc(url)}" style="font:700 20px/1.3 ${FONT};color:${BRAND.s100};text-decoration:none;">${esc(story.headline)}</a></td></tr>
    <tr><td style="padding:10px 0 0;"><p style="margin:0;font:400 15px/1.8 ${FONT};color:${BRAND.s300};">${esc(story.summary)}</p>${takeawayBlock(story)}${metaLine(story)}</td></tr>
  </table>
</td></tr>`;
}

// Key Themes row: stone-600 number, stone-100 semibold title, badge right, stone-400 body indented
function renderStory(story, n, isLast) {
    const url = safeUrl(story.url);
    const thumb = story.image
        ? `<td class="thumb" width="72" valign="top" style="padding:0 0 0 16px;width:72px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:cover;border:1px solid ${BRAND.s800};background:${BRAND.s900};"></a></td>`
        : '';
    const chip = tagChip(story.tag);
    const divider = isLast ? '' : `border-bottom:1px solid ${BRAND.s800_60};`;
    return `
<tr><td class="px" style="background:${BRAND.s950};${divider}padding:20px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="36" valign="top" style="width:36px;padding-top:4px;font:700 10px/1.4 ${FONT};color:${BRAND.s600};">${pad2(n)}</td>
    <td valign="top">
      ${chip ? `<div style="margin:0 0 8px;">${chip}</div>` : ''}
      <a href="${esc(url)}" style="font:600 16px/1.4 ${FONT};color:${BRAND.s100};text-decoration:none;">${esc(story.headline)}</a>
      <p style="margin:8px 0 0;font:400 14px/1.8 ${FONT};color:${BRAND.s400};">${esc(story.summary)}</p>
      ${takeawayBlock(story)}
      ${metaLine(story)}
    </td>
    ${thumb}
  </tr></table>
</td></tr>`;
}

function renderSection(section, num, skipFirst) {
    const stories = skipFirst ? section.stories.slice(1) : section.stories;
    if (stories.length === 0) return '';
    const rows = stories.map((s, i) => renderStory(s, i + 1, i === stories.length - 1)).join('');
    return sectionFrame(bandRow(num, section.label, false) + rows);
}

function renderDigestEmail({ digestName, dateStr, scannedCount, brief, inboxUrl, manageUrl }) {
    const allStories = brief.sections.flatMap(s => s.stories);
    const lead = allStories[0];
    const preheader = clip(stripTags(brief.lede || brief.title_line), 150);
    const countLine = `${allStories.length} ${allStories.length === 1 ? 'story' : 'stories'} from ${scannedCount} new ${scannedCount === 1 ? 'article' : 'articles'}`;

    // 01 Key signal: Key Takeaway block (border-l-4 primary, bg-stone-900) + stone-300 paragraph
    const keySignal = sectionFrame(bandRow(1, 'Key signal', true) + `
<tr><td class="px" style="background:${BRAND.s950};padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:${BRAND.s900};border-left:4px solid ${BRAND.primary};padding:16px 20px;">
      <p style="margin:0 0 8px;">${label('Key takeaway', BRAND.primary)}</p>
      <p class="title" style="margin:0;font:600 18px/1.45 ${FONT};color:${BRAND.s100};">${esc(brief.title_line)}</p>
    </td></tr>
  </table>
  ${brief.lede ? `<p style="margin:20px 0 0;font:400 15px/1.8 ${FONT};color:${BRAND.s300};">${esc(brief.lede)}</p>` : ''}
</td></tr>`);

    const leadBlock = lead ? sectionFrame(bandRow(2, 'Read first', false) + renderLead(lead)) : '';
    let n = lead ? 3 : 2;
    const sectionsHtml = brief.sections.map((s, i) => {
        const html = renderSection(s, n, i === 0);
        if (html) n++;
        return html;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(digestName)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.shell}; }
  a { color:${BRAND.primary}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .title { font-size:17px !important; }
    .h2 { font-size:21px !important; }
    .thumb { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.shell};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.shell};">
<tr><td align="center" style="padding:24px 12px 40px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    <!-- Wordmark (Layout: primary square + stone-100 bold tracking-tight) -->
    <tr><td style="padding:0 0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="28" height="28" style="width:28px;height:28px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:10px;font:700 18px/1 ${FONT};letter-spacing:-0.025em;color:${BRAND.s100};">MergeRSS</td>
      </tr></table>
    </td></tr>

    <!-- Report header (bg-stone-950 border-stone-800 border-b-0 p-6) -->
    <tr><td class="px" style="background:${BRAND.s950};border:1px solid ${BRAND.s800};border-bottom:0;padding:24px;">
      <p style="margin:0 0 6px;">${label('Intelligence briefing', BRAND.primary, '0.2em')}</p>
      <h1 class="h2" style="margin:0;font:700 24px/1.25 ${FONT};color:${BRAND.s100};">${esc(digestName)}</h1>
      <p style="margin:6px 0 0;font:400 14px/1.5 ${FONT};color:${BRAND.s500};">${esc(dateStr)}<span style="color:${BRAND.s700};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>${esc(countLine)}</p>
    </td></tr>

    ${keySignal}
    ${leadBlock}
    ${sectionsHtml}

    <!-- CTA (Export PDF button style) -->
    ${sectionFrame(`<tr><td class="px" style="background:${BRAND.s950};padding:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:${BRAND.primary};">
          <a href="${esc(safeUrl(inboxUrl))}" style="display:inline-block;padding:12px 20px;font:600 14px/1 ${FONT};color:${BRAND.s900Text};text-decoration:none;">Open full briefing in MergeRSS</a>
        </td>
      </tr></table>
    </td></tr>`)}

    <!-- Footer -->
    <tr><td style="padding:20px 0 0;">
      <p style="margin:0;font:400 12px/1.6 ${FONT};color:${BRAND.s500};">
        You're receiving ${esc(digestName)} because email delivery is on for this digest.
        <a href="${esc(safeUrl(manageUrl))}" style="color:${BRAND.s400};text-decoration:underline;">Manage digest settings</a>
      </p>
      <p style="margin:8px 0 0;font:400 12px/1.6 ${FONT};color:${BRAND.s600};">Summaries are generated by MergeRSS from your sources. Check the original article before relying on any detail.</p>
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;
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
                image: '',
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

// No-LLM fallback so a digest still goes out cleanly if the model call fails.
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
                image: '',
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

async function attachImages(brief, max = 4) {
    const stories = brief.sections.flatMap(s => s.stories).slice(0, max);
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
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
            digests = d ? [d] : [];
        } else {
            digests = extractItems(await base44.asServiceRole.entities.Digest.filter({ status: 'active' }));
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
                const ownerFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter(
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
                            notes.push(`All ${dangling} selected feed(s) were removed from your account, so this digest now uses ${digest.categories?.length ? `your ${digest.categories.join(', ')} feeds` : 'all of your feeds'}.`);
                        } else {
                            notes.push(`${dangling} selected feed(s) no longer exist and were removed from this digest.`);
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
                            ? `Tag filter ${dead.map(t => `"${t}"`).join(', ')} ignored: none of your current feeds carry it.`
                            : `Tag filter ${dead.map(t => `"${t}"`).join(', ')} ignored: none of your current feeds carry it, so the digest uses its categories instead.`);
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
                                    `Your ${digest.frequency || 'scheduled'} digest "${digest.name}" has not been sent for the last ${skips} scheduled deliveries, because ${SKIP_REASON_TEXT[reasonCode] || SKIP_REASON_TEXT.no_items}.`,
                                ];
                                if (digest.categories?.length) lines.push(`Categories: ${digest.categories.join(', ')}.`);
                                if (digest.tags?.length) lines.push(`Tags: ${digest.tags.join(', ')}.`);
                                if (digest.auto_adjustment_note) lines.push(digest.auto_adjustment_note);
                                if (reasonCode === 'feeds_paused') lines.push('Check the feeds page for errors, or add feeds in these categories.');
                                else if (reasonCode === 'no_feeds') lines.push('Pick new feeds for this digest, or let it use all feeds in its categories.');
                                else lines.push('Broaden its categories or tags, or add feeds that cover them. We will keep trying at each scheduled time.');
                                const n = await notifyOwner(base44, {
                                    email: digest.created_by,
                                    pref: 'digestReminders',
                                    subject: `Your digest "${clip(digest.name, 60)}" is not sending`,
                                    heading: `"${digest.name}" has been skipped ${skips} times`,
                                    lines,
                                    ctaUrl: 'https://mergerss.com/Digests',
                                    ctaLabel: 'Fix this digest',
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
                        results.push({ digest: digest.name, skipped: true, reason: 'No items available for the configured feeds/categories' });
                        continue;
                    }
                }

                // Pick the 20 strongest candidates by enrichment importance (falls back to
                // recency) and drop duplicate stories, keeping prompt size unchanged.
                const topItems = selectCandidates(items, since, now, 20);

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

                const itemsList = topItems.map(i => ({ title: i.title, url: i.url }));

                // Web delivery
                const webDelivery = await base44.asServiceRole.entities.DigestDelivery.create({
                    owner_email: digest.created_by,
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
                const inboxUrl = `${origin}/Inbox?delivery_id=${webDelivery.id}`;
                const deliveryTypes = ['web'];

                // Run all channel deliveries in parallel to save time
                await Promise.allSettled([
                    // Email
                    (async () => {
                        if (!digest.delivery_email || !digest.created_by) return;
                        let tz = digest.timezone || 'America/New_York';
                        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/New_York'; }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
                        const shortDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz });
                        await attachImages(brief, 4);
                        const emailBody = renderDigestEmail({
                            digestName: digest.name,
                            dateStr,
                            scannedCount: items.length,
                            brief,
                            inboxUrl,
                            manageUrl: `${origin}/Digests`,
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
                        const slackIntegrations = extractItems(await base44.asServiceRole.entities.Integration.filter({ type: 'slack', status: 'connected', created_by: digest.created_by }));
                        const slackInt = slackIntegrations[0];
                        if (!slackInt?.webhook_url) return;
                        if (!isAllowedWebhookUrl(slackInt.webhook_url)) {
                            console.warn(`[generateDigests] Blocked Slack webhook to disallowed host: ${slackInt.webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const slackContent = content.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<$2|$1>');
                        const slackMsg = `*📰 ${digest.name}*\n_${dateStr} • ${items.length} articles_\n\n${slackContent.slice(0, 2600)}${slackContent.length > 2600 ? '...' : ''}\n\n<${inboxUrl}|📥 View full digest & article list in MergeRSS>`;
                        const slackRes = await fetch(slackInt.webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: slackMsg, mrkdwn: true }),
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
                        const teamsBody = {
                            type: 'message',
                            attachments: [{
                                contentType: 'application/vnd.microsoft.card.adaptive',
                                content: {
                                    type: 'AdaptiveCard',
                                    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                                    version: '1.4',
                                    body: [
                                        { type: 'TextBlock', text: `📰 ${digest.name}`, weight: 'Bolder', size: 'Large' },
                                        { type: 'TextBlock', text: `${dateStr} • ${items.length} articles`, isSubtle: true, spacing: 'None' },
                                        { type: 'TextBlock', text: content.slice(0, 2000) + (content.length > 2000 ? '…' : ''), wrap: true },
                                        { type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: '📥 View in MergeRSS', url: inboxUrl }] }
                                    ]
                                }
                            }]
                        };
                        const teamsRes = await fetch(teamsInt.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamsBody) });
                        if (teamsRes.ok || teamsRes.status === 202) deliveryTypes.push('teams');
                    })(),

                    // Discord
                    (async () => {
                        if (!digest.delivery_discord || !digest.discord_webhook_url) return;
                        if (!isAllowedWebhookUrl(digest.discord_webhook_url)) {
                            console.warn(`[generateDigests] Blocked Discord webhook to disallowed host: ${digest.discord_webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const footerLink = `\n\n[📥 View full digest in MergeRSS](${inboxUrl})`;
                        const header = `**📰 ${digest.name}**\n*${dateStr} • ${items.length} articles*\n\n`;
                        // Enforce Discord's hard 2000 char limit on the fully assembled message
                        const DISCORD_LIMIT = 1990; // leave 10 char buffer
                        const overhead = header.length + footerLink.length + 3; // +3 for "..."
                        const maxContent = DISCORD_LIMIT - overhead;
                        const truncatedContent = content.length > maxContent ? content.slice(0, maxContent) + '...' : content;
                        const discordMsg = header + truncatedContent + footerLink;
                        // Safety assertion — should never exceed limit after fix
                        if (discordMsg.length > 2000) {
                            console.error(`[generateDigests] Discord message still too long: ${discordMsg.length} chars — clamping hard`);
                        }
                        const discordRes = await fetch(digest.discord_webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: discordMsg }),
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
                results.push({ digest: digest.name, items_included: items.length, deliveries: deliveryTypes, status: 'ok' });

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
        const finalMeta = { total: digests.length, processed: toProcess.length, ok: okCount, errors: errorCount, skipped: skippedCount, results };

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

        return Response.json({ success: true, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});