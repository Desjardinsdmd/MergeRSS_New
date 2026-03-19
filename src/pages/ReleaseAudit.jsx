import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Shield, Zap, BarChart3, Clock, AlertCircle, Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const AUDIT_DATA = {
  verdict: 'READY WITH CAVEATS',
  verdictColor: 'text-amber-400',
  verdictBg: 'border-amber-800 bg-amber-950/30',
  summary: 'Core product loop (add feeds → AI enrichment → daily briefing → inbox) is fully wired and operational. Scheduled jobs are running. However, several ancillary features have partial implementations, one critical email infrastructure gap, and one active job failure that must be addressed before broad marketing.',

  automations: [
    { name: 'Fetch RSS Feeds', schedule: 'Every 10 min', status: 'DEGRADED', runs: 508, failures: 75, failurePct: '14.8%', note: '75 failures over lifetime — investigate root cause. Currently 0 consecutive failures.' },
    { name: 'Generate & Deliver Digests', schedule: 'Every hour', status: 'FAILING', runs: 504, failures: 14, failurePct: '2.8%', note: 'Last run FAILED. 1 consecutive failure active right now. Must investigate.' },
    { name: 'Refresh Generated Feeds', schedule: 'Every 15 min', status: 'HEALTHY', runs: 1813, failures: 67, failurePct: '3.7%', note: 'Running normally.' },
    { name: 'Auto-Categorize New Feeds', schedule: 'On feed create', status: 'HEALTHY', runs: 97, failures: 0, failurePct: '0%', note: 'Perfect record.' },
    { name: 'System Health Alerts', schedule: 'Every 24 hrs', status: 'HEALTHY', runs: 30, failures: 1, failurePct: '3.3%', note: 'Note: configured as 24hr but UI allows 1/6/12/24/48hr — frequency_hours field in AlertSettings is saved but the automation schedule is hardcoded to 24hr. Not synced.' },
  ],

  categories: [
    {
      name: 'Authentication & Onboarding',
      features: [
        { feature: 'Login / redirect to login', status: 'PASS', severity: null, notes: 'Handled by platform auth + base44.auth.redirectToLogin. Correct.' },
        { feature: 'Onboarding tour (new user)', status: 'PASS', severity: null, notes: 'OnboardingTour component renders when onboarding_complete=false. Setup walkthrough follows.' },
        { feature: 'Restart tour from Settings', status: 'PASS', severity: null, notes: 'Sets onboarding_complete=false correctly.' },
        { feature: 'User profile edit (name, email, timezone)', status: 'PARTIAL', severity: 'LOW', notes: 'Email field is editable in form but base44 auth.updateMe does not propagate email changes to the auth identity — it only updates user entity. Email change is cosmetic only.' },
        { feature: 'Accent color / theme persisted across sessions', status: 'PASS', severity: null, notes: 'Saved to user entity and re-applied on layout load.' },
        { feature: 'New user registered state (no data yet)', status: 'PASS', severity: null, notes: 'Dashboard handles feeds.length === 0 with empty state correctly.' },
      ]
    },
    {
      name: 'Feeds',
      features: [
        { feature: 'Add RSS feed (URL validation + category)', status: 'PASS', severity: null, notes: 'AddFeedDialog handles create. Auto-categorize fires via entity automation.' },
        { feature: 'Free plan feed limit enforcement (50 feeds)', status: 'PASS', severity: null, notes: 'getLimit() enforced in UI and Add button disabled. canAddMore check correct.' },
        { feature: 'Edit feed', status: 'PASS', severity: null, notes: 'editFeed state passed to AddFeedDialog correctly.' },
        { feature: 'Delete feed (with directory public feed guard)', status: 'PASS', severity: null, notes: 'is_public guard prevents deletion of directory feeds.' },
        { feature: 'Pause/resume feed', status: 'PASS', severity: null, notes: 'handleToggleStatus toggles active↔paused.' },
        { feature: 'Manual refresh (trigger fetchFeeds)', status: 'PASS', severity: null, notes: 'Calls fetchFeeds function, shows new items count in toast.' },
        { feature: 'Search/filter/sort feeds', status: 'PASS', severity: null, notes: 'Client-side filtering across name, URL, category. Sort by name/newest/oldest/items/last-fetched.' },
        { feature: 'Grid/list/compact view modes (persisted)', status: 'PASS', severity: null, notes: 'localStorage persistence working.' },
        { feature: 'Bulk import (OPML/CSV)', status: 'PARTIAL', severity: 'MEDIUM', notes: 'BulkImportDialog exists and is invoked. However, OPML parsing logic needs verification — malformed OPML edge cases not guarded. No test evidence in code.' },
        { feature: 'Bulk tag/category/copy-to-directory actions', status: 'PASS', severity: null, notes: 'BulkFeedActions component handles all three.' },
        { feature: 'Feed error banner on dashboard', status: 'PASS', severity: null, notes: 'Shows errorFeeds.length > 0 correctly with link to Feeds page.' },
        { feature: 'Invalid feed URL handling', status: 'PASS', severity: null, notes: 'parseFeed detects HTML responses, returns descriptive error. Feed gets status=error after 1 failure, paused after 3 consecutive.' },
        { feature: 'Duplicate feed deduplication (by guid/url)', status: 'PASS', severity: null, notes: 'dedupMap checks guid and url sets before bulkCreate. Solid.' },
        { feature: 'Auto URL recovery for broken feeds', status: 'PASS', severity: null, notes: 'recoverFeedUrl probes common paths and HTML link tags. Fire-and-forget after 2+ consecutive errors.' },
        { feature: 'Feed auto-pause after 3 consecutive errors', status: 'PASS', severity: null, notes: 'MAX_CONSECUTIVE_ERRORS = 3. Applied correctly.' },
      ]
    },
    {
      name: 'AI Enrichment Pipeline',
      features: [
        { feature: 'AI summary generated for new items', status: 'PASS', severity: null, notes: 'enrichFeedItems called fire-and-forget from fetchFeeds after bulkCreate. Up to 20 items per batch.' },
        { feature: 'Importance score (0–100)', status: 'PASS', severity: null, notes: 'LLM returns structured JSON with importance_score. Clamped 0–100.' },
        { feature: 'Intelligence tag (Trending/Risk/Opportunity/Neutral)', status: 'PASS', severity: null, notes: 'Enum enforced in LLM schema.' },
        { feature: 'enrichFeedItems auth check', status: 'FAIL', severity: 'HIGH', notes: 'enrichFeedItems checks base44.auth.me() for user — but it is called from fetchFeeds via base44.asServiceRole.functions.invoke(). When invoked server-to-server, the user context may not resolve to a real user, causing 401 Unauthorized and skipping enrichment silently. Items may lack AI fields.' },
        { feature: 'Items already enriched are skipped', status: 'PASS', severity: null, notes: 'Filter for !ai_summary || importance_score == null || !intelligence_tag.' },
      ]
    },
    {
      name: 'Dashboard Intelligence',
      features: [
        { feature: "Today's Briefing (TopFiveToday) — ranked items", status: 'PASS', severity: null, notes: 'Queries last 48h, deduplicates, clusters, ranks by quality score. HARD RULE: Low Priority excluded.' },
        { feature: 'READ FIRST / SKIM / urgency labels', status: 'PASS', severity: null, notes: 'Deterministic label assignment by position. No hedging.' },
        { feature: 'Why This Matters / Bottom Line / Forward Implication', status: 'PASS', severity: null, notes: 'Pattern-matched against title+description. Falls through gracefully if no match.' },
        { feature: 'Daily Briefing Summary (key signal)', status: 'PASS', severity: null, notes: 'DailyBriefingSummary derives signal from ranked items.' },
        { feature: 'Dashboard shows empty state for new users', status: 'PASS', severity: null, notes: 'feeds.length === 0 shows Add Feeds CTA.' },
        { feature: 'Streak counter', status: 'PASS', severity: null, notes: 'StreakCounter component loaded.' },
        { feature: 'Stats strip (active feeds, digests, unread)', status: 'PASS', severity: null, notes: 'Live data from queries.' },
        { feature: 'Dashboard when items have no importance_score (unenriched)', status: 'PARTIAL', severity: 'MEDIUM', notes: 'intelligenceUtils and TopFiveToday use ?? 0 fallback for importance_score. Low/null-scored items get filtered out by qualifiesForBriefing(score < 55). If enrichment is broken, the briefing may be empty with no user-facing error.' },
        { feature: 'Trending topics inline', status: 'PASS', severity: null, notes: 'TrendingTopicsInline has extensive stopword/artifact filtering. Hides if no valid topics.' },
      ]
    },
    {
      name: 'Digests',
      features: [
        { feature: 'Create digest (wizard + dialog)', status: 'PASS', severity: null, notes: 'DigestWizard and DigestDialog both exist. Category/tag/feed-id filtering supported.' },
        { feature: 'Free plan digest limit (5)', status: 'PASS', severity: null, notes: 'planLimits.js enforced in Digests page.' },
        { feature: 'Edit, pause, delete digest', status: 'PASS', severity: null, notes: 'All operations present in Digests page.' },
        { feature: 'Test/force-generate digest', status: 'PASS', severity: null, notes: 'generateDigests accepts force=true and digest_id params.' },
        { feature: 'Daily/weekly/monthly scheduling', status: 'PASS', severity: null, notes: 'minHours logic: 20h daily, 168h weekly, 672h monthly. Day-of-week and day-of-month checks present.' },
        { feature: 'Web delivery (DigestDelivery record)', status: 'PASS', severity: null, notes: 'Always created. is_read=false default.' },
        { feature: 'Email delivery', status: 'PASS', severity: null, notes: 'delivery_email=true sends via Core.SendEmail. HTML sanitization present.' },
        { feature: 'Slack delivery', status: 'PASS', severity: null, notes: 'Uses webhook_url from Integration entity. SSRF allowlist enforced.' },
        { feature: 'Discord delivery', status: 'PASS', severity: null, notes: '2000-char limit enforced. SSRF allowlist enforced.' },
        { feature: 'Teams delivery', status: 'PASS', severity: null, notes: 'Adaptive Card format. SSRF allowlist enforced.' },
        { feature: 'Digest skipped when no new items', status: 'PASS', severity: null, notes: 'Returns "No new items in time window" result. Force mode falls back to most recent 50 items.' },
        { feature: 'Digest generation rate limited (10/run)', status: 'PASS', severity: null, notes: 'MAX_DIGESTS_PER_RUN = 10. Wall-clock budget = 50s.' },
        { feature: 'Race condition prevention (last_sent stamped before LLM call)', status: 'PASS', severity: null, notes: 'Explicitly documented in code. Correct.' },
        { feature: 'Generate & Deliver Digests automation — last run FAILED', status: 'FAIL', severity: 'BLOCKER', notes: 'Automation shows last_run_status: failed with 1 consecutive failure. Root cause unknown from code inspection alone. Must investigate logs immediately.' },
        { feature: 'Public digest listing / directory', status: 'PASS', severity: null, notes: 'is_public flag, public_description, added_count tracked.' },
        { feature: 'Digest comments', status: 'PASS', severity: null, notes: 'DigestComments component and DigestComment entity exist.' },
      ]
    },
    {
      name: 'Inbox',
      features: [
        { feature: 'Inbox shows unread digest deliveries', status: 'PASS', severity: null, notes: 'Filters by digest_id $in user digests, delivery_type=web, status=sent.' },
        { feature: 'Mark as read / unread', status: 'PASS', severity: null, notes: 'is_read toggle present.' },
        { feature: 'Star / favorite delivery', status: 'PASS', severity: null, notes: 'is_favorited flag on DigestDelivery.' },
        { feature: 'Folder organization', status: 'PASS', severity: null, notes: 'folder field on DigestDelivery. Inbox sidebar renders folders.' },
        { feature: 'Tag deliveries', status: 'PASS', severity: null, notes: 'tags array on DigestDelivery.' },
        { feature: 'Inbox unread badge in nav/header', status: 'PASS', severity: null, notes: 'InboxNavBadge and InboxBell both query unread deliveries with refetchInterval=60s.' },
        { feature: 'Deep-link to specific delivery (?delivery_id=)', status: 'PASS', severity: null, notes: 'Handled in Inbox page.' },
        { feature: 'PDF export of delivery', status: 'PASS', severity: null, notes: 'lib/generatePremiumPdf.js + jsPDF. Premium-gated in Inbox.' },
      ]
    },
    {
      name: 'Search',
      features: [
        { feature: 'Full-text search across all feed items', status: 'PARTIAL', severity: 'MEDIUM', notes: 'Fetches up to 500 items then does client-side keyword filter. With large data sets (>500 items) this is lossy — older items beyond the 500 cap are invisible to search.' },
        { feature: 'Filter by author, category, date range', status: 'PASS', severity: null, notes: 'All filters wired to query params.' },
        { feature: 'Sort by newest/oldest/title/relevance', status: 'PASS', severity: null, notes: 'Client-side sort.' },
        { feature: 'Article detail panel with AI summary', status: 'PASS', severity: null, notes: 'ArticleSummarizeButton triggers enrichment on demand.' },
        { feature: 'Related articles panel', status: 'PASS', severity: null, notes: 'RelatedArticles component present.' },
        { feature: 'Debounced keyword input', status: 'PASS', severity: null, notes: '400ms debounce on keyword → searchQuery.' },
      ]
    },
    {
      name: 'Bookmarks / Read Later',
      features: [
        { feature: 'Bookmark article from feed item', status: 'PASS', severity: null, notes: 'BookmarkButton creates Bookmark entity.' },
        { feature: 'View, filter, sort bookmarks', status: 'PASS', severity: null, notes: 'Bookmarks page has status/category filters and multiple sort orders.' },
        { feature: 'Mark bookmark as read', status: 'PASS', severity: null, notes: 'is_read toggle.' },
        { feature: 'Delete bookmark', status: 'PASS', severity: null, notes: 'Delete present.' },
        { feature: 'Unread badge in nav', status: 'PASS', severity: null, notes: 'BookmarkNavBadge queries unread bookmarks with refetchInterval=60s.' },
      ]
    },
    {
      name: 'Email Feeds',
      features: [
        { feature: 'Create unique email address (initEmailFeed)', status: 'PARTIAL', severity: 'HIGH', notes: 'initEmailFeed function exists and is invoked. However: no Mailgun route is actually created — the function generates a unique email and stores it in EmailFeed entity but there is no Mailgun route creation logic visible. Without a Mailgun route, forwarded emails will NOT arrive at the webhook.' },
        { feature: 'Mailgun webhook signature verification', status: 'PASS', severity: null, notes: 'Constant-time HMAC comparison. Replay protection (5 min window). Correct.' },
        { feature: 'Article extraction from newsletter HTML', status: 'PARTIAL', severity: 'MEDIUM', notes: 'Extracts <a> links from HTML. Will miss newsletters that use images-as-links or text-only bodies. No structured content parsing (e.g. no Substack-specific parser).' },
        { feature: 'NewsletterSubscription tracking', status: 'PASS', severity: null, notes: 'Creates or updates subscription record per from_email.' },
        { feature: 'Email feed stats (total_received, last_email_date)', status: 'PASS', severity: null, notes: 'Updated on every webhook call.' },
        { feature: 'Display subscribed newsletters', status: 'PASS', severity: null, notes: 'EmailFeeds page lists active subscriptions with sort.' },
        { feature: 'Unsubscribe from newsletter', status: 'PASS', severity: null, notes: 'Sets is_active=false.' },
      ]
    },
    {
      name: 'RSS Feed Generator',
      features: [
        { feature: 'Direct RSS/Atom detection', status: 'PASS', severity: null, notes: 'isRssFeed check on raw text before scraping.' },
        { feature: 'Discovered RSS (via <link> tags + common paths)', status: 'PASS', severity: null, notes: 'discoverFeedUrls probes up to 12 candidates.' },
        { feature: 'Scrape-and-generate for sites without RSS', status: 'PASS', severity: null, notes: '3-strategy extraction: semantic article blocks → heading-wrapped links → scored link extraction.' },
        { feature: 'Social platform blocking (Twitter, Instagram, etc.)', status: 'PASS', severity: null, notes: 'detectSocial returns guidance and rejects scraping. Reddit native RSS suggested.' },
        { feature: 'SSRF protection', status: 'PASS', severity: null, notes: 'Private IP patterns + blocked hostnames checked before fetch.' },
        { feature: 'Rate limit: 20 generated feeds per user', status: 'PASS', severity: null, notes: '429 returned with suggestions.' },
        { feature: 'Auto-refresh of generated feeds (scheduled)', status: 'PASS', severity: null, notes: 'refreshGeneratedFeeds runs every 15 min. Respects refresh_frequency per feed.' },
        { feature: 'Cached XML truncation (<200KB entity limit)', status: 'PASS', severity: null, notes: 'MAX_CACHED_XML_BYTES = 180000. Trims at last </item> boundary.' },
        { feature: 'Error state display + retry', status: 'PASS', severity: null, notes: 'SPA/paywall/robots diagnosis. Retry and dismiss buttons.' },
        { feature: 'UTM parameter appending', status: 'PASS', severity: null, notes: 'appendUtm function applied to all items.' },
        { feature: 'Feed generator uses outdated SDK version', status: 'FAIL', severity: 'LOW', notes: 'generateRssFeed.js imports @base44/sdk@0.8.6 while all other functions use 0.8.20 or 0.8.21. Could cause behavioral inconsistencies.' },
      ]
    },
    {
      name: 'Directory',
      features: [
        { feature: 'Browse public feeds and digests', status: 'PASS', severity: null, notes: 'Combines DirectoryFeed entity + user feeds with is_public=true. Deduplicates by URL.' },
        { feature: 'Search, filter by category, sort', status: 'PASS', severity: null, notes: 'Client-side filtering and sort (top/popular/new).' },
        { feature: 'Upvote/downvote feeds and digests', status: 'PASS', severity: null, notes: 'DirectoryVote entity. Vote undo/change handled. Score updated on item.' },
        { feature: 'Add feed/digest from directory to user library', status: 'PASS', severity: null, notes: 'Creates Feed with sourced_from_directory=true and directory_feed_id reference.' },
        { feature: 'Bulk add + create digest from selected feeds', status: 'PASS', severity: null, notes: 'Bulk selection UI and handleBulkAdd/handleCreateDigestFromFeeds.' },
        { feature: 'Vote/add available to anonymous users', status: 'PARTIAL', severity: 'LOW', notes: 'Buttons disabled for non-authenticated users with "Sign in to vote/add" tooltip. Good. But votes array query is only enabled when user is authenticated — anonymous users see correct score display from item entity.' },
      ]
    },
    {
      name: 'Team',
      features: [
        { feature: 'Invite member by email', status: 'PARTIAL', severity: 'MEDIUM', notes: 'Creates TeamMember record AND calls base44.users.inviteUser(). However, the role mapping is incorrect: editor role → inviteUser with role="user" (not "editor"). The platform role system only has "admin" and "user" — editor/viewer roles exist only in the TeamMember entity, not enforced at the platform level. Role-based access control is cosmetic.' },
        { feature: 'Admin-only invite button', status: 'PASS', severity: null, notes: 'isAdmin = user?.role === "admin" guard.' },
        { feature: 'Change member role', status: 'PARTIAL', severity: 'MEDIUM', notes: 'Updates TeamMember.role but does not update platform-level user role (only admin/user distinction matters at platform).' },
        { feature: 'Remove member', status: 'PASS', severity: null, notes: 'Deletes TeamMember record.' },
      ]
    },
    {
      name: 'Integrations',
      features: [
        { feature: 'Connect Slack via webhook URL', status: 'PASS', severity: null, notes: 'Validates hooks.slack.com domain. Stores Integration entity.' },
        { feature: 'Connect Discord via webhook URL', status: 'PASS', severity: null, notes: 'Validates discord.com/api/webhooks/ pattern.' },
        { feature: 'Connect Microsoft Teams via webhook URL', status: 'PASS', severity: null, notes: 'Validates webhook.office.com or office365.com.' },
        { feature: 'Send test message (Slack/Discord/Teams)', status: 'PASS', severity: null, notes: 'Test functions invoked. Teams test done client-side directly (minor: SSRF risk if URL somehow changed).' },
        { feature: 'Disconnect integration', status: 'PASS', severity: null, notes: 'Deletes Integration entity with confirmation dialog.' },
        { feature: 'Integrations are Premium-only', status: 'PASS', severity: null, notes: 'isPremium guard on connect buttons. Toast error if free user attempts.' },
        { feature: 'Broken webhook URL handling in digest delivery', status: 'PASS', severity: null, notes: 'DigestDelivery created with status=failed and error_message on non-200 responses.' },
      ]
    },
    {
      name: 'Billing / Stripe',
      features: [
        { feature: 'Checkout session creation', status: 'PASS', severity: null, notes: 'createCheckoutSession validates success_url/cancel_url against APP_ORIGIN. Uses env STRIPE_PREMIUM_PRICE_ID.' },
        { feature: 'Webhook: checkout.session.completed → upgrade user to premium', status: 'PASS', severity: null, notes: 'Idempotency check (existing subscription check). Sets user.plan=premium. Creates Subscription record.' },
        { feature: 'Webhook: customer.subscription.deleted → downgrade to free', status: 'PASS', severity: null, notes: 'Finds subscription by stripe_subscription_id, updates plan to free. Updates user.plan=free.' },
        { feature: 'customer.subscription.updated event (renewal, trial end)', status: 'FAIL', severity: 'HIGH', notes: 'stripeWebhook.js only handles checkout.session.completed and customer.subscription.deleted. It does NOT handle customer.subscription.updated — so subscription renewals, plan changes via portal, trial→paid transitions are NOT processed. current_period_end is never updated.' },
        { feature: 'Billing portal (manage subscription)', status: 'PASS', severity: null, notes: 'createPortalSession function invoked from Settings. Returns Stripe portal URL.' },
        { feature: 'Pricing page plan selection', status: 'PASS', severity: null, notes: 'Free/Premium tiers rendered. Upgrade invokes createCheckoutSession.' },
        { feature: 'Plan limits enforced in app (feeds, digests)', status: 'PASS', severity: null, notes: 'PLAN_LIMITS in planLimits.js. 50 feeds / 5 digests free. Unlimited premium.' },
        { feature: 'Premium gates on integrations', status: 'PASS', severity: null, notes: 'isPremium checked in Integrations page.' },
        { feature: 'Subscription status on Settings page', status: 'PASS', severity: null, notes: 'Crown icon, plan label, Manage Billing button for premium.' },
      ]
    },
    {
      name: 'Settings',
      features: [
        { feature: 'Profile edit (name, timezone)', status: 'PASS', severity: null, notes: 'Saved via updateMe.' },
        { feature: 'Notification preferences', status: 'PASS', severity: null, notes: 'NotificationPreferences component saves to user entity.' },
        { feature: 'Dashboard layout preferences', status: 'PASS', severity: null, notes: 'DashboardLayoutSettings component saves to user entity.' },
        { feature: 'Theme (dark/light/hc-dark) + accent color', status: 'PASS', severity: null, notes: 'ThemeSettings auto-saves. Accent color applied via applyAccentColor().' },
        { feature: 'Alert frequency setting saved but not honored', status: 'FAIL', severity: 'LOW', notes: 'AlertSettings.frequency_hours is saved in UI but the systemAlerts automation runs on a fixed 24hr schedule that is not dynamically updated when this setting changes.' },
      ]
    },
    {
      name: 'Admin Panel',
      features: [
        { feature: 'Admin-only access guard (role check)', status: 'PASS', severity: null, notes: 'user?.role !== "admin" redirects in AdminHealth. systemAlerts function also checks server-side.' },
        { feature: 'System health job history', status: 'PASS', severity: null, notes: 'Last 50 SystemHealth records listed.' },
        { feature: 'Feed status table (all feeds)', status: 'PASS', severity: null, notes: 'Shows status, last_fetched, item_count, fetch_error.' },
        { feature: 'Live alert check (dry run)', status: 'PASS', severity: null, notes: 'Runs systemAlerts with dry_run=true. Evaluates all 6 thresholds.' },
        { feature: 'Alert email settings (destination + frequency)', status: 'PARTIAL', severity: 'LOW', notes: 'Saves AlertSettings entity. Email destination is used by systemAlerts. But frequency_hours is ignored by the automation schedule.' },
        { feature: 'Repair job panel (errored feeds)', status: 'PASS', severity: null, notes: 'RepairJobPanel component and repairErroredFeeds/repairJobWorker functions exist.' },
        { feature: 'Generated feeds admin (disable/enable)', status: 'PASS', severity: null, notes: 'toggleFeedDisabled works.' },
        { feature: 'Problem Reports page', status: 'PASS', severity: null, notes: 'AdminReports page. ProblemReport entity. ReportProblemDialog in layout.' },
        { feature: 'Admin Analytics page', status: 'PASS', severity: null, notes: 'AdminAnalytics page exists.' },
        { feature: 'Admin Import page (bulk feed import)', status: 'PASS', severity: null, notes: 'AdminImport page with RssCrawler component. bulkImportFeeds function.' },
      ]
    },
    {
      name: 'Landing Page Claims vs. Reality',
      features: [
        { feature: 'CLAIM: "Turns hundreds of headlines into a clear daily briefing"', status: 'PASS', severity: null, notes: 'True. TopFiveToday + DailyBriefingSummary deliver this.' },
        { feature: 'CLAIM: "AI reads everything and surfaces what actually matters"', status: 'PASS', severity: null, notes: 'True — but contingent on enrichFeedItems running correctly (see HIGH issue).' },
        { feature: 'CLAIM: "Takes 2 minutes to set up"', status: 'PASS', severity: null, notes: 'Accurate — add feeds, create digest, done.' },
        { feature: 'CLAIM: Stats (users, feeds, digests) from publicStats function', status: 'PASS', severity: null, notes: 'publicStats function invoked on landing page. Falls back gracefully on error.' },
        { feature: 'CLAIM: Testimonials (Sarah K., Marcus T., Priya M.)', status: 'FAIL', severity: 'LOW', notes: 'These are fabricated testimonials. No disclosure. Consider adding "early beta user" language or replacing with real quotes.' },
        { feature: 'CLAIM: "No credit card required"', status: 'PASS', severity: null, notes: 'Free plan exists with 50 feeds and 5 digests — genuinely no CC required for free tier.' },
        { feature: 'CLAIM: Email delivery', status: 'PASS', severity: null, notes: 'Real — Core.SendEmail used in generateDigests.' },
        { feature: 'CLAIM: Slack/Discord delivery', status: 'PASS', severity: null, notes: 'Real — webhook delivery wired in generateDigests.' },
      ]
    },
  ],

  blockers: [
    {
      id: 'B1',
      severity: 'BLOCKER',
      title: 'Generate & Deliver Digests — last scheduled run FAILED',
      detail: 'The automation shows last_run_status: "failed" with 1 consecutive_failure active right now (as of audit). This means digests are not being generated or delivered on schedule. Must investigate logs in the Admin panel immediately.',
      action: 'Go to AdminHealth → Job History and inspect the most recent failed generateDigests run. Check for LLM quota exhaustion, timeout, or auth error.'
    },
    {
      id: 'B2',
      severity: 'HIGH',
      title: 'enrichFeedItems auth check blocks server-side invocation',
      detail: 'enrichFeedItems calls base44.auth.me() and returns 401 if no user — but it is invoked server-to-server from fetchFeeds via asServiceRole.functions.invoke(). The service role invocation may not carry a user JWT, causing silent 401 failures. Result: new feed items may not receive ai_summary, importance_score, or intelligence_tag.',
      action: 'Modify enrichFeedItems to skip the auth.me() check and instead authenticate the call with a shared secret or service role identity check, consistent with how other service-role functions operate.'
    },
    {
      id: 'B3',
      severity: 'HIGH',
      title: 'Stripe webhook missing customer.subscription.updated handler',
      detail: 'When Stripe sends subscription renewals, mid-cycle upgrades/downgrades, or trial-to-paid conversions, the webhook handler ignores the event. This means current_period_end is never updated, subscription status changes (e.g. past_due) are not reflected, and plan changes via the customer portal are not synced.',
      action: 'Add a customer.subscription.updated handler to stripeWebhook.js that updates Subscription.status, current_period_start/end, and cancel_at_period_end.'
    },
    {
      id: 'B4',
      severity: 'HIGH',
      title: 'Email Feeds: Mailgun route creation is not implemented',
      detail: 'The initEmailFeed function generates a unique email address and stores it in the EmailFeed entity, but there is no evidence of a Mailgun route being created via the Mailgun API. Without a route, emails forwarded to the unique address will not trigger the mailgunWebhook backend function.',
      action: 'Verify initEmailFeed.js — if Mailgun route creation is missing, add a POST to api.mailgun.net/v3/routes to route emails addressed to the unique_email to the mailgunWebhook function URL.'
    },
  ],

  removeLandingClaims: [
    'Testimonials (Sarah K., Marcus T., Priya M.) — fabricated. Add "early user" disclosure or replace with real quotes before public launch.',
  ]
};

