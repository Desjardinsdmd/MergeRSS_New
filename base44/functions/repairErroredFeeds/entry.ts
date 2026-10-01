import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const UA = 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)';
const FETCH_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

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

async function fetchWithTimeout(url, timeoutMs = 12000) {
    return safeFetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
    });
}

function isRssFeed(text) {
    const t = text.trimStart();
    return (
        (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF')) &&
        (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'))
    );
}

function discoverFeedUrls(html, pageUrl) {
    const base = new URL(pageUrl);
    const fromTags = [];
    const fromPaths = [];

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

    for (const path of ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml', '/blog/feed', '/news/feed', '/feed/rss2', '/?feed=rss2']) {
        try { fromPaths.push(new URL(path, base).href); } catch {}
    }

    return { priority: [...new Set(fromTags)], probes: [...new Set(fromPaths)] };
}

async function tryFindWorkingFeed(url) {
    // 1. Try direct URL as RSS
    try {
        const res = await fetchWithTimeout(url, 10000);
        if (res.ok) {
            const text = await res.text();
            if (isRssFeed(text)) return { method: 'direct_rss', feedUrl: url, xml: text };

            // 2. Discover embedded feed links
            const { priority, probes } = discoverFeedUrls(text, url);
            const candidates = [...priority, ...probes.slice(0, 6)];
            for (const c of candidates.slice(0, 10)) {
                try {
                    const cr = await fetchWithTimeout(c, 7000);
                    if (!cr.ok) continue;
                    const ct = await cr.text();
                    if (isRssFeed(ct)) return { method: 'discovered_rss', feedUrl: c, xml: ct };
                } catch {}
            }
        }
    } catch {}

    // 3. Try common feed paths on the root domain
    try {
        const base = new URL(url);
        const roots = [
            `${base.origin}/feed`,
            `${base.origin}/rss`,
            `${base.origin}/rss.xml`,
            `${base.origin}/atom.xml`,
            `${base.origin}/feed.xml`,
        ];
        for (const r of roots) {
            try {
                const rr = await fetchWithTimeout(r, 6000);
                if (!rr.ok) continue;
                const rt = await rr.text();
                if (isRssFeed(rt)) return { method: 'root_probe', feedUrl: r, xml: rt };
            } catch {}
        }
    } catch {}

    return null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        // Get all errored feeds
        const errorFeeds = await base44.asServiceRole.entities.Feed.filter({ status: 'error' });
        console.log(`Found ${errorFeeds.length} errored feeds`);

        const repaired = [];
        const paused = [];
        const errors = [];

        for (const feed of errorFeeds) {
            const url = feed.url;
            console.log(`Processing: ${feed.name} (${url})`);

            try {
                const result = await tryFindWorkingFeed(url);

                if (result) {
                    // Found a working feed — update the Feed record with corrected URL and reset status
                    const newUrl = result.feedUrl;
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        url: newUrl,
                        status: 'active',
                        fetch_error: null,
                        consecutive_errors: 0,
                        last_fetched: new Date().toISOString(),
                    });
                    repaired.push({ name: feed.name, original_url: url, new_url: newUrl, method: result.method });
                    console.log(`✓ Repaired: ${feed.name} → ${newUrl} (${result.method})`);
                } else {
                    // No working feed found: pause it (never delete a user's feed record)
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        status: 'paused',
                        paused_by_system: true,
                        paused_reason: 'Could not be repaired automatically',
                    });
                    paused.push({ name: feed.name, url, reason: feed.fetch_error });
                    console.log(`✗ Paused: ${feed.name} (${url})`);
                }
            } catch (e) {
                console.error(`Error processing ${feed.name}: ${e.message}`);
                errors.push({ name: feed.name, url, error: e.message });
            }

            // Small delay to avoid hammering servers
            await new Promise(r => setTimeout(r, 300));
        }

        return Response.json({
            summary: {
                total: errorFeeds.length,
                repaired: repaired.length,
                paused: paused.length,
                deleted: 0,
                errors: errors.length,
            },
            repaired,
            paused,
            deleted: [],
            errors,
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});