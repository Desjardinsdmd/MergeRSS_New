/**
 * computeSourceHealth — evaluates health of all Feed records.
 *
 * KEY FIX: Load ALL FeedItems for the past 30 days in ONE query,
 * then group by feed_id in memory. This avoids 174 separate DB queries
 * which was causing 429 rate limit errors.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  try {
    let base44;
    try {
      base44 = createClientFromRequest(req);
    } catch {
      const { createClient } = await import('npm:@base44/sdk@0.8.21');
      base44 = createClient();
    }

    // Allow scheduler (no user) to proceed; block non-admin users
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    } catch { /* scheduled run — no user token */ }

    // ── 1. Load all feeds ────────────────────────────────────────────────────
    const rawFeeds = await base44.asServiceRole.entities.Feed.list(undefined, 1000);
    const feeds = Array.isArray(rawFeeds) ? rawFeeds : (rawFeeds?.items ?? rawFeeds?.data ?? []);
    console.log(`[SourceHealth] Evaluating ${feeds.length} feeds`);

    // ── 2. Load ALL recent FeedItems in ONE query (last 30 days) ─────────────
    // This is the critical fix: instead of one query per feed (174 queries → 429),
    // we fetch up to 5000 items at once and group them in memory.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rawItems = await base44.asServiceRole.entities.FeedItem.filter(
      { published_date: { $gte: thirtyDaysAgo } },
      '-published_date',
      5000
    );
    const allItems = Array.isArray(rawItems) ? rawItems : (rawItems?.items ?? rawItems?.data ?? []);
    console.log(`[SourceHealth] Loaded ${allItems.length} items for batch evaluation`);

    // Group items by feed_id
    const itemsByFeedId = {};
    for (const item of allItems) {
      if (!item.feed_id) continue;
      if (!itemsByFeedId[item.feed_id]) itemsByFeedId[item.feed_id] = [];
      itemsByFeedId[item.feed_id].push(item);
    }

    // ── 3. Load existing health records for upsert ───────────────────────────
    const rawHealth = await base44.asServiceRole.entities.SourceHealth.list('-created_date', 1000);
    const existingHealthRecords = Array.isArray(rawHealth) ? rawHealth : (rawHealth?.items ?? rawHealth?.data ?? []);
    const healthByFeedId = {};
    for (const h of existingHealthRecords) {
      healthByFeedId[h.feed_id] = h;
    }

    // ── 4. Evaluate each feed using in-memory item data ──────────────────────
    const results = [];
    let writeCount = 0;

    for (const feed of feeds) {
      const feedItems = itemsByFeedId[feed.id] || [];
      const health = evaluateFeedHealth(feed, feedItems);

      // Upsert with a small delay between writes to avoid rate-limiting
      const existing = healthByFeedId[feed.id];
      if (existing) {
        await base44.asServiceRole.entities.SourceHealth.update(existing.id, health).catch(() => {});
      } else {
        await base44.asServiceRole.entities.SourceHealth.create(health).catch(() => {});
      }

      writeCount++;
      // Small delay every 10 writes to stay within rate limits
      if (writeCount % 10 === 0) await sleep(500);

      results.push({
        feed_id: feed.id,
        feed_name: feed.name,
        health_score: health.health_score,
        health_state: health.health_state,
        issues: health.issues,
      });
    }

    const healthy  = results.filter(r => r.health_state === 'healthy').length;
    const degrading = results.filter(r => r.health_state === 'degrading').length;
    const failing  = results.filter(r => r.health_state === 'failing').length;
    console.log(`[SourceHealth] Summary: ${healthy} healthy, ${degrading} degrading, ${failing} failing`);

    return Response.json({
      status: 'completed',
      evaluated_count: results.length,
      summary: { healthy, degrading, failing },
      results,
    });
  } catch (error) {
    console.error('[SourceHealth] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Pure evaluation function (no DB calls) ────────────────────────────────────
function evaluateFeedHealth(feed, recentItems) {
  const now = new Date();
  const issues = [];
  const scoreBreakdown = {};

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const oneDayAgo     = new Date(now.getTime() - 1  * 24 * 60 * 60 * 1000);

  const items30d = recentItems.filter(i => i.published_date && new Date(i.published_date) > thirtyDaysAgo);
  const items7d  = items30d.filter(i => new Date(i.published_date) > sevenDaysAgo);
  const items24h = items7d.filter(i => new Date(i.published_date) > oneDayAgo);

  // 1. FETCH RELIABILITY (20%)
  const successRate = feed.last_successful_fetch_at ? 95 - ((feed.consecutive_errors || 0) * 10) : 70;
  const fetchReliability = Math.max(0, Math.min(100, successRate));
  scoreBreakdown.fetch_reliability = fetchReliability;

  if (feed.status === 'error' || (feed.consecutive_errors || 0) > 3) {
    issues.push({
      type: 'high_failure_rate',
      severity: (feed.consecutive_errors || 0) > 5 ? 'critical' : 'warning',
      message: `${feed.consecutive_errors || 0} consecutive fetch errors`,
      detected_at: now.toISOString(),
    });
  }

  // 2. FRESHNESS (25%)
  const lastArticleTime = recentItems[0]?.published_date
    ? new Date(recentItems[0].published_date)
    : feed.last_fetched ? new Date(feed.last_fetched) : new Date(feed.created_date);
  const daysSinceLastArticle = Math.floor((now - lastArticleTime) / (24 * 60 * 60 * 1000));
  let freshnessScore = 0;
  if      (daysSinceLastArticle <= 1)  freshnessScore = 100;
  else if (daysSinceLastArticle <= 3)  freshnessScore = 80;
  else if (daysSinceLastArticle <= 7)  freshnessScore = 50;
  else if (daysSinceLastArticle <= 14) freshnessScore = 30;
  else freshnessScore = Math.max(0, 50 - (daysSinceLastArticle - 7));
  scoreBreakdown.freshness_score = freshnessScore;

  if (daysSinceLastArticle > 5) {
    issues.push({
      type: 'no_articles',
      severity: daysSinceLastArticle > 14 ? 'critical' : 'warning',
      message: `No new articles in ${daysSinceLastArticle} days`,
      detected_at: now.toISOString(),
    });
  }

  // 3. ACTIVITY LEVEL (20%)
  const avg7d  = items7d.length / 7;
  const avg30d = items30d.length / 30;
  let activityScore = 10;
  if      (avg7d >= 1.5) activityScore = 100;
  else if (avg7d >= 1)   activityScore = 85;
  else if (avg7d >= 0.5) activityScore = 60;
  else if (avg7d > 0)    activityScore = 40;
  scoreBreakdown.activity_score = activityScore;

  if (avg30d > 0.5 && avg7d < avg30d * 0.5) {
    issues.push({
      type: 'activity_drop',
      severity: 'warning',
      message: `Activity dropped from ${avg30d.toFixed(1)} to ${avg7d.toFixed(1)} articles/day`,
      detected_at: now.toISOString(),
    });
  }

  // 4. PARSING QUALITY (15%)
  const missingData = recentItems.filter(i => !i.title || !i.url || !i.published_date).length;
  const parsingQuality = recentItems.length > 0
    ? Math.round(((recentItems.length - missingData) / recentItems.length) * 100)
    : 100;
  scoreBreakdown.parsing_quality = parsingQuality;

  if (parsingQuality < 70 && recentItems.length > 10) {
    issues.push({
      type: 'parsing_error',
      severity: 'warning',
      message: `Parsing quality at ${parsingQuality}% - ${missingData} incomplete items`,
      detected_at: now.toISOString(),
    });
  }

  // 5. STABILITY (10%)
  let stabilityScore = feed.source_type === 'generated' ? 85 : 95;
  if (feed.fetch_error) stabilityScore -= 20;
  scoreBreakdown.stability_score = Math.min(100, stabilityScore);

  // 6. EMPTY FEED
  if (recentItems.length === 0 && daysSinceLastArticle > 14) {
    issues.push({
      type: 'empty_feed',
      severity: 'critical',
      message: 'No articles found in 14+ days',
      detected_at: now.toISOString(),
    });
  }

  if (daysSinceLastArticle > 30) {
    issues.unshift({
      type: 'inactive',
      severity: 'info',
      message: `Source inactive for ${daysSinceLastArticle} days`,
      detected_at: now.toISOString(),
    });
  }

  const healthScore = Math.round(
    (fetchReliability               * 0.20) +
    (freshnessScore                 * 0.25) +
    (activityScore                  * 0.20) +
    (parsingQuality                 * 0.15) +
    (scoreBreakdown.stability_score * 0.10) +
    (Math.min(100, recentItems.length > 0 ? 100 : 20) * 0.10)
  );

  let healthState = 'healthy';
  if (healthScore < 50 || daysSinceLastArticle > 30) healthState = 'failing';
  else if (healthScore < 80) healthState = 'degrading';

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
    avg_articles_per_day: avg30d,
    last_article_timestamp: recentItems[0]?.published_date || null,
    inactivity_duration_days: daysSinceLastArticle,
    failure_rate: Math.min(100, ((feed.consecutive_errors || 0) / 10) * 100),
    success_rate: Math.max(0, 100 - (((feed.consecutive_errors || 0) / 10) * 100)),
    issues,
    evaluated_at: now.toISOString(),
    score_breakdown: scoreBreakdown,
  };
}