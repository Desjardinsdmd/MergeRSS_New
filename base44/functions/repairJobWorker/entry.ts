import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── User-Agent & fetch helpers ──────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
};

async function fetchUrl(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// ── RSS detection ───────────────────────────────────────────────────────────
function isRssContent(text) {
    const t = text.trimStart().slice(0, 500);
    return (
        (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF')) &&
        (text.includes('<item>') || text.includes('<entry>') || text.includes('<channel>'))
    );
}

// ── RSS validation quality gate ─────────────────────────────────────────────
function validateRssFeed(xml, sourceUrl) {
    const issues = [];

    // Must have at least 3 items/entries
    const itemCount = (xml.match(/<item[\s>]/g) || []).length + (xml.match(/<entry[\s>]/g) || []).length;
    if (itemCount < 3) issues.push(`Too few items: ${itemCount} (need ≥3)`);

    // Must have non-empty titles
    const titles = [...xml.matchAll(/<title[^>]*><!\[CDATA\[([^\]]+)\]\]>/gi)];
    const nonEmptyTitles = titles.filter(m => m[1].trim().length > 5);
    if (titles.length > 0 && nonEmptyTitles.length < titles.length * 0.5) {
        issues.push('Most item titles are empty or too short');
    }

    // Must have valid-looking links
    const links = [...xml.matchAll(/<link>([^<]+)<\/link>/gi)];
    const validLinks = links.filter(m => m[1].trim().startsWith('http'));
    if (links.length > 0 && validLinks.length < links.length * 0.5) {
        issues.push('Most item links are invalid');
    }

    // Garbage/error page detection
    const lc = xml.toLowerCase();
    if (lc.includes('access denied') || lc.includes('cloudflare') || lc.includes('captcha') || lc.includes('please enable javascript')) {
        issues.push('Feed content looks like a bot-block page');
    }

    // Excessive duplicates check
    const allTitles = [...xml.matchAll(/<title[^>]*><!\[CDATA\[([^\]]+)\]\]>/gi)].map(m => m[1].trim());
    const unique = new Set(allTitles);
    if (allTitles.length > 3 && unique.size < allTitles.length * 0.5) {
        issues.push(`Excessive duplicate titles: ${allTitles.length} titles, ${unique.size} unique`);
    }

    return { valid: issues.length === 0, issues, item_count: itemCount };
}

// ── Feed URL discovery ──────────────────────────────────────────────────────
function discoverFeedUrls(html, pageUrl) {
    const base = new URL(pageUrl);
    const priority = [];
    const probes = [];

    // <link rel="alternate" type="application/rss+xml|atom+xml">
    const re = /<link[^>]+>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        if (!tag.toLowerCase().includes('alternate')) continue;
        const typeM = tag.match(/type=["']([^"']+)["']/i);
        const hrefM = tag.match(/href=["']([^"']+)["']/i);
        if (!hrefM) continue;
        const type = (typeM?.[1] || '').toLowerCase();
        if (type.includes('rss') || type.includes('atom') || type.includes('xml') || type.includes('feed')) {
            try { priority.push(new URL(hrefM[1], base).href); } catch {}
        }
    }

    // JSON feed discovery
    const jsonFeedRe = /<link[^>]+type=["']application\/feed\+json["'][^>]*href=["']([^"']+)["']/gi;
    let jm;
    while ((jm = jsonFeedRe.exec(html)) !== null) {
        try { priority.push(new URL(jm[1], base).href); } catch {}
    }

    // Common feed paths
    const paths = ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml',
        '/blog/feed', '/blog/rss', '/news/feed', '/feed/rss2', '/?feed=rss2',
        '/articles/feed', '/posts/feed', '/content/feed', '/en/feed', '/en/rss'];
    for (const p of paths) {
        try { probes.push(new URL(p, base).href); } catch {}
    }

    return { priority: [...new Set(priority)], probes: [...new Set(probes)] };
}

// ── Failure categorization ──────────────────────────────────────────────────
function categorizeFailure(diagnostics, errorMsg) {
    const msg = (errorMsg || '').toLowerCase();
    const { http_status, bot_blocked, paywall_detected, no_articles } = diagnostics;

    if (msg.includes('timeout') || msg.includes('abort')) return 'timeout';
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('econnrefused')) return 'network_error';
    if (http_status === 404 || http_status === 410) return '404_gone';
    if (http_status >= 400 && http_status < 500) return '404_gone';
    if (bot_blocked) return 'blocked_antibot';
    if (paywall_detected) return 'paywall_login';
    if (no_articles) return 'no_articles_found';
    if (msg.includes('valid') || msg.includes('parse')) return 'feed_validation_failed';
    if (msg.includes('extract')) return 'extraction_failed';
    return 'unexpected_error';
}

// ── Detect bot block / paywall ──────────────────────────────────────────────
function detectPageProblems(html, httpStatus) {
    const lc = (html || '').toLowerCase().slice(0, 5000);
    const bot_blocked = lc.includes('captcha') || lc.includes('cloudflare') ||
        lc.includes('access denied') || lc.includes('please enable javascript') ||
        lc.includes('bot') || lc.includes('ddos-guard') || httpStatus === 403;
    const paywall_detected = (lc.includes('subscribe') && lc.includes('paywall')) ||
        lc.includes('login required') || lc.includes('sign in to continue') || httpStatus === 401;
    return { bot_blocked, paywall_detected };
}

