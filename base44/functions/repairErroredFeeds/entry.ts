import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const UA = 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)';
const FETCH_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithTimeout(url, timeoutMs = 12000) {
    return fetch(url, {
        headers: FETCH_HEADERS,
        redirect: 'follow',
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
        const deleted = [];
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
                    // No working feed found — delete it
                    await base44.asServiceRole.entities.Feed.delete(feed.id);
                    deleted.push({ name: feed.name, url, reason: feed.fetch_error });
                    console.log(`✗ Deleted: ${feed.name} (${url})`);
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
                deleted: deleted.length,
                errors: errors.length,
            },
            repaired,
            deleted,
            errors,
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});