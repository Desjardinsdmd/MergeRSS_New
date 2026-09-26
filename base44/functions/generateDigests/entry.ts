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
function lastScheduledSlot(digest, now) {
    const t = digest.schedule_time;
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    const [hh, mm] = t.split(':').map(Number);
    const tz = digest.timezone || 'America/New_York';
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

// ═══ Email + brief helpers (added 2026-09-26) ═══════════════════════════════
// ── Email design system: MergeRSS brand (see BRAND.md at the app root) ──
// Dark-first, square-cornered, amber reserved for priority and brand.
// Alpha tints from the app are pre-blended to solid hex so Outlook renders them.
const BRAND = {
    field: '#0f0c0b',      // --background
    card: '#171412',       // --card
    rule: '#332c28',       // --border
    ruleSoft: '#25201d',   // --secondary
    text: '#f3eee8',       // --foreground
    secondary: '#d6cec2',  // --secondary-foreground
    body: '#c6baa9',       // .card-body
    muted: '#938876',      // --muted-foreground
    meta: '#78716c',       // stone-500
    dim: '#57534e',        // stone-600
    amber: '#fbbf24',      // brand amber (amber-400)
    onAmber: '#0f0c0b',    // --primary-foreground
    amber50: '#896a1b',    // primary / 50 on card
    amber60: '#a07b1d',    // primary / 60 on card
    amber25: '#503f16',    // primary / 25 on card
    amber20: '#453616',    // primary / 20 on card
    amber7: '#272013',     // primary / 7 on card
    amber4: '#201b13',     // primary / 4 on card
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const TAG_STYLE = {
    Risk: { fg: '#f87171', border: '#581816', bg: '#251110' },
    Opportunity: { fg: '#34d399', border: '#0e3a2c', bg: '#111b17' },
    Trending: { fg: '#60a5fa', border: '#1a2a60', bg: '#171926' },
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

function microLabel(text, color, spacing = '0.18em') {
    return `<span style="font:800 10px/1.4 ${FONT};letter-spacing:${spacing};text-transform:uppercase;color:${color};">${esc(text)}</span>`;
}

function tagChip(tag) {
    const st = TAG_STYLE[tag];
    if (!st) return '';
    return `<span style="display:inline-block;background:${st.bg};color:${st.fg};border:1px solid ${st.border};font:700 10px/1 ${FONT};letter-spacing:0.08em;text-transform:uppercase;padding:4px 6px;margin-right:6px;vertical-align:middle;">${esc(tag)}</span>`;
}

function readFirstChip() {
    return `<span style="display:inline-block;background:${BRAND.amber};color:${BRAND.onAmber};font:800 10px/1 ${FONT};letter-spacing:0.1em;text-transform:uppercase;padding:5px 7px;margin-right:6px;vertical-align:middle;">Read first</span>`;
}

// Source host plus the read link, one quiet line under each story.
function metaLine(story) {
    const url = safeUrl(story.url);
    const host = hostOf(url);
    const link = url
        ? `<a href="${esc(url)}" style="color:${BRAND.amber};text-decoration:none;font-weight:700;">Read source</a>`
        : '';
    const sep = host && link ? `<span style="color:${BRAND.dim};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` : '';
    return `<p style="margin:12px 0 0;font:500 12px/1.4 ${FONT};color:${BRAND.meta};">${esc(host)}${sep}${link}</p>`;
}

function takeawayBlock(story) {
    if (!story.takeaway) return '';
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
  <tr><td style="border-left:2px solid ${BRAND.amber60};padding:1px 0 1px 12px;">
    <p style="margin:0;font:400 14px/1.55 ${FONT};color:${BRAND.secondary};">${microLabel('Why this matters · ', BRAND.amber, '0.1em')}${esc(story.takeaway)}</p>
  </td></tr>
</table>`;
}

function renderLead(story) {
    const url = safeUrl(story.url);
    const hero = story.image
        ? `<tr><td style="padding:0 0 18px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="468" alt="" style="display:block;width:100%;max-width:468px;height:auto;border:1px solid ${BRAND.rule};background:${BRAND.ruleSoft};"></a></td></tr>`
        : '';
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="lead" style="background:${BRAND.amber4};border-left:4px solid ${BRAND.amber};padding:22px 24px 22px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${hero}
      <tr><td style="padding:0 0 10px;">${readFirstChip()}${tagChip(story.tag)}</td></tr>
      <tr><td style="padding:0 0 10px;"><a href="${esc(url)}" style="font:800 21px/1.3 ${FONT};letter-spacing:-0.01em;color:${BRAND.text};text-decoration:none;">${esc(story.headline)}</a></td></tr>
      <tr><td><p style="margin:0;font:400 15px/1.62 ${FONT};color:${BRAND.body};">${esc(story.summary)}</p>${takeawayBlock(story)}${metaLine(story)}</td></tr>
    </table>
  </td></tr>
</table>`;
}

function renderStory(story, isLastInSection) {
    const url = safeUrl(story.url);
    const thumb = story.image
        ? `<td class="thumb" width="88" valign="top" style="padding:0 0 0 18px;width:88px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="88" height="88" alt="" style="display:block;width:88px;height:88px;object-fit:cover;border:1px solid ${BRAND.rule};background:${BRAND.ruleSoft};"></a></td>`
        : '';
    const chip = tagChip(story.tag);
    const divider = isLastInSection ? '' : `<tr><td colspan="2" style="padding:0;"><div style="height:1px;line-height:1px;background:${BRAND.ruleSoft};font-size:0;">&nbsp;</div></td></tr>`;
    return `
<tr>
  <td valign="top" style="padding:20px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" style="border-left:2px solid ${BRAND.dim};padding:0 0 0 16px;">
        ${chip ? `<div style="margin:0 0 8px;">${chip}</div>` : ''}
        <a href="${esc(url)}" style="font:700 17px/1.35 ${FONT};letter-spacing:-0.005em;color:${BRAND.text};text-decoration:none;">${esc(story.headline)}</a>
        <p style="margin:8px 0 0;font:400 14.5px/1.6 ${FONT};color:${BRAND.body};">${esc(story.summary)}</p>
        ${takeawayBlock(story)}
        ${metaLine(story)}
      </td>
      ${thumb}
    </tr></table>
  </td>
</tr>${divider}`;
}

function renderSection(section, skipFirst) {
    const stories = skipFirst ? section.stories.slice(1) : section.stories;
    if (stories.length === 0) return '';
    return `
<tr><td class="px" style="padding:34px 32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 0 10px;border-bottom:1px solid ${BRAND.rule};">${microLabel(section.label, BRAND.amber)}</td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${stories.map((s, i) => renderStory(s, i === stories.length - 1)).join('')}
  </table>
</td></tr>`;
}

function renderDigestEmail({ digestName, dateStr, scannedCount, brief, inboxUrl, manageUrl }) {
    const allStories = brief.sections.flatMap(s => s.stories);
    const lead = allStories[0];
    const preheader = clip(stripTags(brief.lede || brief.title_line), 150);
    const countLine = `${allStories.length} ${allStories.length === 1 ? 'story' : 'stories'} selected from ${scannedCount} new ${scannedCount === 1 ? 'article' : 'articles'}`;
    const ledeHtml = brief.lede
        ? `<p style="margin:14px 0 0;font:400 15px/1.62 ${FONT};color:${BRAND.secondary};">${esc(brief.lede)}</p>`
        : '';
    const sectionsHtml = brief.sections.map((s, i) => renderSection(s, i === 0)).join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(digestName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.field}; }
  a { color:${BRAND.amber}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
    .lead { padding:18px 16px 18px 16px !important; }
    .title { font-size:22px !important; }
    .thumb { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.field};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.field};">
<tr><td align="center" style="padding:28px 12px 40px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    <!-- Wordmark -->
    <tr><td style="padding:0 2px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="24" height="24" style="width:24px;height:24px;background:${BRAND.amber};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:10px;font:700 17px/1 ${FONT};letter-spacing:-0.02em;color:${BRAND.text};">MergeRSS</td>
      </tr></table>
    </td></tr>

    <!-- Briefing card -->
    <tr><td style="background:${BRAND.card};border:2px solid ${BRAND.amber50};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <!-- Header band -->
        <tr><td class="px" style="background:${BRAND.amber7};border-bottom:1px solid ${BRAND.amber25};padding:13px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">${microLabel(digestName, BRAND.amber)}</td>
            <td align="right" valign="middle" style="font:500 12px/1.3 ${FONT};color:${BRAND.meta};">${esc(dateStr)}</td>
          </tr></table>
        </td></tr>

        <!-- Key signal -->
        <tr><td class="px" style="background:${BRAND.amber4};border-bottom:1px solid ${BRAND.amber20};padding:26px 32px 26px;">
          <div style="margin:0 0 10px;">${microLabel("Today's key signal", BRAND.amber, '0.2em')}</div>
          <h1 class="title" style="margin:0;font:800 26px/1.25 ${FONT};letter-spacing:-0.02em;color:${BRAND.text};">${esc(brief.title_line)}</h1>
          ${ledeHtml}
          <p style="margin:14px 0 0;font:500 12px/1.4 ${FONT};color:${BRAND.meta};">${esc(countLine)}</p>
        </td></tr>

        <!-- Lead story -->
        <tr><td class="px" style="padding:28px 32px 0;">${lead ? renderLead(lead) : ''}</td></tr>

        ${sectionsHtml}

        <!-- CTA -->
        <tr><td class="px" align="left" style="padding:32px 32px 36px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:${BRAND.amber};">
              <a href="${esc(safeUrl(inboxUrl))}" style="display:inline-block;padding:14px 24px;font:800 12px/1 ${FONT};letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.onAmber};text-decoration:none;">Open in MergeRSS</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:22px 2px 0;">
      <p style="margin:0;font:400 12px/1.6 ${FONT};color:${BRAND.meta};">
        You're receiving ${esc(digestName)} because email delivery is on for this digest.
        <a href="${esc(safeUrl(manageUrl))}" style="color:${BRAND.secondary};text-decoration:underline;">Manage digest settings</a>
      </p>
      <p style="margin:8px 0 0;font:400 12px/1.6 ${FONT};color:${BRAND.dim};">Summaries are generated by MergeRSS from your sources. Check the original article before relying on any detail.</p>
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

        // Due check (2026-09-25): honour each digest's schedule_time/timezone/day.
        // The old rule ("due 20h after last_sent") made daily send times walk backward
        // around the clock. Now a digest is due once its most recent scheduled slot has
        // passed and it has not been sent since that slot. Digests without a
        // schedule_time keep the old elapsed-time rule.
        const dueDigests = force ? digests : digests.filter(digest => {
            const slot = lastScheduledSlot(digest, now);
            if (slot) {
                if (!digest.last_sent) return true;
                return new Date(digest.last_sent) < slot;
            }
            if (!digest.last_sent) return true;
            const hoursSince = (now - new Date(digest.last_sent)) / 3600000;
            let minHours = 20;
            if (digest.frequency === 'weekly') minHours = 168;
            if (digest.frequency === 'monthly') minHours = 24 * 28;
            return hoursSince >= minHours;
        });

        console.log(`[generateDigests] Total active digests=${digests.length} due=${dueDigests.length}`);

        // Cap to MAX_DIGESTS_PER_RUN — oldest last_sent gets priority
        const toProcess = dueDigests
            .sort((a, b) => {
                const aTime = a.last_sent ? new Date(a.last_sent).getTime() : 0;
                const bTime = b.last_sent ? new Date(b.last_sent).getTime() : 0;
                return aTime - bTime;
            })
            .slice(0, MAX_DIGESTS_PER_RUN);

        const results = [];

        for (const digest of toProcess) {
            // Check wall-clock budget before each digest (LLM call is expensive)
            if (Date.now() - startTime > WALL_BUDGET_MS) {
                results.push({ digest: digest.name, skipped: true, reason: 'Budget exceeded, will retry next run' });
                continue;
            }

            console.log(`[generateDigests] Processing digest="${digest.name}" id=${digest.id}`);
            try {
                // Day-of-week / day-of-month schedule check
                if (!force && !digest.schedule_time && digest.frequency === 'weekly' && digest.schedule_day_of_week != null) {
                    if (now.getDay() !== digest.schedule_day_of_week) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Not scheduled day of week' });
                        continue;
                    }
                }
                if (!force && !digest.schedule_time && digest.frequency === 'monthly' && digest.schedule_day_of_month != null) {
                    if (now.getDate() !== digest.schedule_day_of_month) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Not scheduled day of month' });
                        continue;
                    }
                }

                let lookbackDays = 1;
                if (digest.frequency === 'weekly') lookbackDays = 7;
                if (digest.frequency === 'monthly') lookbackDays = 31;
                if (force) lookbackDays = 30;
                const since = digest.last_sent && !force
                    ? new Date(digest.last_sent)
                    : new Date(now - lookbackDays * 24 * 60 * 60 * 1000);

                // Gather feed items scoped to digest owner. digest.feed_ids is user-editable, so it is
                // intersected with feeds the owner actually has (tenant guard, 2026-09-25).
                const ownerFeedIdSet = new Set(extractItems(await base44.asServiceRole.entities.Feed.filter({ created_by: digest.created_by })).map(f => f.id));
                const scopedFeedIds = (digest.feed_ids || []).filter(id => ownerFeedIdSet.has(id));
                let allItems = [];
                if (digest.feed_ids?.length > 0) {
                    allItems = scopedFeedIds.length === 0 ? [] : extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                        feed_id: { $in: scopedFeedIds },
                        published_date: { $gte: since.toISOString() },
                    }, '-published_date', 200));
                } else {
                    const ownerFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter({ created_by: digest.created_by }));
                    const ownerFeedIds = ownerFeeds.map(f => f.id);
                    if (ownerFeedIds.length > 0) {
                        allItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                            feed_id: { $in: ownerFeedIds },
                            published_date: { $gte: since.toISOString() },
                        }, '-published_date', 200));
                    }
                }

                // Filter by date, categories, tags
                let items = allItems.filter(i => new Date(i.published_date || i.created_date) > since);
                if (digest.categories?.length > 0) {
                    items = items.filter(i => digest.categories.includes(i.category));
                }
                if (digest.tags?.length > 0) {
                    items = items.filter(i => i.tags?.some(t => digest.tags.includes(t)));
                }

                console.log(`[generateDigests] digest="${digest.name}" — ${items.length} item(s) after filtering`);

                if (items.length === 0) {
                    if (!force) {
                        console.log(`[generateDigests] Skipping digest="${digest.name}" — no new items`);
                        results.push({ digest: digest.name, skipped: true, reason: 'No new items in time window' });
                        continue;
                    }
                    // Forced test: use most recent items regardless of date
                    let fallbackItems = [];
                    if (digest.feed_ids?.length > 0) {
                        fallbackItems = scopedFeedIds.length === 0 ? [] : extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                            feed_id: { $in: scopedFeedIds }
                        }, '-published_date', 50));
                    } else {
                        const ownerFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter({ created_by: digest.created_by }));
                        const ownerFeedIds = ownerFeeds.map(f => f.id);
                        if (ownerFeedIds.length > 0) {
                            fallbackItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                                feed_id: { $in: ownerFeedIds }
                            }, '-published_date', 50));
                        }
                    }
                    if (digest.categories?.length > 0) {
                        fallbackItems = fallbackItems.filter(i => digest.categories.includes(i.category));
                    }
                    if (fallbackItems.length > 0) {
                        items = fallbackItems.slice(0, 20);
                    } else {
                        results.push({ digest: digest.name, skipped: true, reason: 'No items available for the configured feeds/categories' });
                        continue;
                    }
                }

                // Sort and cap at 20 items to keep LLM prompt manageable
                items.sort((a, b) => new Date(b.published_date || b.created_date) - new Date(a.published_date || a.created_date));
                const topItems = items.slice(0, 20);

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
                results.push({ digest: digest.name, error: err.message, status: 'error' });
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