// ── Core repair attempt for one feed ───────────────────────────────────────
async function attemptRepair(feed) {
    const url = feed.url;
    const diag = {
        source_url: url,
        resolved_url: url,
        http_status: null,
        redirects_followed: 0,
        bot_blocked: false,
        paywall_detected: false,
        page_loaded: false,
        article_links_detected: false,
        candidate_count: 0,
        feed_passed_validation: false,
        failure_reason: null,
        failure_category: 'unexpected_error',
        repair_method: null,
        item_count: 0,
    };

    // ── Step 1: Direct RSS probe ────────────────────────────────────────────
    let html = null;
    let httpStatus = null;

    try {
        const res = await fetchUrl(url, 14000);
        httpStatus = res.status;
        diag.http_status = httpStatus;
        diag.resolved_url = res.url;

        if (!res.ok) {
            diag.failure_reason = `HTTP ${httpStatus}`;
            diag.failure_category = categorizeFailure(diag, `HTTP ${httpStatus}`);
            return { success: false, diag };
        }

        const text = await res.text();
        diag.page_loaded = text.length > 200;

        // Direct RSS/Atom?
        if (isRssContent(text)) {
            const validation = validateRssFeed(text, url);
            if (validation.valid) {
                diag.feed_passed_validation = true;
                diag.repair_method = 'direct_rss';
                diag.item_count = validation.item_count;
                return { success: true, method: 'direct_rss', feedUrl: url, xml: text, diag, validation };
            } else {
                diag.failure_reason = `Direct RSS failed validation: ${validation.issues.join('; ')}`;
                diag.failure_category = 'feed_validation_failed';
                return { success: false, diag };
            }
        }

        html = text;
        const { bot_blocked, paywall_detected } = detectPageProblems(html, httpStatus);
        diag.bot_blocked = bot_blocked;
        diag.paywall_detected = paywall_detected;

        if (bot_blocked) {
            diag.failure_reason = 'Bot protection detected';
            diag.failure_category = 'blocked_antibot';
            return { success: false, diag };
        }
        if (paywall_detected) {
            diag.failure_reason = 'Paywall or login wall detected';
            diag.failure_category = 'paywall_login';
            return { success: false, diag };
        }

    } catch (e) {
        diag.failure_reason = e.message;
        diag.failure_category = categorizeFailure(diag, e.message);
        return { success: false, diag };
    }

    // ── Step 2: Discover embedded feed links ───────────────────────────────
    if (html) {
        const { priority, probes } = discoverFeedUrls(html, url);
        const candidates = [...priority, ...probes.slice(0, 8)];
        diag.candidate_count = candidates.length;

        for (const c of candidates.slice(0, 14)) {
            try {
                const cr = await fetchUrl(c, 8000);
                if (!cr.ok) continue;
                const ct = await cr.text();
                if (!isRssContent(ct)) continue;
                const validation = validateRssFeed(ct, c);
                if (validation.valid) {
                    diag.feed_passed_validation = true;
                    diag.repair_method = priority.includes(c) ? 'discovered_rss_embedded' : 'discovered_rss_probe';
                    diag.item_count = validation.item_count;
                    diag.article_links_detected = true;
                    return { success: true, method: diag.repair_method, feedUrl: c, xml: ct, diag, validation };
                }
            } catch {}
        }
    }

    // ── Step 3: Try extra root domain probes not covered above ────────────
    try {
        const base = new URL(url);
        const extraPaths = [
            `${base.origin}/feed`,
            `${base.origin}/rss`,
            `${base.origin}/rss.xml`,
            `${base.origin}/atom.xml`,
            `${base.origin}/feed.xml`,
            `${base.origin}/news/rss`,
            `${base.origin}/blog/rss`,
        ];
        for (const p of extraPaths) {
            if (p === url) continue;
            try {
                const r = await fetchUrl(p, 7000);
                if (!r.ok) continue;
                const t = await r.text();
                if (!isRssContent(t)) continue;
                const validation = validateRssFeed(t, p);
                if (validation.valid) {
                    diag.feed_passed_validation = true;
                    diag.repair_method = 'root_probe';
                    diag.item_count = validation.item_count;
                    return { success: true, method: 'root_probe', feedUrl: p, xml: t, diag, validation };
                }
            } catch {}
        }
    } catch {}

    // ── All paths exhausted ────────────────────────────────────────────────
    if (!diag.failure_reason) {
        diag.failure_reason = html ? 'No valid RSS feed discovered from page' : 'Page not loaded';
        diag.failure_category = html ? 'no_articles_found' : 'network_error';
    }
    return { success: false, diag };
}

