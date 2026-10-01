import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = String(ip).replace(/^\[|\]$/g, '').toLowerCase().replace(/%.*$/, '');
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (/^198\.1[89]\./.test(h)) return true; // benchmarking 198.18.0.0/15
    const __q = h.match(/^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    if (__q && Number(__q[1]) >= 224) return true; // multicast / reserved 224.0.0.0+
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::[0-9a-f]{1,4}$/.test(h)) return true; // ::x  == 0.0.x.x
    if (/^64:ff9b:1:/.test(h)) return true; // local-use NAT64 64:ff9b:1::/48
    // IPv4 embedded in IPv6: ::ffff:a.b.c.d, ::ffff:XXXX:YYYY, ::ffff:0:..., NAT64 64:ff9b::/96,
    // IPv4-compatible ::a.b.c.d / ::XXXX:YYYY (plus expanded zero forms). Extract and re-check.
    const __m = h.match(/^(?:::ffff:(?:0{1,4}:)?|64:ff9b::|64:ff9b:(?:0{1,4}:){4}|(?:0{1,4}:){5}ffff:|(?:0{1,4}:){4}ffff:0{1,4}:|(?:0{1,4}:){6}|::)((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/);
    if (__m) {
        let v4 = __m[1];
        if (v4.includes(':')) {
            const [a, b] = v4.split(':').map(x => parseInt(x, 16));
            v4 = [a >> 8, a & 255, b >> 8, b & 255].join('.');
        }
        return __isPrivateIp(v4);
    }
    return false;
}
async function __assertPublicUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('SSRF_BLOCKED: invalid URL'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('SSRF_BLOCKED: scheme');
    const host = u.hostname.toLowerCase();
    if (__BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || __isPrivateIp(host)) {
        throw new Error('SSRF_BLOCKED: private host');
    }
    if (!/^[\d.]+$/.test(host) && !host.includes(':')) {
        for (const type of ['A', 'AAAA']) {
            let answers = [];
            try { answers = await Deno.resolveDns(host, type); } catch { answers = []; }
            if (answers.some(__isPrivateIp)) throw new Error('SSRF_BLOCKED: resolves to private address');
        }
    }
    return u;
}
async function safeFetch(url, init = {}) {
    let current = String(url);
    for (let hop = 0; hop <= 5; hop++) {
        await __assertPublicUrl(current);
        const res = await fetch(current, { ...init, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            current = new URL(res.headers.get('location'), current).toString();
            continue;
        }
        return res;
    }
    throw new Error('SSRF_BLOCKED: too many redirects');
}
// ───────────────────────────────────────────────────────────────────────────────

// ─── Infrastructure helpers ───────────────────────────────────────────────────
// NOTE: Base44 does not support shared imports between function files.
// These helpers are intentionally inlined here. Canonical versions are documented
// in functions/lib.js. Keep these in sync with that reference when editing.

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

async function requireAdminOrScheduler(base44) {
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    // Hardened 2026-09-25: scheduled and chained runs arrive as the app admin
    // (verified via auth_path telemetry). Anything without an admin user is rejected.
    if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
    if (user.role !== 'admin') return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
    return { user, path: 'admin_user' };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function makeRunId() { return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CONSECUTIVE_ERRORS   = 5;
const COOLDOWN_HOURS           = 2;
const FEED_FETCH_CONCURRENCY   = 5;
const WRITE_DELAY_MS           = 150;
const BATCH_DELAY_MS           = 300;
const RUN_INTERVAL_MINUTES     = 60;
const LOCK_WINDOW_MS           = 8 * 60 * 1000;
const ZOMBIE_TTL_MS            = 15 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS    = 60 * 1000;

// ─── HTML entity decoder ──────────────────────────────────────────────────────
function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
        .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
        .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
        .replace(/&hellip;/g, '…').replace(/&copy;/g, '©').replace(/&reg;/g, '®')
        .replace(/&trade;/g, '™').replace(/&bull;/g, '•').replace(/&amp;/g, '&');
}

// ─── Canonical feed parser ────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for RSS/Atom/RDF parsing across the entire codebase.
// recoverFeeds calls this function via base44.functions.invoke('fetchFeeds') — do not degrade it.
// Supports: RSS 2.0, Atom, RDF/RSS 1.0
async function parseFeed(url) {
    const response = await safeFetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
    });

    if (response.status === 429) throw new Error('HTTP_429: Source rate-limited us');
    if (!response.ok) throw new Error(`HTTP_${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';
    const xml = await response.text();

    if (
        contentType.includes('text/html') &&
        !contentType.includes('xml') &&
        xml.trimStart().toLowerCase().startsWith('<!doctype html')
    ) {
        throw new Error('FEED_HTML: Feed returned HTML — URL may have changed or requires auth');
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
        allowBooleanAttributes: true,
    });
    const parsed = parser.parse(xml);

    // ── RSS 2.0 ──────────────────────────────────────────────────────────────
    if (parsed.rss?.channel) {
        const channel = parsed.rss.channel;
        const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
        return items.map(item => ({
            title: decodeHtml(item.title) || 'Untitled',
            url: item.link || (typeof item.guid === 'string' ? item.guid : item.guid?.['#text']) || '',
            description: decodeHtml(item.description) || '',
            content: decodeHtml(item['content:encoded'] || item.description) || '',
            author: decodeHtml(item.author || item['dc:creator']) || '',
            published_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            guid: typeof item.guid === 'string' ? item.guid : (item.guid?.['#text'] || item.link || ''),
        }));
    }

    // ── Atom ──────────────────────────────────────────────────────────────────
    if (parsed.feed) {
        const entries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : (parsed.feed.entry ? [parsed.feed.entry] : []);
        return entries.map(entry => {
            const links = Array.isArray(entry.link) ? entry.link : (entry.link ? [entry.link] : []);
            const link = links.find(l => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href'] || links[0]?.['@_href'] || '';
            return {
                title: decodeHtml(typeof entry.title === 'string' ? entry.title : (entry.title?.['#text'] || 'Untitled')),
                url: link,
                description: decodeHtml(typeof entry.summary === 'string' ? entry.summary : (entry.summary?.['#text'] || '')),
                content: decodeHtml(typeof entry.content === 'string' ? entry.content : (entry.content?.['#text'] || '')),
                author: decodeHtml(entry.author?.name || ''),
                published_date: entry.updated || entry.published ? new Date(entry.updated || entry.published).toISOString() : new Date().toISOString(),
                guid: entry.id || link,
            };
        });
    }

    // ── RDF / RSS 1.0 ─────────────────────────────────────────────────────────
    if (parsed['rdf:RDF'] || parsed.RDF) {
        const rdf = parsed['rdf:RDF'] || parsed.RDF;
        const items = Array.isArray(rdf.item) ? rdf.item : (rdf.item ? [rdf.item] : []);
        return items.map(item => ({
            title: typeof item.title === 'string' ? item.title : (item.title?.['#text'] || 'Untitled'),
            url: typeof item.link === 'string' ? item.link : (item.link?.['#text'] || ''),
            description: typeof item.description === 'string' ? item.description : (item.description?.['#text'] || ''),
            content: typeof item['content:encoded'] === 'string' ? item['content:encoded'] : '',
            author: item['dc:creator'] || '',
            published_date: item['dc:date'] ? new Date(item['dc:date']).toISOString() : new Date().toISOString(),
            guid: item['@_rdf:about'] || (typeof item.link === 'string' ? item.link : ''),
        }));
    }

    throw new Error(`FEED_UNKNOWN_FORMAT: ${xml.substring(0, 120).replace(/\s+/g, ' ').trim()}`);
}

// ─── Canonical dedup helper ───────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for article deduplication logic.
// Used by both the main fetch path and the recovery path (via recoverFeeds calling this function).
// Multi-signal: guid, url, AND normalized title+date composite.
function buildDedupSets(existingItems) {
    const guids = new Set(existingItems.map(i => i.guid).filter(Boolean));
    const urls  = new Set(existingItems.map(i => i.url).filter(Boolean));
    const titleKeys = new Set(
        existingItems
            .filter(i => i.title && i.published_date)
            .map(i => `${i.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}|${i.published_date?.slice(0, 10)}`)
    );
    return { guids, urls, titleKeys };
}

function isDuplicate(item, dedupSets) {
    if (!item.guid && !item.url) return true;
    if (item.guid && dedupSets.guids.has(item.guid)) return true;
    if (item.url && dedupSets.urls.has(item.url)) return true;
    if (item.title && item.published_date) {
        const key = `${item.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}|${item.published_date.slice(0, 10)}`;
        if (dedupSets.titleKeys.has(key)) return true;
    }
    return false;
}

function buildFeedItemRecord(item, feed) {
    return {
        feed_id: feed.id,
        title: String(item.title || '').slice(0, 500),
        url: String(item.url || ''),
        description: String(item.description || '').slice(0, 2000),
        content: String(item.content || '').slice(0, 5000),
        author: String(item.author || '').slice(0, 200),
        published_date: item.published_date,
        guid: String(item.guid || item.url || ''),
        category: feed.category,
        tags: feed.tags || [],
        is_read: false,
        enrichment_status: 'pending',
    };
}

// ─── URL Recovery ─────────────────────────────────────────────────────────────
const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
};

function isRssFeed(text) {
    const t = text.trimStart();
    return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF'))
        && (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'));
}

function discoverFeedUrls(html, pageUrl) {
    const base = new URL(pageUrl);
    const fromTags = [];
    const re = /<link[^>]+>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        if (!tag.toLowerCase().includes('alternate')) continue;
        const typeM = tag.match(/type=["']([^"']+)["']/i);
        const hrefM = tag.match(/href=["']([^"']+)["']/i);
        if (!hrefM) continue;
        const type = (typeM?.[1] || '').toLowerCase();
        if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
            try { fromTags.push(new URL(hrefM[1], base).href); } catch {}
        }
    }
    const probes = ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml', '/blog/feed', '/news/feed', '/feed/rss2', '/?feed=rss2']
        .map(p => { try { return new URL(p, base).href; } catch { return null; } })
        .filter(Boolean);
    return [...new Set([...fromTags, ...probes])];
}

async function recoverFeedUrl(originalUrl) {
    const candidates = discoverFeedUrls('', originalUrl);
    try {
        const res = await safeFetch(originalUrl, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12000) });
        if (res.ok) {
            const html = await res.text();
            if (isRssFeed(html)) return originalUrl;
            candidates.unshift(...discoverFeedUrls(html, originalUrl));
        }
    } catch {}
    const deduped = [...new Set(candidates)];
    for (const candidate of deduped.slice(0, 12)) {
        if (candidate === originalUrl) continue;
        try {
            const res = await safeFetch(candidate, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const text = await res.text();
            if (isRssFeed(text)) return candidate;
        } catch {}
    }
    return null;
}

// ─── Concurrency helper ───────────────────────────────────────────────────────
async function withConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]().catch(err => ({ __err: err.message }));
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

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

// Feed auto-pause notice (2026-09-26). Emails the feed's own owner once per pause
// episode; owner_notified_pause_at is cleared when the feed fetches cleanly again.
// Never emails anyone other than feed.created_by.
async function notifyFeedPaused(feed, fetchError, newConsecutive, base44) {
    if (!feed?.created_by || feed.owner_notified_pause_at) return;
    const reason = String(fetchError || 'Unknown error').replace(/^[A-Z_]+\d*:\s*/, '').slice(0, 200);
    const res = await notifyOwner(base44, {
        email: feed.created_by,
        pref: 'feedErrors',
        subject: `Feed paused: ${String(feed.name || 'one of your feeds').slice(0, 80)}`,
        heading: `We paused "${feed.name || 'a feed'}"`,
        lines: [
            `This feed failed ${newConsecutive} times in a row, so MergeRSS stopped fetching it for now. It will retry automatically in a few hours.`,
            `Last error: ${reason}`,
            `Feed address: ${feed.url || 'unknown'}`,
            'If the site moved its feed, update the address or remove the feed. Digests that rely on it may send fewer stories until it is fixed.',
        ],
        ctaUrl: 'https://mergerss.com/Feeds',
        ctaLabel: 'Review your feeds',
    }).catch(() => ({ sent: false }));
    if (res?.sent) {
        await base44.asServiceRole.entities.Feed.update(feed.id, { owner_notified_pause_at: new Date().toISOString() }).catch(() => {});
    }
}

// ─── Per-feed write handlers ───────────────────────────────────────────────────
// These are the two canonical write paths: one for fetch failures, one for success.
// The batch runner calls these after pre-fetching all HTTP results concurrently.

async function handleFeedError(feed, fetchError, summary, base44) {
    const now = new Date().toISOString();
    const errLower = fetchError.toLowerCase();
    const isRateLimit = fetchError.includes('429') || errLower.includes('rate limit')
        || /\b50[234]\b/.test(fetchError) || errLower.includes('service unavailable')
        || errLower.includes('bad gateway') || errLower.includes('gateway timeout');
    // A 429 or a 502/503/504 means the source (or its CDN) is alive and throttling or briefly
    // down. It must not count toward the dead-feed pause threshold; we back off instead.
    const newConsecutive = isRateLimit ? (feed.consecutive_errors || 0) : (feed.consecutive_errors || 0) + 1;
    const isRecoverable = fetchError.startsWith('FEED_HTML') || fetchError.includes('404') || fetchError.startsWith('FEED_UNKNOWN');
    const shouldPause = !isRateLimit && newConsecutive >= MAX_CONSECUTIVE_ERRORS;

    if (isRecoverable && newConsecutive >= 2 && !shouldPause) {
        recoverFeedUrl(feed.url).then(async newUrl => {
            if (newUrl) {
                await base44.asServiceRole.entities.Feed.update(feed.id, {
                    url: newUrl, status: 'active', fetch_error: '', consecutive_errors: 0,
                    paused_by_system: false,
                }).catch(() => {});
                console.log(`[fetchFeeds] Auto-recovered "${feed.name}" → ${newUrl}`);
            }
        }).catch(() => {});
    }

    const feedUpdate = {
        last_fetched: now,
        fetch_error: fetchError.slice(0, 500),
        consecutive_errors: newConsecutive,
        last_failure_at: now,
        last_failure_reason: fetchError.slice(0, 300),
    };
    if (shouldPause) {
        feedUpdate.status = 'paused';
        feedUpdate.paused_by_system = true;
        feedUpdate.paused_reason = `Auto-paused after ${newConsecutive} failures: ${fetchError.slice(0, 200)}`;
        feedUpdate.retry_after_at = new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString();
        console.warn(`[fetchFeeds] AUTO-PAUSED "${feed.name}" after ${newConsecutive} failures`);
        summary.auto_paused++;
    } else {
        feedUpdate.status = isRateLimit ? feed.status : 'error';
        if (isRateLimit) {
            // Back off one hour so the next scheduled fetch skips this source.
            feedUpdate.retry_after_at = new Date(Date.now() + 3600 * 1000).toISOString();
            summary.rate_limited++;
        } else {
            summary.error++;
        }
    }

    await base44.asServiceRole.entities.Feed.update(feed.id, feedUpdate).catch(dbErr => {
        console.warn(`[fetchFeeds] DB write failed for errored feed "${feed.name}": ${dbErr.message}`);
        summary.db_write_errors++;
    });

    if (shouldPause) {
        await notifyFeedPaused(feed, fetchError, newConsecutive, base44).catch(() => {});
    }

    return {
        feed_id: feed.id, feed: feed.name,
        status: shouldPause ? 'auto_paused' : (isRateLimit ? 'rate_limited' : 'error'),
        error: fetchError,
    };
}

async function handleFeedSuccess(feed, items, existingItems, alertsByFeedId, summary, base44) {
    const now = new Date().toISOString();

    const dedupSets = buildDedupSets(existingItems);
    const itemsToCreate = [];
    let duplicatesSkipped = 0;

    for (const item of items.slice(0, 50)) {
        if (isDuplicate(item, dedupSets)) { duplicatesSkipped++; continue; }
        itemsToCreate.push(buildFeedItemRecord(item, feed));
    }

    const newCount = itemsToCreate.length;
    let created = [];

    if (newCount > 0) {
        try {
            created = await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
        } catch (bulkErr) {
            console.warn(`[fetchFeeds] bulkCreate failed for "${feed.name}": ${bulkErr.message}`);
            summary.db_write_errors++;
        }
    }

    // Enrichment fire-and-forget
    const createdIds = (Array.isArray(created) ? created : []).filter(i => i?.id).map(i => i.id).slice(0, 20);
    if (createdIds.length > 0) {
        base44.asServiceRole.functions.invoke('enrichFeedItems', { item_ids: createdIds }, {
            headers: { 'x-internal-secret': Deno.env.get('INTERNAL_SECRET') || '' }
        }).catch(() => {});
    }

    // Alerts fire-and-forget
    const feedAlerts = alertsByFeedId[feed.id];
    if (feedAlerts?.length && created.length > 0) {
        dispatchAlerts(created, feedAlerts, feed, base44).catch(() => {});
    }

    await base44.asServiceRole.entities.Feed.update(feed.id, {
        last_fetched: now,
        last_successful_fetch_at: now,
        item_count: (feed.item_count || 0) + newCount,
        status: 'active',
        fetch_error: '',
        consecutive_errors: 0,
        last_failure_reason: null,
        paused_by_system: false,
        paused_reason: null,
        retry_after_at: null,
        ...(feed.owner_notified_pause_at ? { owner_notified_pause_at: null } : {}),
    }).catch(dbErr => {
        console.warn(`[fetchFeeds] Feed status update failed for "${feed.name}": ${dbErr.message}`);
        summary.db_write_errors++;
    });

    summary.ok++;
    summary.new_items += newCount;
    summary.duplicates += duplicatesSkipped;

    return { feed_id: feed.id, feed: feed.name, status: 'ok', new_items: newCount, duplicates_skipped: duplicatesSkipped };
}

// ─── Alert dispatcher ─────────────────────────────────────────────────────────
async function dispatchAlerts(created, feedAlerts, feed, base44) {
    const alertItems = created.filter(i => i?.id).slice(0, 10);
    return Promise.allSettled(
        alertItems.flatMap(newItem =>
            feedAlerts.map(async alert => {
                const title = newItem.title || 'New article';
                const url = newItem.url || '';
                const description = (newItem.description || '').slice(0, 200);
                const category = newItem.category || '';
                try {
                    let delivered = false;
                    if (alert.channel_type === 'slack') {
                        const text = `*${title}*${category ? ` [${category}]` : ''}\n${description ? description + '\n' : ''}<${url}|Read more>`;
                        const res = await fetch(alert.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mrkdwn: true }), signal: AbortSignal.timeout(8000) });
                        delivered = res.ok;
                    } else if (alert.channel_type === 'discord') {
                        const content = `**${title}**${category ? ` \`${category}\`` : ''}\n${description ? description + '\n' : ''}${url}`;
                        const res = await fetch(alert.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 2000) }), signal: AbortSignal.timeout(8000) });
                        delivered = res.ok || res.status === 204;
                    }
                    if (delivered) await base44.asServiceRole.entities.FeedAlert.update(alert.id, { last_sent: new Date().toISOString() }).catch(() => {});
                } catch {}
            })
        )
    );
}

// ─── Main batch runner ────────────────────────────────────────────────────────
// Phase A: concurrent HTTP fetches (FEED_FETCH_CONCURRENCY parallel)
// Phase B: batched DB reads for dedup
// Phase C: sequential DB writes (WRITE_DELAY_MS between each) to avoid rate-limiting
async function runFeedBatches(feeds, alertsByFeedId, base44) {
    const summary = { ok: 0, error: 0, auto_paused: 0, rate_limited: 0, new_items: 0, duplicates: 0, db_write_errors: 0 };
    const BATCH_SIZE = 10;

    for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
        const batch = feeds.slice(i, i + BATCH_SIZE);

        // Phase A: fetch all feeds in batch concurrently
        const fetchTasks = batch.map(feed => async () => {
            try {
                const items = await parseFeed(feed.url);
                return { feed, items, fetchError: null };
            } catch (err) {
                return { feed, items: [], fetchError: err.message };
            }
        });
        const fetchResults = await withConcurrency(fetchTasks, FEED_FETCH_CONCURRENCY);

        // Phase B: fetch existing items for dedup (parallel DB reads)
        const dedupResults = await Promise.allSettled(
            batch.map(feed =>
                base44.asServiceRole.entities.FeedItem.filter({ feed_id: feed.id }, '-created_date', 300)
                    .then(existing => ({ feed_id: feed.id, existing: extractItems(existing) }))
                    .catch(() => ({ feed_id: feed.id, existing: [] }))
            )
        );
        const dedupMap = {};
        for (const r of dedupResults) {
            if (r.status === 'fulfilled') dedupMap[r.value.feed_id] = r.value.existing;
        }

        // Phase C: process results sequentially (controlled DB write rate)
        for (let j = 0; j < fetchResults.length; j++) {
            const { feed, items, fetchError, __err } = fetchResults[j];
            const existingItems = dedupMap[feed.id] || [];
            const effectiveFetchError = __err || fetchError;

            let result;
            try {
                if (effectiveFetchError) {
                    result = await handleFeedError(feed, effectiveFetchError, summary, base44);
                } else {
                    result = await handleFeedSuccess(feed, items, existingItems, alertsByFeedId, summary, base44);
                }
            } catch (unexpectedErr) {
                console.error(`[fetchFeeds] UNEXPECTED per-feed error for "${feed.name}": ${unexpectedErr.message}`);
                summary.error++;
                result = { feed_id: feed.id, feed: feed.name, status: 'error', error: `unexpected: ${unexpectedErr.message}` };
            }

            console.log(`[fetchFeeds] ${result.status.toUpperCase()} "${result.feed}" ${result.new_items ? `+${result.new_items} items` : result.error ? `— ${result.error.slice(0, 80)}` : ''}`);

            if (j < fetchResults.length - 1) await sleep(WRITE_DELAY_MS);
        }

        if (i + BATCH_SIZE < feeds.length) await sleep(BATCH_DELAY_MS);
    }

    return summary;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    let base44;
    try {
        base44 = createClientFromRequest(req);
    } catch {
        try {
            const { createClient } = await import('npm:@base44/sdk@0.8.21');
            base44 = createClient();
        } catch (bootErr) {
            return Response.json({ error: `SDK boot failed: ${bootErr.message}` }, { status: 500 });
        }
    }

    const { error: authError, path: authPath } = await requireAdminOrScheduler(base44);
    if (authError) return authError;
    const hasInternalHeader = !!req.headers.get('x-internal-secret');

    const startedAt = new Date().toISOString();
    const runStartMs = Date.now();
    const instanceId = makeRunId();

    // ── Distributed run lock ───────────────────────────────────────────────────
    let recentRuns = [];
    try {
        recentRuns = extractItems(await base44.asServiceRole.entities.SystemHealth.filter(
            { job_type: 'feed_fetch', status: 'running' }, '-started_at', 5
        ));
    } catch (lockErr) {
        console.warn(`[fetchFeeds][${instanceId}] Could not query lock (non-fatal):`, lockErr.message);
    }

    for (const stale of recentRuns) {
        const age = Date.now() - new Date(stale.started_at).getTime();
        const lastHeartbeat = stale.metadata?.last_heartbeat_at
            ? Date.now() - new Date(stale.metadata.last_heartbeat_at).getTime()
            : age;
        if (age >= ZOMBIE_TTL_MS || lastHeartbeat > ZOMBIE_TTL_MS) {
            console.warn(`[fetchFeeds][${instanceId}] Reclaiming zombie lock ${stale.id}`);
            await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                status: 'failed', completed_at: new Date().toISOString(),
                error_message: `Zombie lock reclaimed by ${instanceId} after ${Math.round(age/60000)}min`,
            }).catch(() => {});
        }
    }

    const activeLock = recentRuns.find(r => {
        const age = Date.now() - new Date(r.started_at).getTime();
        const lastHeartbeat = r.metadata?.last_heartbeat_at
            ? Date.now() - new Date(r.metadata.last_heartbeat_at).getTime()
            : age;
        return age < LOCK_WINDOW_MS && lastHeartbeat < ZOMBIE_TTL_MS;
    });
    if (activeLock) {
        return Response.json({
            skipped: true,
            reason: 'Another run is actively in progress',
            active_owner: activeLock.metadata?.instance_id || activeLock.id,
            running_since: activeLock.started_at,
        });
    }

    let lockRecord = null;
    try {
        lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'feed_fetch',
            status: 'running',
            started_at: startedAt,
            metadata: { instance_id: instanceId, last_heartbeat_at: startedAt, run_type: 'main' },
        });
        console.log(`[fetchFeeds][${instanceId}] Lock ACQUIRED — id=${lockRecord.id}`);
    } catch (e) {
        console.warn(`[fetchFeeds][${instanceId}] Could not create lock:`, e.message);
    }

    let heartbeatTimer = null;
    if (lockRecord?.id) {
        heartbeatTimer = setInterval(() => {
            base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString(), run_type: 'main' },
            }).catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);
    }

    // ── Load feeds ─────────────────────────────────────────────────────────────
    // Newsletter feeds (inbound email, see mailgunWebhook) have nothing to fetch: skip them so
    // they are never marked errored or auto-paused.
    function isNewsletterFeed(f) {
        if (!f) return false;
        if (f.source_type === 'newsletter') return true;
        if (typeof f.url === 'string' && f.url.startsWith('newsletter://')) return true;
        try { if (f.metadata_json && JSON.parse(f.metadata_json)?.newsletter === true) return true; } catch { /* ignore */ }
        return false;
    }
    let allFeeds = [];
    try {
        allFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter(
            { status: { $in: ['active', 'error'] } }, 'last_fetched', 2000
        )).filter(f => !isNewsletterFeed(f));
    } catch (feedErr) {
        clearInterval(heartbeatTimer);
        console.error(`[fetchFeeds][${instanceId}] Failed to load feeds:`, feedErr.message);
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord?.id, {
            status: 'failed', completed_at: new Date().toISOString(), error_message: feedErr.message,
        }).catch(() => {});
        return Response.json({ success: false, error: `Feed load failed: ${feedErr.message}`, feeds_processed: 0 }, { status: 500 });
    }

    // ── Plan limit (server-side) ───────────────────────────────────────────────
    // Feeds can be created outside addSource (direct SDK create), so the free-plan source
    // limit is enforced here too: a free owner's feeds beyond the limit (newest first) are
    // simply not fetched. Mirrors addSource (premium or admin = unlimited).
    try {
        const FREE_FEED_LIMIT = 50;
        const byOwner = {};
        for (const f of allFeeds) (byOwner[f.created_by || ''] ||= []).push(f);
        const overLimitOwners = Object.keys(byOwner).filter(o => o && byOwner[o].length > FREE_FEED_LIMIT);
        const skipIds = new Set();
        for (const owner of overLimitOwners) {
            const u = extractItems(await base44.asServiceRole.entities.User.filter({ email: owner }, '-created_date', 1))[0];
            if (u && (u.plan === 'premium' || u.role === 'admin')) continue;
            const sorted = [...byOwner[owner]].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')));
            for (const f of sorted.slice(FREE_FEED_LIMIT)) skipIds.add(f.id);
            console.warn(`[fetchFeeds][${instanceId}] ${owner} is over the free limit: skipping ${sorted.length - FREE_FEED_LIMIT} feed(s)`);
        }
        if (skipIds.size) allFeeds = allFeeds.filter(f => !skipIds.has(f.id));
    } catch (limitErr) {
        console.warn(`[fetchFeeds][${instanceId}] plan-limit check skipped: ${limitErr.message}`);
    }

    // ── Telemetry ──────────────────────────────────────────────────────────────
    const feedAgesMs = allFeeds.map(f => f.last_fetched ? Date.now() - new Date(f.last_fetched).getTime() : Infinity);
    const finiteAges = feedAgesMs.filter(isFinite).sort((a, b) => a - b);
    const p50lag = finiteAges.length ? Math.round(finiteAges[Math.floor(0.50 * finiteAges.length)] / 60000) : 0;
    const p95lag = finiteAges.length ? Math.round(finiteAges[Math.floor(0.95 * finiteAges.length)] / 60000) : 0;
    const maxLagMin = finiteAges.length ? Math.round(finiteAges[finiteAges.length - 1] / 60000) : 0;
    const overdueThreshMs = RUN_INTERVAL_MINUTES * 60 * 1000;
    const overdueFeeds = allFeeds.filter(f =>
        (!f.last_fetched || (Date.now() - new Date(f.last_fetched).getTime()) > overdueThreshMs) &&
        // Honour rate-limit backoff on active feeds
        (!f.retry_after_at || new Date(f.retry_after_at).getTime() <= Date.now())
    );
    const feeds = overdueFeeds.slice(0, 120);

    console.log(`[fetchFeeds][${instanceId}] total=${allFeeds.length} overdue=${overdueFeeds.length} processing=${feeds.length} p50=${p50lag}min p95=${p95lag}min max=${maxLagMin}min`);

    // ── Load alerts once ───────────────────────────────────────────────────────
    let alertsByFeedId = {};
    try {
        const allAlerts = extractItems(await base44.asServiceRole.entities.FeedAlert.filter({ is_active: true }));
        // Tenant guard (2026-09-25): FeedAlert create is open, so a user could point an alert at
        // someone else's feed_id and have new items POSTed to their own webhook. Only honour
        // alerts created by the feed's owner, sent to real Slack/Discord hosts.
        const feedOwner = Object.fromEntries(allFeeds.map(f => [f.id, f.created_by]));
        const hostsFor = { slack: ['hooks.slack.com'], discord: ['discord.com', 'discordapp.com'] };
        for (const alert of allAlerts) {
            if (!feedOwner[alert.feed_id] || feedOwner[alert.feed_id] !== alert.created_by) continue;
            const hosts = hostsFor[alert.channel_type] || [];
            let okHost = false;
            try { const u = new URL(alert.webhook_url); okHost = u.protocol === 'https:' && hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { okHost = false; }
            if (!okHost) continue;
            if (!alertsByFeedId[alert.feed_id]) alertsByFeedId[alert.feed_id] = [];
            alertsByFeedId[alert.feed_id].push(alert);
        }
    } catch (e) {
        console.warn('[fetchFeeds] Could not load alerts (non-fatal):', e.message);
    }

    // ── Run batches ────────────────────────────────────────────────────────────
    const summary = await runFeedBatches(feeds, alertsByFeedId, base44).catch(batchErr => {
        console.error(`[fetchFeeds][${instanceId}] runFeedBatches threw unexpectedly:`, batchErr.message);
        return { ok: 0, error: feeds.length, auto_paused: 0, rate_limited: 0, new_items: 0, duplicates: 0, db_write_errors: 1 };
    });

    const runDurationMs = Date.now() - runStartMs;
    const finalSummary = {
        feeds_attempted: feeds.length,
        feeds_ok: summary.ok,
        feeds_error: summary.error,
        feeds_auto_paused: summary.auto_paused,
        feeds_rate_limited: summary.rate_limited,
        new_items_total: summary.new_items,
        duplicates_skipped: summary.duplicates,
        db_write_errors: summary.db_write_errors,
        total_feeds_in_system: allFeeds.length,
        skipped_recently_fetched: allFeeds.length - feeds.length,
        p50_lag_min: p50lag,
        p95_lag_min: p95lag,
        max_lag_min: maxLagMin,
        run_duration_ms: runDurationMs,
    };

    console.log(`[fetchFeeds][${instanceId}] DONE — ${JSON.stringify(finalSummary)}`);

    clearInterval(heartbeatTimer);
    if (lockRecord?.id) {
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            metadata: { ...finalSummary, instance_id: instanceId, run_type: 'main', auth_path: authPath, has_internal_header: hasInternalHeader },
        }).catch(() => {});
    }

    // ── Chain: trigger lens scoring → clustering pipeline ─────────────────────
    if (summary.new_items > 0) {
        console.log(`[fetchFeeds][${instanceId}] Chaining → backfillLensScores (${summary.new_items} new items)`);
        base44.asServiceRole.functions.invoke('backfillLensScores', {
            days_back: 2,
            batch_size: 10,
            max_batches: 10,
            chain_cluster: true,
        }).catch(chainErr => {
            console.warn(`[fetchFeeds][${instanceId}] Chain to backfillLensScores failed (non-fatal): ${chainErr.message}`);
        });
    } else {
        console.log(`[fetchFeeds][${instanceId}] No new items — skipping lens scoring chain`);
    }

    return Response.json({ success: true, instance_id: instanceId, ...finalSummary });
});