import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = ip.replace(/^\[|\]$/g, '').toLowerCase();
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::ffff:/.test(h)) return __isPrivateIp(h.replace(/^::ffff:/, ''));
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
            guid: item['@_rdf:about'] || typeof item.link === 'string' ? item.link : '',
        }));
    }

    throw new Error('Unrecognized feed format');
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
        if (!feed) return Response.json({ error: 'Feed not found' }, { status: 404 });

        // Only allow the owner to trigger an immediate fetch
        if (feed.created_by !== user.email) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const items = await parseFeed(feed.url);

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
            });
        }

        if (itemsToCreate.length > 0) {
            await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
        }

        await base44.asServiceRole.entities.Feed.update(feed_id, {
            last_fetched: new Date().toISOString(),
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