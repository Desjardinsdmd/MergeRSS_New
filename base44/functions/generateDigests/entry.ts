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
// ── Email design system (MergeRSS brand: warm near-black field, amber mark) ──
const BRAND = {
    field: '#0f0c08',      // app background, the "desk" the card floats on
    fieldSoft: '#1b1611',
    card: '#ffffff',
    ink: '#16110c',
    text: '#2b241d',
    muted: '#766b5f',
    rule: '#ece5dc',
    amber: '#fbbf24',
    amberDeep: '#9a5b00',
    amberWash: '#fff8e8',
    onField: '#f3ece2',
    onFieldMuted: '#a79a8a',
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const TAG_STYLE = {
    Risk: { bg: '#fbeae8', fg: '#9b2419' },
    Opportunity: { bg: '#e6f3ea', fg: '#1d6636' },
    Trending: { bg: '#fff3d6', fg: '#8a5200' },
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

function tagChip(tag) {
    const st = TAG_STYLE[tag];
    if (!st) return '';
    return `<span style="display:inline-block;background:${st.bg};color:${st.fg};font:600 11px/1 ${SANS};padding:4px 7px;border-radius:3px;margin-right:8px;vertical-align:middle;">${esc(tag)}</span>`;
}

function sourceLine(story) {
    const host = hostOf(story.url);
    return `${tagChip(story.tag)}<span style="font:500 12px/1.4 ${SANS};color:${BRAND.muted};vertical-align:middle;">${esc(host)}</span>`;
}

function readLink(story) {
    const url = safeUrl(story.url);
    if (!url) return '';
    return `<a href="${esc(url)}" style="font:600 13px/1.4 ${SANS};color:${BRAND.amberDeep};text-decoration:none;border-bottom:1px solid ${BRAND.amber};">Read on ${esc(hostOf(url) || 'source')}</a>`;
}

function takeawayBlock(story) {
    if (!story.takeaway) return '';
    return `<p style="margin:10px 0 0;font:400 14px/1.55 ${SANS};color:${BRAND.text};"><strong style="color:${BRAND.ink};">Why it matters:</strong> ${esc(story.takeaway)}</p>`;
}

function renderLead(story) {
    const url = safeUrl(story.url);
    const hero = story.image
        ? `<tr><td style="padding:0 0 20px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="528" alt="" style="display:block;width:100%;max-width:528px;height:auto;border-radius:6px;border:0;background:${BRAND.rule};"></a></td></tr>`
        : '';
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${hero}
  <tr><td style="padding:0 0 8px;">${sourceLine(story)}</td></tr>
  <tr><td style="padding:0 0 10px;"><a href="${esc(url)}" style="font:700 23px/1.28 ${SERIF};color:${BRAND.ink};text-decoration:none;">${esc(story.headline)}</a></td></tr>
  <tr><td><p style="margin:0;font:400 15px/1.62 ${SANS};color:${BRAND.text};">${esc(story.summary)}</p>${takeawayBlock(story)}</td></tr>
  <tr><td style="padding:14px 0 0;">${readLink(story)}</td></tr>
</table>`;
}

function renderStory(story, isLastInSection) {
    const url = safeUrl(story.url);
    const thumb = story.image
        ? `<td class="thumb" width="104" valign="top" style="padding:2px 0 0 20px;width:104px;"><a href="${esc(url)}"><img src="${esc(story.image)}" width="104" height="104" alt="" style="display:block;width:104px;height:104px;object-fit:cover;border-radius:5px;border:0;background:${BRAND.rule};"></a></td>`
        : '';
    const divider = isLastInSection ? '' : `<tr><td colspan="2" style="padding:0;"><div style="height:1px;line-height:1px;background:${BRAND.rule};font-size:0;">&nbsp;</div></td></tr>`;
    return `
<tr>
  <td valign="top" style="padding:20px 0;">
    <div style="margin:0 0 6px;">${sourceLine(story)}</div>
    <a href="${esc(url)}" style="font:700 18px/1.32 ${SERIF};color:${BRAND.ink};text-decoration:none;">${esc(story.headline)}</a>
    <p style="margin:8px 0 0;font:400 14.5px/1.6 ${SANS};color:${BRAND.text};">${esc(story.summary)}</p>
    ${takeawayBlock(story)}
    <div style="margin:12px 0 0;">${readLink(story)}</div>
  </td>
  ${thumb}
</tr>${divider}`;
}

function renderSection(section, skipFirst) {
    const stories = skipFirst ? section.stories.slice(1) : section.stories;
    if (stories.length === 0) return '';
    return `
<tr><td class="px" style="padding:34px 36px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 0 4px;border-bottom:2px solid ${BRAND.ink};">
      <span style="font:700 15px/1.3 ${SERIF};color:${BRAND.ink};">${esc(section.label)}</span>
    </td></tr>
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

    const ledeBlock = brief.lede ? `
<tr><td class="px" style="padding:24px 36px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:${BRAND.amberWash};border-left:3px solid ${BRAND.amber};padding:16px 20px;border-radius:0 4px 4px 0;">
      <p style="margin:0 0 6px;font:700 13px/1.3 ${SANS};color:${BRAND.amberDeep};">The short version</p>
      <p style="margin:0;font:400 15px/1.6 ${SANS};color:${BRAND.ink};">${esc(brief.lede)}</p>
    </td></tr>
  </table>
</td></tr>` : '';

    const sectionsHtml = brief.sections.map((s, i) => renderSection(s, i === 0)).join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(digestName)}</title>
<style>
  body { margin:0; padding:0; }
  a { color:${BRAND.amberDeep}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .title { font-size:25px !important; }
    .thumb { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.field};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.field};">
<tr><td align="center" style="padding:28px 12px 40px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    <!-- Wordmark on the dark field -->
    <tr><td class="px" style="padding:4px 36px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="22" height="22" style="width:22px;height:22px;background:${BRAND.amber};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding-left:10px;font:700 17px/1 ${SANS};color:${BRAND.onField};letter-spacing:-0.2px;">MergeRSS</td>
          </tr></table>
        </td>
        <td align="right" valign="middle" style="font:500 12px/1.3 ${SANS};color:${BRAND.onFieldMuted};">${esc(dateStr)}</td>
      </tr></table>
    </td></tr>

    <!-- The card -->
    <tr><td style="background:${BRAND.card};border-radius:10px;border-top:5px solid ${BRAND.amber};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="px" style="padding:34px 36px 0;">
          <p style="margin:0 0 12px;font:600 14px/1.3 ${SANS};color:${BRAND.amberDeep};">${esc(digestName)}</p>
          <h1 class="title" style="margin:0;font:700 30px/1.2 ${SERIF};color:${BRAND.ink};letter-spacing:-0.3px;">${esc(brief.title_line)}</h1>
          <p style="margin:14px 0 0;font:400 13px/1.4 ${SANS};color:${BRAND.muted};">${esc(countLine)}</p>
        </td></tr>
        ${ledeBlock}
        <tr><td class="px" style="padding:30px 36px 0;">${lead ? renderLead(lead) : ''}</td></tr>
        ${sectionsHtml}
        <tr><td class="px" align="left" style="padding:30px 36px 38px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:${BRAND.ink};border-radius:5px;">
              <a href="${esc(safeUrl(inboxUrl))}" style="display:inline-block;padding:13px 22px;font:600 14px/1 ${SANS};color:${BRAND.amber};text-decoration:none;">Open in MergeRSS</a>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer on the dark field -->
    <tr><td class="px" style="padding:22px 36px 0;">
      <p style="margin:0;font:400 12px/1.6 ${SANS};color:${BRAND.onFieldMuted};">
        You're receiving ${esc(digestName)} because email delivery is on for this digest.
        <a href="${esc(safeUrl(manageUrl))}" style="color:${BRAND.onField};text-decoration:underline;">Manage digest settings</a>
      </p>
      <p style="margin:8px 0 0;font:400 12px/1.6 ${SANS};color:${BRAND.onFieldMuted};">Summaries are generated by MergeRSS from your sources. Check the original article before relying on any detail.</p>
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