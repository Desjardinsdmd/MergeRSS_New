import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all feeds
    const feeds = await base44.asServiceRole.entities.Feed.list(undefined, 1000);
    console.log(`[SourceHealth] Evaluating ${feeds.length} feeds`);

    const results = [];

    for (const feed of feeds) {
      const health = await evaluateFeedHealth(base44, feed);
      
      // Upsert health record
      const existingHealth = await base44.asServiceRole.entities.SourceHealth.filter(
        { feed_id: feed.id },
        '-created_date',
        1
      );

      if (existingHealth.length > 0) {
        await base44.asServiceRole.entities.SourceHealth.update(existingHealth[0].id, health);
      } else {
        await base44.asServiceRole.entities.SourceHealth.create(health);
      }

      results.push({
        feed_id: feed.id,
        feed_name: feed.name,
        health_score: health.health_score,
        health_state: health.health_state,
        issues: health.issues
      });
    }

    // Log summary
    const healthy = results.filter(r => r.health_state === 'healthy').length;
    const degrading = results.filter(r => r.health_state === 'degrading').length;
    const failing = results.filter(r => r.health_state === 'failing').length;

    console.log(`[SourceHealth] Summary: ${healthy} healthy, ${degrading} degrading, ${failing} failing`);

    return Response.json({
      status: 'completed',
      evaluated_count: results.length,
      summary: { healthy, degrading, failing },
      results
    });
  } catch (error) {
    console.error('[SourceHealth] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function evaluateFeedHealth(base44, feed) {
  const now = new Date();
  const issues = [];
  const scoreBreakdown = {};

  // Fetch all items for this feed in past 30 days
  const recentItems = await base44.asServiceRole.entities.FeedItem.filter(
    { feed_id: feed.id },
    '-published_date',
    500
  );

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const items30d = recentItems.filter(item => 
    item.published_date && new Date(item.published_date) > thirtyDaysAgo
  );

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const items7d = items30d.filter(item => 
    item.published_date && new Date(item.published_date) > sevenDaysAgo
  );

  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const items24h = items7d.filter(item => 
    item.published_date && new Date(item.published_date) > oneDayAgo
  );

  // 1. FETCH RELIABILITY (20% weight)
  const successRate = feed.last_successful_fetch_at ? 95 - ((feed.consecutive_errors || 0) * 10) : 70;
  const fetchReliability = Math.max(0, Math.min(100, successRate));
  scoreBreakdown.fetch_reliability = fetchReliability;

  if (feed.status === 'error' || (feed.consecutive_errors || 0) > 3) {
    issues.push({
      type: 'high_failure_rate',
      severity: feed.consecutive_errors > 5 ? 'critical' : 'warning',
      message: `${feed.consecutive_errors || 0} consecutive fetch errors`,
      detected_at: new Date().toISOString()
    });
  }

  // 2. FRESHNESS (25% weight)
  let freshnessScore = 0;
  const lastArticleTime = recentItems[0]?.published_date ? new Date(recentItems[0].published_date) : feed.last_fetched ? new Date(feed.last_fetched) : new Date(feed.created_date);
  const daysSinceLastArticle = Math.floor((now - lastArticleTime) / (24 * 60 * 60 * 1000));
  const inactivityDays = daysSinceLastArticle;

  if (daysSinceLastArticle <= 1) freshnessScore = 100;
  else if (daysSinceLastArticle <= 3) freshnessScore = 80;
  else if (daysSinceLastArticle <= 7) freshnessScore = 50;
  else if (daysSinceLastArticle <= 14) freshnessScore = 30;
  else freshnessScore = Math.max(0, 50 - (daysSinceLastArticle - 7));

  scoreBreakdown.freshness_score = freshnessScore;

  if (daysSinceLastArticle > 5) {
    issues.push({
      type: 'no_articles',
      severity: daysSinceLastArticle > 14 ? 'critical' : 'warning',
      message: `No new articles in ${daysSinceLastArticle} days`,
      detected_at: new Date().toISOString()
    });
  }

  // 3. ACTIVITY LEVEL (20% weight)
  let activityScore = 0;
  const avg7d = items7d.length / 7;
  const avg30d = items30d.length / 30;

  // Expected cadence heuristic: assume 1-2 articles per day is healthy
  if (avg7d >= 1.5) activityScore = 100;
  else if (avg7d >= 1) activityScore = 85;
  else if (avg7d >= 0.5) activityScore = 60;
  else if (avg7d > 0) activityScore = 40;
  else activityScore = 10;

  scoreBreakdown.activity_score = activityScore;

  // Detect activity drop
  if (avg30d > 0.5 && avg7d < avg30d * 0.5) {
    issues.push({
      type: 'activity_drop',
      severity: 'warning',
      message: `Activity dropped from ${avg30d.toFixed(1)} to ${avg7d.toFixed(1)} articles/day`,
      detected_at: new Date().toISOString()
    });
  }

  // 4. PARSING QUALITY (15% weight)
  let parsingQuality = 100;
  const missingData = recentItems.filter(item => !item.title || !item.url || !item.published_date).length;
  if (recentItems.length > 0) {
    const completenessRatio = (recentItems.length - missingData) / recentItems.length;
    parsingQuality = Math.round(completenessRatio * 100);
  }
  scoreBreakdown.parsing_quality = parsingQuality;

  if (parsingQuality < 70 && recentItems.length > 10) {
    issues.push({
      type: 'parsing_error',
      severity: 'warning',
      message: `Parsing quality at ${parsingQuality}% - ${missingData} incomplete items`,
      detected_at: new Date().toISOString()
    });
  }

  // 5. STABILITY (10% weight)
  // For now, assign stable score if feed is generating valid content
  let stabilityScore = feed.source_type === 'generated' ? 85 : 95;
  if (feed.fetch_error) stabilityScore -= 20;
  scoreBreakdown.stability_score = Math.min(100, stabilityScore);

  // 6. EMPTY FEED DETECTION
  if (recentItems.length === 0 && daysSinceLastArticle > 14) {
    issues.push({
      type: 'empty_feed',
      severity: 'critical',
      message: 'No articles found in 14+ days',
      detected_at: new Date().toISOString()
    });
  }

  if (items24h === undefined) items24h = 0;

  // Calculate weighted health score
  const healthScore = Math.round(
    (fetchReliability * 0.20) +
    (freshnessScore * 0.25) +
    (activityScore * 0.20) +
    (parsingQuality * 0.15) +
    (scoreBreakdown.stability_score * 0.10) +
    (Math.min(100, (recentItems.length > 0 ? 100 : 20)) * 0.10) // Content volume
  );

  // Determine health state
  let healthState = 'healthy';
  if (healthScore < 50) healthState = 'failing';
  else if (healthScore < 80) healthState = 'degrading';

  // Add inactive flag if stale for 30+ days
  if (daysSinceLastArticle > 30) {
    issues.unshift({
      type: 'inactive',
      severity: 'info',
      message: `Source inactive for ${daysSinceLastArticle} days`,
      detected_at: new Date().toISOString()
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
    articles_last_24h: items24h?.length || 0,
    articles_last_7d: items7d.length,
    avg_articles_per_day: items30d.length / 30,
    last_article_timestamp: recentItems[0]?.published_date || null,
    inactivity_duration_days: inactivityDays,
    failure_rate: Math.min(100, ((feed.consecutive_errors || 0) / 10) * 100),
    success_rate: Math.max(0, 100 - (((feed.consecutive_errors || 0) / 10) * 100)),
    issues: issues,
    evaluated_at: new Date().toISOString(),
    score_breakdown: scoreBreakdown
  };
}