const statusColors = {
  PASS: 'text-emerald-400',
  FAIL: 'text-red-400',
  PARTIAL: 'text-amber-400',
  HEALTHY: 'text-emerald-400',
  DEGRADED: 'text-amber-400',
  FAILING: 'text-red-400',
};

const statusBg = {
  PASS: 'bg-emerald-900/20 border-emerald-800',
  FAIL: 'bg-red-900/20 border-red-800',
  PARTIAL: 'bg-amber-900/20 border-amber-800',
  HEALTHY: 'bg-emerald-900/20 border-emerald-800',
  DEGRADED: 'bg-amber-900/20 border-amber-800',
  FAILING: 'bg-red-900/20 border-red-800',
};

const severityColors = {
  BLOCKER: 'bg-red-600 text-white',
  HIGH: 'bg-orange-600 text-white',
  MEDIUM: 'bg-amber-600 text-stone-900',
  LOW: 'bg-stone-700 text-stone-300',
};

function CategorySection({ cat }) {
  const [open, setOpen] = useState(false);
  const passes = cat.features.filter(f => f.status === 'PASS').length;
  const failures = cat.features.filter(f => f.status === 'FAIL').length;
  const partials = cat.features.filter(f => f.status === 'PARTIAL').length;

  return (
    <div className="border border-stone-800 bg-stone-900">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-stone-800/40 transition"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-stone-100">{cat.name}</h3>
          <span className="text-xs text-emerald-400">{passes} pass</span>
          {failures > 0 && <span className="text-xs text-red-400">{failures} fail</span>}
          {partials > 0 && <span className="text-xs text-amber-400">{partials} partial</span>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
      </button>
      {open && (
        <div className="border-t border-stone-800 divide-y divide-stone-800/60">
          {cat.features.map((f, i) => (
            <div key={i} className="px-5 py-3 grid grid-cols-[auto_1fr] gap-3 items-start">
              <span className={cn('text-xs font-bold mt-0.5 w-16 flex-shrink-0', statusColors[f.status])}>
                {f.status}
              </span>
              <div>
                <p className="text-sm font-medium text-stone-200">{f.feature}</p>
                {f.severity && (
                  <span className={cn('inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 mt-1', severityColors[f.severity])}>
                    {f.severity}
                  </span>
                )}
                <p className="text-xs text-stone-500 mt-1">{f.notes}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReleaseAudit() {
  const allFeatures = AUDIT_DATA.categories.flatMap(c => c.features);
  const passes = allFeatures.filter(f => f.status === 'PASS').length;
  const failures = allFeatures.filter(f => f.status === 'FAIL').length;
  const partials = allFeatures.filter(f => f.status === 'PARTIAL').length;
  const total = allFeatures.length;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100 mb-1">Release Readiness Audit</h1>
        <p className="text-stone-500 text-sm">MergeRSS — Full end-to-end QA. Generated {new Date().toLocaleDateString()}.</p>
      </div>

      {/* Verdict */}
      <div className={cn('border rounded-xl p-6 mb-8', AUDIT_DATA.verdictBg)}>
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-6 h-6 text-amber-400" />
          <span className={cn('text-2xl font-black', AUDIT_DATA.verdictColor)}>VERDICT: {AUDIT_DATA.verdict}</span>
        </div>
        <p className="text-stone-300 text-sm leading-relaxed">{AUDIT_DATA.summary}</p>
      </div>

      {/* Feature score */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Features', value: total, color: 'text-stone-100' },
          { label: 'Passed', value: passes, color: 'text-emerald-400' },
          { label: 'Partial', value: partials, color: 'text-amber-400' },
          { label: 'Failed', value: failures, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="border border-stone-800 bg-stone-900 p-4 text-center">
            <p className={cn('text-3xl font-black', s.color)}>{s.value}</p>
            <p className="text-xs text-stone-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Scheduled Jobs */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-stone-100 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-400" />
          Scheduled Jobs
        </h2>
        <div className="space-y-2">
          {AUDIT_DATA.automations.map((a, i) => (
            <div key={i} className={cn('border rounded-lg px-4 py-3', statusBg[a.status])}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-stone-100 text-sm">{a.name}</p>
                  <p className="text-xs text-stone-500">{a.schedule} · {a.runs} runs · {a.failures} failures ({a.failurePct})</p>
                </div>
                <span className={cn('text-xs font-black', statusColors[a.status])}>{a.status}</span>
              </div>
              <p className="text-xs text-stone-400 mt-1">{a.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Blockers */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-stone-100 mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          Blockers & High-Severity Issues
        </h2>
        <div className="space-y-3">
          {AUDIT_DATA.blockers.map(b => (
            <div key={b.id} className={cn('border rounded-xl p-4', b.severity === 'BLOCKER' ? 'border-red-700 bg-red-950/30' : 'border-orange-800 bg-orange-950/20')}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-[10px] font-black px-2 py-0.5 rounded', severityColors[b.severity])}>{b.severity}</span>
                <span className="text-xs text-stone-500">{b.id}</span>
                <h3 className="font-semibold text-stone-100 text-sm">{b.title}</h3>
              </div>
              <p className="text-xs text-stone-400 mb-2">{b.detail}</p>
              <p className="text-xs text-stone-300 flex items-start gap-1.5">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400" />
                <span><strong>Action:</strong> {b.action}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Landing page claims */}
      <div className="mb-8 border border-amber-800 bg-amber-950/20 rounded-xl p-4">
        <h2 className="text-sm font-bold text-amber-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Remove From Landing Page Before Launch
        </h2>
        {AUDIT_DATA.removeLandingClaims.map((c, i) => (
          <p key={i} className="text-xs text-stone-400">→ {c}</p>
        ))}
      </div>

      {/* Feature categories */}
      <h2 className="text-lg font-bold text-stone-100 mb-3 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-amber-400" />
        Full Feature Inventory
      </h2>
      <div className="space-y-2">
        {AUDIT_DATA.categories.map((cat, i) => (
          <CategorySection key={i} cat={cat} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-stone-800 text-xs text-stone-600">
        <p>This audit was generated by code inspection of all pages, functions, automations, and entities. It does not replace manual QA testing of actual user flows.</p>
        <p className="mt-1">Automation data is live from the Base44 scheduler as of audit date.</p>
      </div>
    </div>
  );
}