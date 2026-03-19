# Feed Health Scoring System

## Overview

A non-invasive intelligence layer that evaluates, scores, and surfaces actionable insights about RSS feed health. This system runs on top of existing ingestion pipelines without modifying fetching or generation logic.

## Architecture

### 1. Health Scoring Engine (`computeSourceHealth.js`)

Runs daily (3 AM ET) and computes a weighted health score (0–100) for each source.

**Scoring Factors:**

| Factor | Weight | Evaluation |
|--------|--------|-----------|
| Fetch Reliability | 20% | Success/failure rate, consecutive errors |
| Freshness | 25% | Days since last article (0-1 days = 100%, 14+ days = 30%) |
| Activity Level | 20% | Articles per day consistency (1.5+ = healthy) |
| Parsing Quality | 15% | % of items with title, URL, date (>70% = healthy) |
| Stability | 10% | Structural consistency, generator confidence |
| Content Volume | 10% | Feed has articles available |

**Health States:**
- **Healthy (80-100):** Green badge, active monitoring
- **Degrading (50-79):** Yellow badge, attention suggested
- **Failing (0-49):** Red badge, immediate action recommended

### 2. Issue Detection

Automatically flags:
- No articles in 5+ days → **warning**
- No articles in 14+ days → **critical**
- High failure rate (>3 consecutive errors) → **critical**
- Parsing errors (>30% incomplete items) → **warning**
- Activity drop (50% decrease week-over-week) → **warning**
- Inactive >30 days → **info** (auto-demoted to failing)

### 3. SourceHealth Entity

Stores computed metrics:
```json
{
  "feed_id": "...",
  "health_score": 75,
  "health_state": "degrading",
  "articles_last_24h": 2,
  "articles_last_7d": 12,
  "avg_articles_per_day": 1.8,
  "inactivity_duration_days": 3,
  "failure_rate": 5,
  "success_rate": 95,
  "issues": [...],
  "evaluated_at": "2026-03-19T03:00:00Z"
}
```

## UI Integration

### Sources Page

1. **NeedsAttentionSummary**
   - Shows count of failing + degrading sources
   - One-click filter to "Needs Attention" view
   - Appears when issues exist

2. **FeedCard Enhancements**
   - Health badge (Healthy/Degrading/Failing) with score %
   - Activity metrics: "+X articles today" or "No updates in Y days"
   - Issue indicator (clickable for details)
   - "Health" action in menu → cleanup dialog

3. **SourceCleanupDialog**
   - Pause/Resume source
   - Reset error counter & retry
   - Delete source
   - No aggressive auto-deletion

### Admin Dashboard

- **SourceHealthDashboard widget**
  - Total sources, healthy/degrading/failing counts
  - Average health score with visual indicator
  - Total issues detected

## Automation

**Daily Source Health Evaluation** (Scheduled)
- Runs at 3 AM America/New_York
- Runs as admin-only function
- Computes all feeds, upserts SourceHealth records
- Logs summary: counts by state, any critical issues

## Performance

- **No impact on ingestion:** Runs in separate scheduled job
- **Cached metrics:** Stale for 5 minutes in UI queries
- **Incremental updates:** Each feed evaluation is independent
- **Safe read-heavy:** Uses read-only queries on FeedItem aggregate

## Data Flow

```
Daily Automation (3 AM)
  ↓
computeSourceHealth() [admin fn]
  ↓
Fetch all Feeds
  ↓
For each Feed:
  - Query last 30 days of FeedItems
  - Compute 6 health factors
  - Detect issues
  - Calculate weighted score
  ↓
Upsert SourceHealth record
  ↓
Return summary
```

## Frontend Queries

- `feed-health-{feed.id}` — Individual feed health (5 min stale)
- `all-source-health` — All sources (5 min stale)
- Feeds page invalidates on add/delete/edit

## Backward Compatibility

- All existing feeds continue to work
- SourceHealth records are created on-demand (no migration)
- Health badges appear when SourceHealth exists
- No breaking changes to Feed entity or ingestion

## Safety & Logging

- **No auto-deletion:** Only manual via cleanup dialog
- **Configurable pause:** Sources paused after 30+ days inactivity (flagged, not auto-paused)
- **Structured logging:** Each evaluation logged with score breakdown
- **Issue tracking:** All detected issues stored with type, severity, timestamp

## Integration Points

- **Feed entity:** No changes required (health is separate layer)
- **FeedItem entity:** Used only for statistical analysis
- **Scheduled automation:** Daily evaluation at 3 AM
- **UI components:** 
  - SourceHealthBadge
  - SourceActivityMetrics
  - SourceIssueIndicator
  - SourceCleanupDialog
  - NeedsAttentionSummary
  - SourceHealthDashboard (admin)

## Future Enhancements

- Trend analysis (health score over time)
- Auto-pause with manual resume
- Custom threshold configuration
- Duplicate detection across sources
- Article quality scoring
- Feed recommendation engine based on health patterns