// ── Main worker ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { job_id } = body;
        if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

        // Load job
        const jobs = await base44.asServiceRole.entities.RepairJob.filter({ id: job_id });
        if (!jobs.length) return Response.json({ error: 'Job not found' }, { status: 404 });
        const job = jobs[0];

        if (job.status !== 'running') {
            return Response.json({ message: `Job is ${job.status}, not running` });
        }

        const feedIds = job.feed_ids_snapshot || [];
        let processed = job.processed_count || 0;
        let repaired = job.repaired_count || 0;
        let quarantined = job.quarantined_count || 0;
        let failed = job.failed_count || 0;

        // Category tallies
        const categoryTally = {};

        for (let i = processed; i < feedIds.length; i++) {
            const feedId = feedIds[i];

            // Check for cancellation
            const current = await base44.asServiceRole.entities.RepairJob.filter({ id: job_id });
            if (!current.length || current[0].status === 'cancelled') {
                console.log('Job cancelled, stopping worker');
                return Response.json({ message: 'Cancelled' });
            }

            // Load feed
            const feedList = await base44.asServiceRole.entities.Feed.filter({ id: feedId });
            if (!feedList.length) {
                processed++;
                continue; // Already deleted elsewhere
            }
            const feed = feedList[0];

            // Update job progress
            await base44.asServiceRole.entities.RepairJob.update(job_id, {
                current_feed_id: feedId,
                current_feed_name: feed.name,
                processed_count: processed,
                last_heartbeat_at: new Date().toISOString(),
            });

            let logEntry = {
                job_id,
                feed_id: feedId,
                feed_name: feed.name,
                original_url: feed.url,
            };

            try {
                const result = await attemptRepair(feed);

                if (result.success) {
                    // Update feed to use repaired URL
                    await base44.asServiceRole.entities.Feed.update(feedId, {
                        url: result.feedUrl,
                        status: 'active',
                        fetch_error: null,
                        consecutive_errors: 0,
                        last_fetched: new Date().toISOString(),
                    });
                    repaired++;
                    logEntry = {
                        ...logEntry,
                        action: 'repaired',
                        message: `SUCCESS: Converted to ${result.method} — ${result.validation?.item_count || 0} items`,
                        new_url: result.feedUrl,
                        repair_method: result.method,
                        failure_category: 'none',
                        diagnostics: result.diag,
                    };
                    console.log(`✓ Repaired: ${feed.name} → ${result.feedUrl}`);
                } else {
                    // Quarantine instead of delete (safe policy)
                    await base44.asServiceRole.entities.Feed.update(feedId, {
                        status: 'error',
                        fetch_error: `[QUARANTINED] ${result.diag.failure_reason || 'No repair path found'}`,
                        consecutive_errors: (feed.consecutive_errors || 0) + 1,
                    });
                    quarantined++;
                    const cat = result.diag.failure_category || 'unexpected_error';
                    categoryTally[cat] = (categoryTally[cat] || 0) + 1;

                    logEntry = {
                        ...logEntry,
                        action: 'quarantined',
                        message: `QUARANTINED: ${result.diag.failure_reason || 'No repair path found'}`,
                        failure_category: cat,
                        diagnostics: result.diag,
                    };
                    console.log(`⚠ Quarantined: ${feed.name} — ${result.diag.failure_reason}`);
                }

            } catch (e) {
                failed++;
                const cat = 'unexpected_error';
                categoryTally[cat] = (categoryTally[cat] || 0) + 1;
                logEntry = {
                    ...logEntry,
                    action: 'failed',
                    message: `FAILED: Unexpected error — ${e.message}`,
                    failure_category: cat,
                    diagnostics: { error: e.message },
                };
                console.error(`✗ Error on ${feed.name}: ${e.message}`);
            }

            // Write log entry
            await base44.asServiceRole.entities.RepairJobLog.create(logEntry);

            processed++;

            // Heartbeat update
            await base44.asServiceRole.entities.RepairJob.update(job_id, {
                processed_count: processed,
                repaired_count: repaired,
                quarantined_count: quarantined,
                failed_count: failed,
                last_heartbeat_at: new Date().toISOString(),
            });

            // Brief delay between feeds
            await new Promise(r => setTimeout(r, 400));
        }

        // Build final summary
        const summary = {
            total: feedIds.length,
            repaired,
            quarantined,
            failed,
            duration_seconds: Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000),
            failure_by_category: categoryTally,
        };

        await base44.asServiceRole.entities.RepairJob.update(job_id, {
            status: 'completed',
            processed_count: processed,
            repaired_count: repaired,
            quarantined_count: quarantined,
            failed_count: failed,
            current_feed_id: null,
            current_feed_name: null,
            completed_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString(),
            summary,
        });

        console.log(`Job ${job_id} completed: repaired=${repaired}, quarantined=${quarantined}, failed=${failed}`);
        return Response.json({ message: 'Job completed', summary });

    } catch (err) {
        console.error('Worker fatal error:', err.message);
        // Try to mark job as failed
        try {
            const base44 = createClientFromRequest(req);
            const body = await req.json().catch(() => ({}));
            if (body.job_id) {
                await base44.asServiceRole.entities.RepairJob.update(body.job_id, {
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    summary: { error: err.message }
                });
            }
        } catch {}
        return Response.json({ error: err.message }, { status: 500 });
    }
});