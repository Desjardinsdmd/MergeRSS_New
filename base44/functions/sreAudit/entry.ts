import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * SRE Audit — probes monitoring coverage and identifies blind spots.
 * Admin only. Read-only — no mutations.
 *
 * Payload: {} (no args required)
 * Returns: full incident surface analysis
 */

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = Date.now();

    // ── Fetch all state in parallel ───────────────────────────────────────────
    const [feeds, digests, healthJobs, deliveries] = await Promise.all([
        base44.asServiceRole.entities.Feed.filter({ status: { $in: ['active', 'error', 'paused'] } }, '-updated_date', 2000),
        base44.asServiceRole.entities.Digest.filter({ status: 'active' }),
        base44.asServiceRole.entities.SystemHealth.list('-created_date', 200),
        base44.asServiceRole.entities.DigestDelivery.filter({ status: 'failed' }, '-created_date', 100),
    ]);

    // ── TEST 1: Feed failure detection ────────────────────────────────────────
    const errorFeeds   = feeds.filter(f => f.status === 'error');
    const pausedFeeds  = feeds.filter(f => f.status === 'paused');
    const highErrFeeds = feeds.filter(f => (f.consecutive_errors || 0) >= 3);
    // Feeds with errors NOT surfaced in SystemHealth metadata
    const recentFetchJobs = healthJobs.filter(j => j.job_type === 'feed_fetch' && j.status === 'completed');
    const lastFetchJob    = recentFetchJobs[0];
    const lastFetchMeta   = lastFetchJob?.metadata || {};

    const feedTest = {
        error_feeds: errorFeeds.length,
        paused_feeds: pausedFeeds.length,
        high_consecutive_errors: highErrFeeds.length,
        last_job_feeds_processed: lastFetchMeta.feeds_processed ?? 'unknown',
        last_job_feeds_skipped: lastFetchMeta.feeds_skipped ?? 'unknown',
        // Is the error count captured in SystemHealth? No — it's only on Feed entity.
        error_count_in_system_health: false,
        consecutive_errors_in_system_health: false,
        // Would an admin know feeds are failing without visiting AdminHealth?
        proactive_alert_exists: false,
        verdict: errorFeeds.length > 0
            ? `BLIND SPOT: ${errorFeeds.length} feeds in error state — no alert fired`
            : 'No error feeds currently — but no alert would fire if they appeared',
    };

    // ── TEST 2: Skipped feeds ─────────────────────────────────────────────────
    const skippedInLogs = recentFetchJobs.slice(0, 5).map(j => ({
        started_at: j.started_at,
        feeds_skipped: j.metadata?.feeds_skipped ?? 0,
        overdue_feeds: j.metadata?.overdue_feeds ?? 0,
        max_lag_min: j.metadata?.max_lag_min ?? 0,
    }));
    const avgSkipped = skippedInLogs.length
        ? Math.round(skippedInLogs.reduce((a, b) => a + (b.feeds_skipped || 0), 0) / skippedInLogs.length)
        : 0;

    const skipTest = {
        recent_runs_sampled: skippedInLogs.length,
        avg_feeds_skipped_per_run: avgSkipped,
        skipped_visible_in_system_health: true, // feeds_skipped IS in metadata since our fix
        skipped_triggers_alert: false,
        starvation_alert_threshold: 'none — no threshold defined',
        verdict: avgSkipped > 50
            ? `RISK: Avg ${avgSkipped} feeds skipped per run — starvation possible with no alert`
            : `OK: Avg ${avgSkipped} feeds skipped — monitor if feed count grows`,
        recent_lag_data: skippedInLogs,
    };

    // ── TEST 3: Digest generation errors ─────────────────────────────────────
    const digestJobs   = healthJobs.filter(j => j.job_type === 'digest_generation');
    const lastDigestJob = digestJobs[0];
    const digestResults = lastDigestJob?.metadata?.results || [];
    const digestErrors  = digestResults.filter(r => r.status === 'error');
    const digestSkipped = digestResults.filter(r => r.skipped);
    const digestOk      = digestResults.filter(r => r.status === 'ok');

    const digestTest = {
        last_run_total: digestResults.length,
        last_run_ok: digestOk.length,
        last_run_skipped: digestSkipped.length,
        last_run_errors: digestErrors.length,
        error_details: digestErrors.map(r => ({ digest: r.digest, error: r.error })),
        error_captured_in_system_health: digestErrors.length > 0 && !!lastDigestJob,
        error_triggers_alert: false,
        partial_failure_visible: digestErrors.length > 0,
        // Partial success (some ok, some errored) looks like "completed" in SystemHealth
        partial_success_status: lastDigestJob?.status ?? 'unknown',
        verdict: digestErrors.length > 0
            ? `BLIND SPOT: ${digestErrors.length} digest(s) errored in last run — status still shows "completed", no alert fired`
            : 'No digest errors in last run — but partial failures are masked as "completed"',
    };

    // ── TEST 4: Partial job success/failure ───────────────────────────────────
    // A job with status=completed but some results failed is currently indistinguishable
    // from a fully-successful run unless admin drills into metadata.results
    const partialFailJobs = digestJobs.filter(j =>
        j.status === 'completed' &&
        j.metadata?.results?.some(r => r.status === 'error')
    );

    const partialTest = {
        partial_failure_jobs_found: partialFailJobs.length,
        top_level_status_for_partial: partialFailJobs.length > 0 ? 'completed (misleading)' : 'n/a',
        partial_failure_visible_without_drill_down: false,
        verdict: partialFailJobs.length > 0
            ? `BLIND SPOT: ${partialFailJobs.length} job(s) show "completed" but contain per-digest errors — no differentiated status`
            : 'No partial failures found — but the system cannot distinguish partial from full success',
    };

    // ── TEST 5: Failed deliveries (Slack/Discord/Email) ───────────────────────
    const failedDeliveries = deliveries;
    const deliveryTest = {
        failed_delivery_records: failedDeliveries.length,
        failed_delivery_visible_in_ui: false, // AdminHealth doesn't show DigestDelivery failures
        failed_delivery_triggers_alert: false,
        channels_affected: [...new Set(failedDeliveries.map(d => d.delivery_type))],
        verdict: failedDeliveries.length > 0
            ? `BLIND SPOT: ${failedDeliveries.length} failed delivery record(s) — not visible in AdminHealth, no alert`
            : 'No failed deliveries — but they would go unnoticed if they occurred',
    };

    // ── TEST 6: Stale lock (zombie "running" jobs) ────────────────────────────
    const staleThreshMs = 15 * 60 * 1000; // 15 min
    const zombieJobs = healthJobs.filter(j =>
        j.status === 'running' &&
        j.started_at &&
        (now - new Date(j.started_at).getTime()) > staleThreshMs
    );
    const zombieTest = {
        zombie_running_jobs: zombieJobs.length,
        oldest_zombie_age_min: zombieJobs.length
            ? Math.round((now - new Date(zombieJobs[0].started_at).getTime()) / 60000)
            : 0,
        zombie_triggers_alert: false,
        zombie_triggers_skip: true, // the overlap lock DOES block new runs
        verdict: zombieJobs.length > 0
            ? `CRITICAL: ${zombieJobs.length} zombie "running" job(s) — overlap lock is blocking ALL new fetch runs silently`
            : 'No zombie jobs currently',
    };

    // ── TEST 7: Feed lag / starvation ─────────────────────────────────────────
    const LAG_CRITICAL_MIN = 60;
    const LAG_WARN_MIN = 30;
    const staleFeeds = feeds.filter(f =>
        f.last_fetched && (now - new Date(f.last_fetched).getTime()) > LAG_CRITICAL_MIN * 60 * 1000
    );
    const neverFetched = feeds.filter(f => !f.last_fetched);
    const maxLagMin = feeds.reduce((max, f) => {
        if (!f.last_fetched) return max;
        const ageMin = Math.round((now - new Date(f.last_fetched).getTime()) / 60000);
        return Math.max(max, ageMin);
    }, 0);

    const lagTest = {
        feeds_unfetched_over_60min: staleFeeds.length,
        feeds_never_fetched: neverFetched.length,
        max_lag_min: maxLagMin,
        lag_visible_in_system_health: true, // added in our p0 telemetry fix
        lag_triggers_alert: false,
        verdict: staleFeeds.length > 0
            ? `RISK: ${staleFeeds.length} feeds haven't been fetched in >1hr. Max lag: ${maxLagMin}min — no alert fires`
            : `OK: No feeds stale >60min currently (max lag: ${maxLagMin}min)`,
    };

    // ── Blind spot summary ────────────────────────────────────────────────────
    const blindSpots = [
        { id: 'BS-1', severity: 'CRITICAL', title: 'Zombie lock blocks all feed fetching silently', detail: 'A crashed "running" SystemHealth job locks out all subsequent fetchFeeds runs. No alert fires. Admin only discovers it if they visit AdminHealth and notice the last_fetched timestamps are frozen.', detectable_by: 'last_fetched frozen + running job age >15min' },
        { id: 'BS-2', severity: 'CRITICAL', title: 'Feed errors accumulate with no proactive notification', detail: 'Feeds can sit in error state indefinitely. No admin email, no Slack alert, no dashboard badge outside AdminHealth. Users whose feeds break never know.', detectable_by: 'Feed.status=error count >0' },
        { id: 'BS-3', severity: 'HIGH', title: 'Digest partial failures masked as "completed"', detail: 'A digest run that processes 8 digests successfully and fails 2 still writes status=completed to SystemHealth. The per-digest errors are buried in metadata.results — invisible without drill-down.', detectable_by: 'metadata.results[].status=error while job.status=completed' },
        { id: 'BS-4', severity: 'HIGH', title: 'Failed Slack/Discord/Email deliveries are invisible', detail: 'DigestDelivery records with status=failed exist in the DB but AdminHealth never queries or displays them. A user could be silently missing all their Slack digests for weeks.', detectable_by: 'DigestDelivery.status=failed in last 24h' },
        { id: 'BS-5', severity: 'HIGH', title: 'Feed starvation has no threshold alert', detail: 'fetchFeeds now logs lag telemetry to SystemHealth metadata, but nothing reads it and raises an alert. A feed with max_lag >2hrs is currently observable only retrospectively.', detectable_by: 'metadata.max_lag_min >60 or overdue_count/total >50%' },
        { id: 'BS-6', severity: 'MEDIUM', title: 'No digest "no items" rate tracking', detail: 'Digests skipped due to "no new items in time window" are logged per-run but never aggregated. A digest that consistently skips (broken feed, wrong category filter) looks healthy.', detectable_by: 'digest skipped >3 consecutive runs' },
        { id: 'BS-7', severity: 'MEDIUM', title: 'Never-fetched feeds are not flagged', detail: 'Feeds added but never successfully fetched (last_fetched=null) sit silently. The only signal is item_count=0, which is indistinguishable from a valid empty feed.', detectable_by: 'Feed.last_fetched=null AND age >30min' },
    ];

    // ── Minimum viable alert thresholds ──────────────────────────────────────
    const alertThresholds = [
        { metric: 'error_feeds', warn: 1, critical: 5, action: 'Email admin immediately' },
        { metric: 'zombie_running_jobs', warn: 1, critical: 1, action: 'Email admin + auto-clear lock after 20min' },
        { metric: 'feeds_skipped_pct', warn: '40%', critical: '70%', action: 'Log warning + email if persists 3 runs' },
        { metric: 'max_lag_min', warn: 60, critical: 120, action: 'Email admin with stale feed list' },
        { metric: 'digest_errors_per_run', warn: 1, critical: 3, action: 'Email admin with error detail' },
        { metric: 'failed_deliveries_24h', warn: 1, critical: 5, action: 'Email admin with channel + digest name' },
        { metric: 'consecutive_digest_skips', warn: 3, critical: 5, action: 'Email digest owner + admin' },
    ];

    return Response.json({
        success: true,
        timestamp: new Date().toISOString(),
        tests: {
            feed_failures: feedTest,
            skipped_feeds: skipTest,
            digest_errors: digestTest,
            partial_job_failures: partialTest,
            delivery_failures: deliveryTest,
            zombie_locks: zombieTest,
            feed_lag: lagTest,
        },
        blind_spots: blindSpots,
        alert_thresholds: alertThresholds,
        summary: {
            critical_blind_spots: blindSpots.filter(b => b.severity === 'CRITICAL').length,
            high_blind_spots: blindSpots.filter(b => b.severity === 'HIGH').length,
            medium_blind_spots: blindSpots.filter(b => b.severity === 'MEDIUM').length,
            current_active_incidents: [
                zombieTest.zombie_running_jobs > 0 && `${zombieTest.zombie_running_jobs} zombie lock(s)`,
                feedTest.error_feeds > 0 && `${feedTest.error_feeds} feed(s) in error state`,
                lagTest.feeds_unfetched_over_60min > 0 && `${lagTest.feeds_unfetched_over_60min} feed(s) stale >60min`,
                failedDeliveries.length > 0 && `${failedDeliveries.length} failed delivery record(s)`,
            ].filter(Boolean),
        },
    });
});