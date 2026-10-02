import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backfillStoryImages
 * Gives recent stories a lead image so the app can show thumbnails.
 *   1. Re-reads the stored entry body for an <img> (cheap, no network).
 *   2. Otherwise fetches the article page (first 300 KB) and reads og:image /
 *      twitter:image / link rel=image_src.
 * Marks each item image_status = feed | page | none so it is only tried once.
 * Runs every 15 minutes (workflow "Story Images"), newest and most important first,
 * capped by count and a time budget. Admin or scheduler only.
 */

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

// ─── Story image (CANONICAL COPY: fetchFeeds, fetchSingleFeed, recoverFeeds) ──
// Picks the story's lead image from the feed entry itself: media:content /
// media:thumbnail (incl. media:group), image enclosures, itunes:image, Atom
// enclosure links, then the first real <img> in the body. Returns an absolute
// https URL or ''. Items without one get filled later from the article page's
// og:image by backfillStoryImages.
function __asArr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
function __text(v) { return typeof v === 'string' ? v : (v && typeof v === 'object' ? (v['#text'] || '') : ''); }
function normalizeImageUrl(u, base) {
    if (!u || typeof u !== 'string') return '';
    u = u.trim().replace(/&amp;/g, '&');
    if (!u || u.startsWith('data:')) return '';
    try {
        const abs = new URL(u, base || undefined);
        if (abs.protocol === 'http:') abs.protocol = 'https:';
        if (abs.protocol !== 'https:') return '';
        const s = abs.toString();
        return s.length > 1000 ? '' : s;
    } catch { return ''; }
}
const __JUNK_IMG = /(pixel|tracking|spacer|blank\.|feedburner|gravatar|emoji|badge|logo|icon|avatar|share|button|1x1|\/ads?\/)/i;
function firstImgInHtml(html) {
    if (!html || typeof html !== 'string') return '';
    const s = decodeHtml(html) || '';
    const re = /<img\b[^>]*>/gi;
    let m;
    while ((m = re.exec(s))) {
        const tag = m[0];
        const w = /\bwidth=["']?(\d+)/i.exec(tag);
        const h = /\bheight=["']?(\d+)/i.exec(tag);
        if ((w && Number(w[1]) < 120) || (h && Number(h[1]) < 80)) continue;
        const src = /\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i.exec(tag);
        if (src && !__JUNK_IMG.test(src[1]) && !/\.(gif|svg)(\?|$)/i.test(src[1])) return src[1];
    }
    return '';
}
function pickItemImage(raw, link) {
    if (!raw || typeof raw !== 'object') return '';
    const cands = [];
    for (const g of [...__asArr(raw['media:group']), raw]) {
        for (const mc of __asArr(g['media:content'])) {
            const t = String(mc?.['@_type'] || mc?.['@_medium'] || '');
            if (!t || /image/i.test(t)) cands.push(mc?.['@_url']);
        }
        for (const mt of __asArr(g['media:thumbnail'])) cands.push(mt?.['@_url']);
    }
    for (const e of __asArr(raw.enclosure)) {
        const u = e?.['@_url'] || '';
        if (/image/i.test(e?.['@_type'] || '') || /\.(jpe?g|png|webp)(\?|$)/i.test(u)) cands.push(u);
    }
    const it = raw['itunes:image'];
    if (it) cands.push(typeof it === 'string' ? it : it['@_href']);
    for (const l of __asArr(raw.link)) {
        if (l && typeof l === 'object' && l['@_rel'] === 'enclosure' && /image/i.test(l['@_type'] || '')) cands.push(l['@_href']);
    }
    for (const body of [raw['content:encoded'], raw.content, raw.description, raw.summary]) {
        const u = firstImgInHtml(__text(body));
        if (u) cands.push(u);
    }
    for (const c of cands) {
        if (!c || __JUNK_IMG.test(String(c))) continue;
        const n = normalizeImageUrl(String(c), link);
        if (n) return n;
    }
    return '';
}

function extractItems(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== 'object') return [];
    for (const k of ['items', 'data', 'results']) if (Array.isArray(raw[k])) return raw[k];
    return [];
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const META_KEYS = new Set(['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
function imageFromPage(html, base) {
    const metas = html.match(/<meta\b[^>]*>/gi) || [];
    const found = {};
    for (const tag of metas) {
        const key = (/\b(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1] || '').toLowerCase();
        if (!META_KEYS.has(key) || found[key]) continue;
        const content = /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1];
        if (content) found[key] = content;
    }
    const link = /<link\b[^>]*rel=["']image_src["'][^>]*>/i.exec(html)?.[0];
    const linkHref = link ? /\bhref=["']([^"']+)["']/i.exec(link)?.[1] : '';
    for (const c of [found['og:image:secure_url'], found['og:image'], found['og:image:url'], found['twitter:image'], found['twitter:image:src'], linkHref]) {
        if (!c || __JUNK_IMG.test(c)) continue;
        const n = normalizeImageUrl(decodeHtml(c), base);
        if (n) return n;
    }
    return '';
}

async function readCapped(res, maxBytes) {
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let total = 0;
    while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
        // og tags live in <head>; stop once we are past it.
        if (total > 20000 && new TextDecoder().decode(value).includes('</head>')) break;
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    const buf = new Uint8Array(Math.min(total, maxBytes));
    let off = 0;
    for (const c of chunks) { const n = Math.min(c.length, buf.length - off); buf.set(c.subarray(0, n), off); off += n; if (off >= buf.length) break; }
    return new TextDecoder().decode(buf);
}

async function lookup(item) {
    const fromBody = firstImgInHtml(item.content) || firstImgInHtml(item.description);
    if (fromBody) {
        const n = normalizeImageUrl(fromBody, item.url);
        if (n) return { image_url: n, image_status: 'feed' };
    }
    if (!/^https?:\/\//i.test(item.url || '')) return { image_status: 'none' };
    try {
        const res = await safeFetch(item.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.com)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return { image_status: 'none' };
        const html = await readCapped(res, 300000);
        const img = imageFromPage(html, res.url || item.url);
        return img ? { image_url: img, image_status: 'page' } : { image_status: 'none' };
    } catch {
        return { image_status: 'none' };
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch { /* scheduled runs send no body */ }
    const hours = Math.min(Number(body.hours) || 72, 24 * 14);
    const limit = Math.min(Number(body.limit) || 60, 200);
    const budgetMs = Math.min(Number(body.budget_ms) || 100000, 150000);
    const started = Date.now();
    const svc = base44.asServiceRole.entities;

    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const recent = extractItems(await svc.FeedItem.filter({ published_date: { $gte: since } }, '-published_date', 600));
    const todo = recent
        .filter(i => !i.image_url && (!i.image_status || i.image_status === 'pending'))
        .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0))
        .slice(0, limit);

    const stats = { candidates: todo.length, feed: 0, page: 0, none: 0, errors: 0, deferred: 0 };
    const CONCURRENCY = 6;
    let cursor = 0;
    async function worker() {
        while (cursor < todo.length) {
            if (Date.now() - started > budgetMs) { stats.deferred = todo.length - cursor; return; }
            const item = todo[cursor++];
            const result = await lookup(item);
            try {
                await svc.FeedItem.update(item.id, { ...result, image_checked_at: new Date().toISOString() });
                stats[result.image_status] = (stats[result.image_status] || 0) + 1;
            } catch (e) {
                stats.errors++;
                if (String(e?.message || '').includes('429')) await sleep(1500);
            }
            await sleep(60);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    stats.duration_ms = Date.now() - started;
    console.log('[backfillStoryImages]', JSON.stringify(stats));
    return Response.json({ success: true, ...stats });
});
