import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
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

function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
        .replace(/&hellip;/g, '…').replace(/&amp;/g, '&');
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

async function parseFeed(url) {
    const response = await safeFetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const xml = await response.text();

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
        allowBooleanAttributes: true,
    });
    const parsed = parser.parse(xml);

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
            image_url: pickItemImage(item, typeof item.link === 'string' ? item.link : ''),
        }));
    }

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
                image_url: pickItemImage(entry, link),
            };
        });
    }

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
            image_url: pickItemImage(item, typeof item.link === 'string' ? item.link : ''),
        }));
    }

    throw new Error('Unrecognized feed format');
}

function isNewsletterFeed(f) {
    if (!f) return false;
    if (f.source_type === 'newsletter') return true;
    if (typeof f.url === 'string' && f.url.startsWith('newsletter://')) return true;
    try { if (f.metadata_json && JSON.parse(f.metadata_json)?.newsletter === true) return true; } catch { /* ignore */ }
    return false;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { feed_id } = await req.json();
        if (!feed_id) return Response.json({ error: 'feed_id is required' }, { status: 400 });

        // Fetch the feed record (service role to ensure it exists)
        const feed = await base44.asServiceRole.entities.Feed.get(feed_id);
        if (!feed) return Response.json({ error: 'Source not found' }, { status: 404 });

        // Only allow the owner to trigger an immediate fetch
        if (feed.created_by !== user.email) return Response.json({ error: 'Forbidden' }, { status: 403 });

        // Newsletter feeds are filled by inbound email (mailgunWebhook); there is no URL to fetch.
        // Report success with zero items and never touch the error fields.
        if (isNewsletterFeed(feed)) {
            return Response.json({ success: true, new_items: 0, skipped: 'newsletter' });
        }

        let items;
        try {
            items = await parseFeed(feed.url);
        } catch (fetchErr) {
            // Record the failure so the UI can show it; status transitions stay with the scheduled pipeline.
            const msg = String(fetchErr?.message || 'Fetch failed').slice(0, 500);
            await base44.asServiceRole.entities.Feed.update(feed_id, {
                fetch_error: msg,
                last_failure_at: new Date().toISOString(),
                last_failure_reason: msg,
            }).catch(() => {});
            return Response.json({ success: false, error: msg, new_items: 0 });
        }

        // Get existing items to avoid duplicates
        const existing = await base44.asServiceRole.entities.FeedItem.filter({ feed_id }, '-created_date', 300);
        const existingGuids = new Set((existing || []).map(i => i.guid).filter(Boolean));
        const existingUrls = new Set((existing || []).map(i => i.url).filter(Boolean));

        const itemsToCreate = [];
        for (const item of items.slice(0, 50)) {
            if (!item.guid && !item.url) continue;
            if (existingGuids.has(item.guid) || existingUrls.has(item.url)) continue;
            itemsToCreate.push({
                feed_id,
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
                image_url: String(item.image_url || ''),
                image_status: item.image_url ? 'feed' : 'pending',
            });
        }

        if (itemsToCreate.length > 0) {
            await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
        }

        await base44.asServiceRole.entities.Feed.update(feed_id, {
            last_fetched: new Date().toISOString(),
            last_successful_fetch_at: new Date().toISOString(),
            item_count: (feed.item_count || 0) + itemsToCreate.length,
            status: 'active',
            fetch_error: '',
            consecutive_errors: 0,
        });

        return Response.json({ success: true, new_items: itemsToCreate.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});