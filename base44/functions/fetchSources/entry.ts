import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

/**
 * fetchSources — new-model fetch worker (runs in shadow alongside fetchFeeds).
 *
 * Each Source is fetched once no matter how many users subscribe to it.
 * Claims due Sources with a lease (lease_until + lease_owner, re-read to confirm)
 * so overlapping runs never fetch the same source twice. Uses ETag / Last-Modified
 * for conditional requests. New articles are deduplicated across ALL sources by
 * url_key: a story already stored from another feed gets a new SourceItem link,
 * not a second Article, and is never scored twice.
 *
 * Errors back off exponentially (interval * 2^errors, capped at 24h). Articles
 * are written with enrichment_status 'pending' for enrichArticles to pick up.
 *
 * 45s budget, claims in batches of 10, concurrency 5. Admin / scheduler only.
 */

const BUDGET_MS = 45_000;
const BATCH = 10;
const CONCURRENCY = 5;
const LEASE_MS = 3 * 60_000;
const MAX_BACKOFF_MIN = 24 * 60;
const CHUNK = 100;
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|ncid)$/i;
const UA = 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)';

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Must match migrateArticles.urlKey exactly, or migrated and fetched copies won't merge.
function urlKey(raw = '') {
    try {
        const u = new URL(String(raw).trim());
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
        u.searchParams.sort();
        const path = u.pathname.replace(/\/+$/, '');
        const qs = u.searchParams.toString();
        return `${host}${path}${qs ? '?' + qs : ''}`;
    } catch {
        return String(raw).trim().toLowerCase();
    }
}
const itemKey = (it) => urlKey(it.url || '') || `guid:${it.guid}`;

function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014')
        .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
        .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
        .replace(/&hellip;/g, '\u2026').replace(/&amp;/g, '&');
}
const txt = (v) => (typeof v === 'string' ? v : (v?.['#text'] || ''));

// Clamp bad dates: missing or unparseable -> now; more than 1h in the future -> now.
// (Bank of Canada's feed shipped future-dated items that polluted newest-first sorts.)
function cleanDate(raw) {
    const now = Date.now();
    const t = raw ? new Date(raw).getTime() : NaN;
    if (!Number.isFinite(t) || t > now + 3600_000) return new Date(now).toISOString();
    return new Date(t).toISOString();
}

