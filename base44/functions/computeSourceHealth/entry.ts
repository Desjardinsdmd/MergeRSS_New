/**
 * computeSourceHealth — evaluates per-feed health metrics.
 *
 * Architecture patterns enforced (see functions/lib.js):
 *   [1] extractItems / safeFilter / safeList — safe array extraction
 *   [2] requireAdminOrScheduler — consistent auth
 *   [3] Bulk load + in-memory grouping — eliminates N+1 query pattern
 *   [4] safeSequentialWrite pattern — batched writes with delay
 *   [5] Pipeline health classification
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ── Shared utilities (inlined — see functions/lib.js) ─────────────────────────

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

async function safeFilter(entity, query, sort, limit = 500) {
    return extractItems(await entity.filter(query, sort, limit));
}

async function safeList(entity, sort, limit = 1000) {
    return extractItems(await entity.list(sort, limit));
}

async function requireAdminOrScheduler(base44) {
    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
        }
        return { user: user || null };
    } catch {
        return { user: null };
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { error: authError } = await requireAdminOrScheduler(base44);
        if (authError) return authError;

        // ── Load all feeds ────────────────────────────────────────────────────
        const feeds = await safeList(base44.asServiceRole.entities.Feed, undefined, 1000);
        console.log(`[SourceHealth] Evaluating ${feeds.length} feeds`);

        if (feeds.length === 0) {
            return Response.json({ status: 'completed', evaluated_count: 0, pipeline_health: 'degraded', message: 'No feeds found' });
        }

        // ── CRITICAL: Bulk load ALL recent items in ONE query ─────────────────
        // This replaces the prior N+1 pattern (1 query per feed × 174 feeds = 429 errors)
        // We load items from the last 30 days once, then group by feed_id in memory.
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const allItems = await safeFilter(
            base44.asServiceRole.entities.FeedItem,
            { published_date: { $gte: thirtyDaysAgo } },
            '-published_date',
            5000  // generous cap — avoids envelope response while covering most feeds
        );
        console.log(`[SourceHealth] Bulk loaded ${allItems.length} items for batch evaluation`);

        // Group items by feed_id in memory
        const itemsByFeed = {};
        for (const item of allItems) {
            if (!item.feed_id) continue;
            if (!itemsByFeed[item.feed_id]) itemsByFeed[item.feed_id] = [];
            itemsByFeed[item.feed_id].push(item);
        }

        // ── Load existing health records for upsert ───────────────────────────
        const existingHealthRecords = await safeFilter(
            base44.asServiceRole.entities.SourceHealth,
            {}, '-created_date', 1000
        );
        const healthByFeedId = {};
        for (const rec of existingHealthRecords) {
            healthByFeedId[rec.feed_id] = rec;
        }

        // ── Evaluate all feeds using in-memory data ───────────────────────────
        const results = [];
        let writeErrors = 0;

        for (let i = 0; i < feeds.length; i++) {
            const feed = feeds[i];
            const feedItems = itemsByFeed[feed.id] || [];
            const health = evaluateFeedHealth(feed, feedItems);

            try {
                const existing = healthByFeedId[feed.id];
                if (existing) {
                    await base44.asServiceRole.entities.SourceHealth.update(existing.id, health);
                } else {
                    await base44.asServiceRole.entities.SourceHealth.create(health);
                }
            } catch (e) {
                writeErrors++;
                console.warn(`[SourceHealth] Write failed for feed ${feed.id}: ${e.message}`);
            }

            results.push({
                feed_id: feed.id,
                feed_name: feed.name,
                health_score: health.health_score,
                health_state: health.health_state,
            });

            // Write delay — every 10 feeds, pause briefly to avoid rate limits
            if (i % 10 === 9) await sleep(200);
        }

        const healthy  = results.filter(r => r.health_state === 'healthy').length;
        const degrading = results.filter(r => r.health_state === 'degrading').length;
        const failing  = results.filter(r => r.health_state === 'failing').length;

        console.log(`[SourceHealth] Summary: ${healthy} healthy, ${degrading} degrading, ${failing} failing`);

        return Response.json({
            status: 'completed',
            evaluated_count: results.length,
            pipeline_health: results.length > 0 ? 'healthy' : 'degraded',
            summary: { healthy, degrading, failing },
            write_errors: writeErrors,
        });

    } catch (error) {
        console.error('[SourceHealth] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// ── Feed health evaluation (pure function — no DB calls) ──────────────────────
// All data comes from the bulk-loaded itemsByFeed map passed in.
function evaluateFeedHealth(feed, recentItems) {
    const now = new Date();
    const issues = [];
    const scoreBreakdown = {};

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);
    const oneDayAgo     = new Date(now.getTime() -      24 * 60 * 60 * 1000);

    const items30d = recentItems.filter(item => item.published_date && new Date(item.published_date) > thirtyDaysAgo);
    const items7d  = items30d.filter(item => item.published_date && new Date(item.published_date) > sevenDaysAgo);
    const items24h = items7d.filter(item => item.published_date && new Date(item.published_date) > oneDayAgo);

    // 1. Fetch reliability (20%)
    const successRate = feed.last_successful_fetch_at ? 95 - ((feed.consecutive_errors || 0) * 10) : 70;
    const fetchReliability = Math.max(0, Math.min(100, successRate));
    scoreBreakdown.fetch_reliability = fetchReliability;

    if (feed.status === 'error' || (feed.consecutive_errors || 0) > 3) {
        issues.push({
            type: 'high_failure_rate',
            severity: feed.consecutive_errors > 5 ? 'critical' : 'warning',
            message: `${feed.consecutive_errors || 0} consecutive fetch errors`,
            detected_at: now.toISOString(),
        });
    }

    // 2. Freshness (25%)
    const lastArticleTime = recentItems[0]?.published_date
        ? new Date(recentItems[0].published_date)
        : feed.last_fetched ? new Date(feed.last_fetched) : new Date(feed.created_date);
    const daysSinceLastArticle = Math.floor((now - lastArticleTime) / (24 * 60 * 60 * 1000));
    let freshnessScore = 0;
    if (daysSinceLastArticle <= 1) freshnessScore = 100;
    else if (daysSinceLastArticle <= 3) freshnessScore = 80;
    else if (daysSinceLastArticle <= 7) freshnessScore = 50;
    else if (daysSinceLastArticle <= 14) freshnessScore = 30;
    else freshnessScore = Math.max(0, 50 - (daysSinceLastArticle - 7));
    scoreBreakdown.freshness_score = freshnessScore;

    if (daysSinceLastArticle > 5) {
        issues.push({
            type: 'no_articles', severity: daysSinceLastArticle > 14 ? 'critical' : 'warning',
            message: `No new articles in ${daysSinceLastArticle} days`,
            detected_at: now.toISOString(),
        });
    }

    // 3. Activity (20%)
    const avg7d = items7d.length / 7;
    const avg30d = items30d.length / 30;
    let activityScore = 0;
    if (avg7d >= 1.5) activityScore = 100;
    else if (avg7d >= 1) activityScore = 85;
    else if (avg7d >= 0.5) activityScore = 60;
    else if (avg7d > 0) activityScore = 40;
    else activityScore = 10;
    scoreBreakdown.activity_score = activityScore;

    if (avg30d > 0.5 && avg7d < avg30d * 0.5) {
        issues.push({
            type: 'activity_drop', severity: 'warning',
            message: `Activity dropped from ${avg30d.toFixed(1)} to ${avg7d.toFixed(1)} articles/day`,
            detected_at: now.toISOString(),
        });
    }

    // 4. Parsing quality (15%)
    const missingData = recentItems.filter(item => !item.title || !item.url || !item.published_date).length;
    const parsingQuality = recentItems.length > 0
        ? Math.round(((recentItems.length - missingData) / recentItems.length) * 100)
        : 100;
    scoreBreakdown.parsing_quality = parsingQuality;

    if (parsingQuality < 70 && recentItems.length > 10) {
        issues.push({
            type: 'parsing_error', severity: 'warning',
            message: `Parsing quality at ${parsingQuality}% - ${missingData} incomplete items`,
            detected_at: now.toISOString(),
        });
    }

    // 5. Stability (10%)
    let stabilityScore = feed.source_type === 'generated' ? 85 : 95;
    if (feed.fetch_error) stabilityScore -= 20;
    scoreBreakdown.stability_score = Math.min(100, stabilityScore);

    // 6. Empty feed
    if (recentItems.length === 0 && daysSinceLastArticle > 14) {
        issues.push({
            type: 'empty_feed', severity: 'critical',
            message: 'No articles found in 14+ days',
            detected_at: now.toISOString(),
        });
    }

    const healthScore = Math.round(
        (fetchReliability * 0.20) +
        (freshnessScore   * 0.25) +
        (activityScore    * 0.20) +
        (parsingQuality   * 0.15) +
        (scoreBreakdown.stability_score * 0.10) +
        (Math.min(100, recentItems.length > 0 ? 100 : 20) * 0.10)
    );

    let healthState = 'healthy';
    if (healthScore < 50) healthState = 'failing';
    else if (healthScore < 80) healthState = 'degrading';

    if (daysSinceLastArticle > 30) {
        issues.unshift({
            type: 'inactive', severity: 'info',
            message: `Source inactive for ${daysSinceLastArticle} days`,
            detected_at: now.toISOString(),
        });
        healthState = 'failing';
    }

    return {
        feed_id: feed.id,
        health_score: healthScore,
        health_state: healthState,
        fetch_reliability: fetchReliability,
        freshness_score: freshnessScore,
        activity_score: activityScore,
        parsing_quality: parsingQuality,
        stability_score: scoreBreakdown.stability_score,
        articles_last_24h: items24h.length,
        articles_last_7d: items7d.length,
        avg_articles_per_day: items30d.length / 30,
        last_article_timestamp: recentItems[0]?.published_date || null,
        inactivity_duration_days: daysSinceLastArticle,
        failure_rate: Math.min(100, ((feed.consecutive_errors || 0) / 10) * 100),
        success_rate: Math.max(0, 100 - (((feed.consecutive_errors || 0) / 10) * 100)),
        issues,
        evaluated_at: now.toISOString(),
        score_breakdown: scoreBreakdown,
    };
}