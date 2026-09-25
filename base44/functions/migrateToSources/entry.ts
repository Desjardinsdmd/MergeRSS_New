import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * migrateToSources — step 1 of the Feed -> Source/Subscription migration.
 *
 * { mode: 'dry_run' } (default): maps every legacy Feed to a canonical Source by
 *   normalized URL and reports duplication. Writes nothing except a SystemHealth report.
 * { mode: 'apply' }: creates Source + Subscription records (idempotent: Sources are
 *   matched by normalized_url, Subscriptions by legacy_feed_id). Articles are NOT
 *   moved here; that is a separate, time-budgeted step.
 *
 * Admin only.
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const PAGE = 500;
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

function normalizeUrl(raw = '') {
    try {
        const u = new URL(String(raw).trim());
        u.protocol = 'https:';
        u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
        u.hash = '';
        for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
        u.searchParams.sort();
        let path = u.pathname.replace(/\/+$/, '');
        if (!path) path = '';
        const qs = u.searchParams.toString();
        return `${u.hostname}${path}${qs ? '?' + qs : ''}`;
    } catch {
        return String(raw).trim().toLowerCase();
    }
}
const looksPrivate = (url = '') =>
    /[?&](token|key|auth|secret|sig|signature|access_token|apikey)=|kill-the-newsletter|\/private\//i.test(url);

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'apply' ? 'apply' : 'dry_run';
    const svc = base44.asServiceRole.entities;

    const feeds = [];
    for (let skip = 0; skip < 100_000; skip += PAGE) {
        const page = extractItems(await svc.Feed.filter({}, 'created_date', PAGE, skip));
        feeds.push(...page);
        if (page.length < PAGE) break;
    }

    // Group feeds by canonical URL
    const groups = new Map();
    for (const f of feeds) {
        const key = normalizeUrl(f.resolved_url || f.url);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
    }

    const domainSources = {};
    const dupGroups = [];
    let storedItems = 0, estUniqueItems = 0, privateSources = 0;
    for (const [key, fs] of groups) {
        const counts = fs.map(f => f.item_count || 0);
        storedItems += counts.reduce((a, b) => a + b, 0);
        estUniqueItems += Math.max(0, ...counts);
        const domain = key.split('/')[0].split('?')[0];
        (domainSources[domain] ||= []).push(key);
        if (fs.some(f => looksPrivate(f.url))) privateSources++;
        if (fs.length > 1) {
            dupGroups.push({
                normalized_url: key,
                feeds: fs.length,
                owners: [...new Set(fs.map(f => f.created_by))].length,
                names: fs.map(f => f.name).slice(0, 5),
                stored_items: counts.reduce((a, b) => a + b, 0),
            });
        }
    }
    const multiSourceDomains = Object.entries(domainSources)
        .filter(([, ks]) => ks.length > 1)
        .map(([domain, ks]) => ({ domain, sources: ks.length, urls: ks.slice(0, 6) }))
        .sort((a, b) => b.sources - a.sources);

    const report = {
        mode,
        legacy_feeds: feeds.length,
        unique_sources: groups.size,
        feeds_collapsed: feeds.length - groups.size,
        owners: [...new Set(feeds.map(f => f.created_by))].length,
        private_sources: privateSources,
        stored_items: storedItems,
        est_unique_items: estUniqueItems,
        est_duplicate_items: storedItems - estUniqueItems,
        duplicate_url_groups: dupGroups.sort((a, b) => b.stored_items - a.stored_items).slice(0, 25),
        domains_with_multiple_sources: multiSourceDomains.slice(0, 15),
    };

    if (mode === 'apply') {
        let sourcesCreated = 0, subsCreated = 0;
        for (const [key, fs] of groups) {
            if (Date.now() - t0 > 45_000) { report.apply_incomplete = true; break; }
            const primary = fs.find(f => f.status === 'active') || fs[0];
            let src = extractItems(await svc.Source.filter({ normalized_url: key }, '-created_date', 1))[0];
            if (!src) {
                src = await svc.Source.create({
                    normalized_url: key,
                    url: primary.resolved_url || primary.url,
                    resolved_url: primary.resolved_url || null,
                    site_domain: key.split('/')[0].split('?')[0],
                    title: primary.name,
                    source_type: primary.source_type || 'rss_native',
                    status: fs.some(f => f.status === 'active') ? 'active' : (primary.status === 'error' ? 'error' : 'paused'),
                    is_private: fs.some(f => looksPrivate(f.url)),
                    subscriber_count: [...new Set(fs.map(f => f.created_by))].length,
                    item_count: Math.max(0, ...fs.map(f => f.item_count || 0)),
                    last_fetched_at: primary.last_fetched || null,
                    last_success_at: primary.last_successful_fetch_at || null,
                    consecutive_errors: primary.consecutive_errors || 0,
                    last_error: primary.fetch_error || '',
                    next_fetch_at: new Date().toISOString(),
                    legacy_feed_ids: fs.map(f => f.id),
                });
                sourcesCreated++;
            }
            for (const f of fs) {
                const existing = extractItems(await svc.Subscription.filter({ legacy_feed_id: f.id }, '-created_date', 1))[0];
                if (existing) continue;
                await svc.Subscription.create({
                    user_email: f.created_by, source_id: src.id, legacy_feed_id: f.id,
                    display_name: f.name, url: f.url, category: f.category, tags: f.tags || [],
                    status: f.status === 'paused' ? 'paused' : 'active',
                    is_public: !!f.is_public, public_description: f.public_description || '',
                });
                subsCreated++;
            }
        }
        report.sources_created = sourcesCreated;
        report.subscriptions_created = subsCreated;
    }

    await svc.SystemHealth.create({
        job_type: mode === 'apply' ? 'migration_apply' : 'migration_dry_run',
        status: 'completed', started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: report,
    }).catch(() => {});

    return Response.json(report);
});