async function fetchFeed(source) {
    const headers = { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
    if (source.etag) headers['If-None-Match'] = source.etag;
    if (source.last_modified) headers['If-Modified-Since'] = source.last_modified;

    const res = await fetch(source.resolved_url || source.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (res.status === 304) return { notModified: true, items: [] };
    if (res.status === 429) throw new Error('HTTP_429: rate limited');
    if (!res.ok) throw new Error(`HTTP_${res.status}: ${res.statusText}`);

    const xml = await res.text();
    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('text/html') && !ctype.includes('xml') && xml.trimStart().toLowerCase().startsWith('<!doctype html')) {
        throw new Error('FEED_HTML: returned HTML');
    }
    const parsed = new XMLParser({
        ignoreAttributes: false, attributeNamePrefix: '@_',
        isArray: (n) => ['item', 'entry'].includes(n), allowBooleanAttributes: true,
    }).parse(xml);

    let items = [];
    if (parsed.rss?.channel) {
        items = (parsed.rss.channel.item || []).map(i => ({
            title: decodeHtml(txt(i.title)) || 'Untitled',
            url: txt(i.link) || txt(i.guid),
            description: decodeHtml(txt(i.description)),
            content: decodeHtml(txt(i['content:encoded']) || txt(i.description)),
            author: decodeHtml(txt(i.author) || txt(i['dc:creator'])),
            published_date: cleanDate(i.pubDate || i['dc:date']),
            guid: txt(i.guid) || txt(i.link),
        }));
    } else if (parsed.feed) {
        items = (parsed.feed.entry || []).map(e => {
            const links = Array.isArray(e.link) ? e.link : (e.link ? [e.link] : []);
            const link = links.find(l => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href'] || links[0]?.['@_href'] || '';
            return {
                title: decodeHtml(txt(e.title)) || 'Untitled', url: link,
                description: decodeHtml(txt(e.summary)), content: decodeHtml(txt(e.content)),
                author: decodeHtml(e.author?.name || ''), published_date: cleanDate(e.published || e.updated),
                guid: txt(e.id) || link,
            };
        });
    } else if (parsed['rdf:RDF'] || parsed.RDF) {
        const rdf = parsed['rdf:RDF'] || parsed.RDF;
        items = (rdf.item || []).map(i => ({
            title: txt(i.title) || 'Untitled', url: txt(i.link), description: txt(i.description),
            content: txt(i['content:encoded']), author: txt(i['dc:creator']),
            published_date: cleanDate(i['dc:date']), guid: i['@_rdf:about'] || txt(i.link),
        }));
    } else {
        throw new Error(`FEED_UNKNOWN_FORMAT: ${xml.slice(0, 100).replace(/\s+/g, ' ')}`);
    }

    return {
        notModified: false,
        items: items.filter(i => i.url || i.guid),
        etag: res.headers.get('etag') || '',
        lastModified: res.headers.get('last-modified') || '',
    };
}

// Fetch cadence: sources that feed an active digest or lens are fetched every 10 min,
// everything else hourly. Conditional requests (ETag / Last-Modified) keep the frequent
// fetches cheap. Matching mirrors how digests and lenses select feeds: same owner, and
// explicit feed_ids, a category match, a tag overlap, or no filter at all.
const HOT_MIN = 10;
const COLD_MIN = 60;
async function hotSourceIds(svc) {
    const subs = extractItems(await svc.Subscription.filter({}, 'created_date', 5000));
    const digests = extractItems(await svc.Digest.filter({ status: 'active' }, '-created_date', 1000));
    const lenses = extractItems(await svc.CustomLens.filter({ is_active: true }, '-created_date', 500));
    const lower = (a) => (a || []).map(x => String(x).toLowerCase());
    const selects = (owner, feedIds, cats, tags, sub) => {
        if (owner !== sub.user_email) return false;
        if (feedIds?.length) return feedIds.includes(sub.legacy_feed_id);
        if (cats?.length && !cats.includes(sub.category)) return false;
        if (tags?.length && !lower(tags).some(t => lower(sub.tags).includes(t))) return false;
        return true;
    };
    const hot = new Set();
    for (const sub of subs) {
        if (digests.some(d => selects(d.created_by, d.feed_ids, d.categories, d.tags, sub)) ||
            lenses.some(l => selects(l.created_by, null, l.feed_filter_categories, l.feed_filter_tags, sub))) {
            hot.add(sub.source_id);
        }
    }
    return hot;
}

async function claim(svc, runId) {
    const now = new Date();
    const nowIso = now.toISOString();
    const due = extractItems(await svc.Source.filter(
        { status: 'active', next_fetch_at: { $lte: nowIso } }, 'next_fetch_at', BATCH * 3));
    const free = due.filter(s => !s.lease_until || s.lease_until < nowIso).slice(0, BATCH);
    const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
    for (const s of free) await svc.Source.update(s.id, { lease_until: leaseUntil, lease_owner: runId });
    if (!free.length) return [];
    await sleep(300);
    const confirmed = extractItems(await svc.Source.filter({ id: { $in: free.map(s => s.id) } }, 'next_fetch_at', BATCH));
    return confirmed.filter(s => s.lease_owner === runId);
}

async function store(svc, source, items, category, stats) {
    if (!items.length) return 0;
    // Dedupe within the fetch itself
    const byKey = new Map();
    for (const it of items) { const k = itemKey(it); if (!byKey.has(k)) byKey.set(k, it); }
    const keys = [...byKey.keys()];

    const articleByKey = {};
    const loadArticles = async (ks) => {
        for (const c of chunks(ks, CHUNK)) {
            for (const a of extractItems(await svc.Article.filter({ url_key: { $in: c } }, '-created_date', CHUNK * 2))) {
                if (!articleByKey[a.url_key]) articleByKey[a.url_key] = a;
            }
        }
    };
    await loadArticles(keys);

    // Links this source already has for the known articles
    const knownIds = Object.values(articleByKey).map(a => a.id);
    const linked = new Set();
    for (const c of chunks(knownIds, CHUNK)) {
        for (const l of extractItems(await svc.SourceItem.filter({ source_id: source.id, article_id: { $in: c } }, '-created_date', CHUNK * 2))) {
            linked.add(l.article_id);
        }
    }

    const nowIso = new Date().toISOString();
    const missing = keys.filter(k => !articleByKey[k]);
    if (missing.length) {
        const rows = missing.map(k => {
            const it = byKey.get(k);
            return {
                url_key: k, url: it.url || '', title: String(it.title).slice(0, 500),
                description: String(it.description || '').slice(0, 2000), content: String(it.content || '').slice(0, 5000),
                author: String(it.author || '').slice(0, 200), published_date: it.published_date, first_seen_at: nowIso,
                category: category || '', enrichment_status: 'pending', source_count: 1,
            };
        });
        for (const c of chunks(rows, CHUNK)) await svc.Article.bulkCreate(c);
        stats.articles_created += rows.length;
        await loadArticles(missing);
    }

    const links = [];
    for (const k of keys) {
        const art = articleByKey[k];
        if (!art || linked.has(art.id)) continue;
        const it = byKey.get(k);
        links.push({ source_id: source.id, article_id: art.id, guid: String(it.guid || it.url || ''),
            published_date: it.published_date, fetched_at: nowIso });
        if (!missing.includes(k)) {
            // Existing article picked up by another source: count it, don't re-score it
            stats.articles_reused++;
            await svc.Article.update(art.id, { source_count: (art.source_count || 1) + 1 }).catch(() => {});
        }
    }
    for (const c of chunks(links, CHUNK)) await svc.SourceItem.bulkCreate(c);
    stats.links_created += links.length;
    return links.length;
}

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole.entities;
    const runId = `fs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stats = { sources_fetched: 0, not_modified: 0, errors: 0, articles_created: 0, articles_reused: 0, links_created: 0, error_samples: [] };

    try {
    const hot = await hotSourceIds(svc);
    stats.hot_sources = hot.size;
    while (Date.now() - t0 < BUDGET_MS - 20_000) {
        const batch = await claim(svc, runId);
        if (!batch.length) break;

        const subs = extractItems(await svc.Subscription.filter({ source_id: { $in: batch.map(s => s.id) } }, 'created_date', 500));
        const categoryBySource = {};
        for (const s of subs) if (s.category && !categoryBySource[s.source_id]) categoryBySource[s.source_id] = s.category;

        const queue = [...batch];
        await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
            while (queue.length) {
                const source = queue.shift();
                const interval = hot.has(source.id) ? HOT_MIN : COLD_MIN;
                const nowIso = new Date().toISOString();
                try {
                    const r = await fetchFeed(source);
                    let added = 0;
                    if (r.notModified) stats.not_modified++;
                    else added = await store(svc, source, r.items, categoryBySource[source.id], stats);
                    stats.sources_fetched++;
                    await svc.Source.update(source.id, {
                        last_fetched_at: nowIso, last_success_at: nowIso, consecutive_errors: 0, last_error: '',
                        etag: r.notModified ? source.etag : (r.etag || ''),
                        last_modified: r.notModified ? source.last_modified : (r.lastModified || ''),
                        item_count: (source.item_count || 0) + added,
                        fetch_interval_min: interval,
                        next_fetch_at: new Date(Date.now() + interval * 60_000).toISOString(),
                        lease_until: nowIso,
                    });
                } catch (err) {
                    stats.errors++;
                    const errors = (source.consecutive_errors || 0) + 1;
                    const backoff = Math.min(interval * 2 ** Math.min(errors, 10), MAX_BACKOFF_MIN);
                    if (stats.error_samples.length < 10) stats.error_samples.push(`${source.title || source.url}: ${String(err.message).slice(0, 120)}`);
                    await svc.Source.update(source.id, {
                        last_fetched_at: nowIso, consecutive_errors: errors, last_error: String(err.message).slice(0, 500),
                        next_fetch_at: new Date(Date.now() + backoff * 60_000).toISOString(),
                        lease_until: nowIso,
                    }).catch(() => {});
                }
            }
        }));
    }
    } catch (fatal) {
        await svc.SystemHealth.create({
            job_type: 'source_fetch', status: 'failed',
            error_message: `${fatal?.message}\n${String(fatal?.stack || '').slice(0, 1500)}`,
            metadata: { ...stats, run_id: runId },
        }).catch(() => {});
        return Response.json({ error: fatal?.message, stats }, { status: 500 });
    }

    await svc.SystemHealth.create({
        job_type: 'source_fetch', status: 'completed',
        started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: { ...stats, run_id: runId, duration_ms: Date.now() - t0 },
    }).catch((e) => console.error('[fetchSources] health log failed:', e.message));

    return Response.json({ ...stats, run_id: runId, duration_ms: Date.now() - t0 });
});
