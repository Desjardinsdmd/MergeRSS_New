/**
 * simulateFeedStarvation
 *
 * Pure mathematical simulation of the fetchFeeds scheduling loop.
 * No real HTTP calls, no DB writes — all in-memory modelling.
 *
 * Models:
 *   - Global cap rotation (current behaviour: sort by last_fetched ASC, slice top N)
 *   - Age-based priority scheduling (proposed: always process feeds overdue by >1 interval first)
 *
 * Admin-only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ─── Simulation constants (mirror production values) ────────────────────────
const RUN_INTERVAL_MINUTES = 10;   // automation fires every 10 minutes
const PER_RUN_CAP = 100;           // feeds processed per run
const BATCH_SIZE = 10;             // parallel batch size
const BATCH_DELAY_MS = 200;        // delay between batches
const PER_FEED_PARSE_MS = 600;     // avg time to HTTP-fetch + parse one feed (conservative)

// Derived: how long one run actually takes in wall-clock time
function estimateRunDurationMs(feedCount) {
    const batches = Math.ceil(feedCount / BATCH_SIZE);
    const fetchMs = PER_FEED_PARSE_MS; // batches run in parallel so cost = 1x per batch
    return batches * (fetchMs + BATCH_DELAY_MS);
}

// ─── Feed generators ─────────────────────────────────────────────────────────

function generateFeeds(count, scenario = 'uniform') {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => {
        let lastFetched;
        let fetchTimeMs = PER_FEED_PARSE_MS;
        let errorRate = 0;

        switch (scenario) {
            case 'uniform':
                // Feeds were last fetched at evenly-spread times over the past hour
                lastFetched = now - (i / count) * 60 * 60 * 1000;
                break;
            case 'cold_start':
                // Half the feeds have never been fetched (new deployment)
                lastFetched = i < count / 2 ? 0 : now - (i / count) * 30 * 60 * 1000;
                break;
            case 'hotspot':
                // Top 10% feeds are very popular, fetched frequently already
                // Bottom 10% feeds are slow/failing
                if (i < count * 0.1) {
                    lastFetched = now - 2 * 60 * 1000; // fetched 2 minutes ago
                } else if (i > count * 0.9) {
                    lastFetched = 0; // never fetched
                    fetchTimeMs = 18000; // slow — near the 20s timeout
                    errorRate = 0.5;    // 50% error rate
                } else {
                    lastFetched = now - (i / count) * 45 * 60 * 1000;
                }
                break;
            case 'error_heavy':
                // 30% of feeds are in error state and slow
                if (i % 3 === 0) {
                    lastFetched = now - 20 * 60 * 1000;
                    fetchTimeMs = 15000;
                    errorRate = 0.8;
                } else {
                    lastFetched = now - (i / count) * 60 * 60 * 1000;
                }
                break;
            default:
                lastFetched = now - (i / count) * 60 * 60 * 1000;
        }

        return {
            id: `feed-${i}`,
            name: `Feed #${i}`,
            lastFetched,
            fetchTimeMs,
            errorRate,
            scenario,
        };
    });
}

// ─── Scheduler strategies ─────────────────────────────────────────────────────

/**
 * CURRENT BEHAVIOUR: Sort all feeds by last_fetched ASC, take top N.
 * "Oldest first" with a hard cap — feeds beyond cap are skipped this run.
 */
function selectFeeds_globalCapRotation(feeds, cap = PER_RUN_CAP) {
    return [...feeds]
        .sort((a, b) => a.lastFetched - b.lastFetched)
        .slice(0, cap);
}

/**
 * PROPOSED: Age-based priority.
 * Only process feeds that are overdue by at least one run interval.
 * Then sort by how overdue they are (most overdue first), cap to N.
 * Feeds recently fetched are skipped — no wasted capacity.
 */
function selectFeeds_ageBased(feeds, now, cap = PER_RUN_CAP) {
    const overdueThresholdMs = RUN_INTERVAL_MINUTES * 60 * 1000;
    return feeds
        .filter(f => (now - f.lastFetched) >= overdueThresholdMs)
        .sort((a, b) => a.lastFetched - b.lastFetched)
        .slice(0, cap);
}

// ─── Core simulation ──────────────────────────────────────────────────────────

function simulateRuns(feeds, strategy, totalRuns = 24, intervalMinutes = RUN_INTERVAL_MINUTES) {
    // Deep copy so we can mutate lastFetched
    let state = feeds.map(f => ({ ...f }));
    const now = Date.now();

    const metrics = {
        feedDelays: Object.fromEntries(state.map(f => [f.id, []])), // delay per fetch in ms
        skippedRuns: Object.fromEntries(state.map(f => [f.id, 0])), // runs where feed was skipped
        totalProcessed: 0,
        totalSkipped: 0,
        runSummaries: [],
    };

    for (let run = 0; run < totalRuns; run++) {
        const runTime = now + run * intervalMinutes * 60 * 1000;

        let selected;
        if (strategy === 'age_based') {
            selected = selectFeeds_ageBased(state, runTime);
        } else {
            selected = selectFeeds_globalCapRotation(state);
        }

        const selectedIds = new Set(selected.map(f => f.id));

        // Record skips
        for (const feed of state) {
            if (!selectedIds.has(feed.id)) {
                metrics.skippedRuns[feed.id]++;
                metrics.totalSkipped++;
            }
        }

        // Process selected feeds — update lastFetched, record delay
        let runMaxDelayMinutes = 0;
        let runMinDelayMinutes = Infinity;
        for (const feed of selected) {
            const delayMs = runTime - feed.lastFetched;
            const delayMin = delayMs / 60000;
            metrics.feedDelays[feed.id].push(delayMin);
            runMaxDelayMinutes = Math.max(runMaxDelayMinutes, delayMin);
            if (runMinDelayMinutes === Infinity || delayMin < runMinDelayMinutes) {
                runMinDelayMinutes = delayMin;
            }

            // Simulate success/error — on success update lastFetched
            const isError = Math.random() < feed.errorRate;
            if (!isError) {
                // Find the feed in state and update
                const stateRef = state.find(f => f.id === feed.id);
                if (stateRef) stateRef.lastFetched = runTime;
            }
        }

        metrics.totalProcessed += selected.length;
        metrics.runSummaries.push({
            run: run + 1,
            selected: selected.length,
            skipped: state.length - selected.length,
            maxDelayMin: Math.round(runMaxDelayMinutes),
            minDelayMin: Math.round(runMinDelayMinutes === Infinity ? 0 : runMinDelayMinutes),
        });
    }

    // Compute per-feed stats
    const feedStats = state.map(feed => {
        const delays = metrics.feedDelays[feed.id];
        const skipped = metrics.skippedRuns[feed.id];
        const avgDelay = delays.length > 0
            ? delays.reduce((a, b) => a + b, 0) / delays.length
            : null;
        const maxDelay = delays.length > 0 ? Math.max(...delays) : null;
        const minDelay = delays.length > 0 ? Math.min(...delays) : null;
        return {
            id: feed.id,
            name: feed.name,
            skipped_runs: skipped,
            times_fetched: delays.length,
            avg_delay_min: avgDelay !== null ? Math.round(avgDelay) : null,
            max_delay_min: maxDelay !== null ? Math.round(maxDelay) : null,
            min_delay_min: minDelay !== null ? Math.round(minDelay) : null,
            starvation_risk: skipped >= totalRuns * 0.5 ? 'HIGH' : skipped >= totalRuns * 0.2 ? 'MEDIUM' : 'LOW',
        };
    });

    const starvedFeeds = feedStats.filter(f => f.starvation_risk === 'HIGH');
    const maxOverallDelay = Math.max(...feedStats.filter(f => f.max_delay_min !== null).map(f => f.max_delay_min));
    const avgOverallDelay = feedStats
        .filter(f => f.avg_delay_min !== null)
        .reduce((sum, f) => sum + f.avg_delay_min, 0) / feedStats.filter(f => f.avg_delay_min !== null).length;

    const neverFetched = feedStats.filter(f => f.times_fetched === 0);

    return {
        strategy,
        total_runs: totalRuns,
        feeds_total: state.length,
        feeds_per_run_cap: PER_RUN_CAP,
        total_processed: metrics.totalProcessed,
        total_skipped: metrics.totalSkipped,
        max_delay_minutes: Math.round(maxOverallDelay),
        avg_delay_minutes: Math.round(avgOverallDelay),
        starved_feed_count: starvedFeeds.length,
        never_fetched_count: neverFetched.length,
        worst_feeds: feedStats
            .filter(f => f.starvation_risk !== 'LOW')
            .sort((a, b) => (b.max_delay_min ?? 0) - (a.max_delay_min ?? 0))
            .slice(0, 10),
        run_summaries: metrics.runSummaries,
        feed_stats_sample: feedStats.slice(0, 20), // first 20 feeds as sample
    };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const {
            feed_counts = [100, 300, 500, 1000],
            scenarios = ['uniform', 'cold_start', 'hotspot', 'error_heavy'],
            total_runs = 144, // 24 hours of 10-minute intervals
        } = body;

        const results = {};

        for (const scenario of scenarios) {
            results[scenario] = {};

            for (const count of feed_counts) {
                const feeds = generateFeeds(count, scenario);

                const rotation = simulateRuns(feeds, 'global_cap_rotation', total_runs);
                const ageBased  = simulateRuns(feeds, 'age_based', total_runs);

                const estimatedRunMs = estimateRunDurationMs(Math.min(count, PER_RUN_CAP));

                results[scenario][`feeds_${count}`] = {
                    feed_count: count,
                    run_interval_minutes: RUN_INTERVAL_MINUTES,
                    per_run_cap: PER_RUN_CAP,
                    estimated_run_duration_seconds: Math.round(estimatedRunMs / 1000),
                    run_fits_in_interval: estimatedRunMs < RUN_INTERVAL_MINUTES * 60 * 1000,
                    global_cap_rotation: {
                        max_delay_minutes: rotation.max_delay_minutes,
                        avg_delay_minutes: rotation.avg_delay_minutes,
                        starved_feeds: rotation.starved_feed_count,
                        never_fetched: rotation.never_fetched_count,
                        worst_feeds: rotation.worst_feeds,
                        verdict: rotation.starved_feed_count > 0
                            ? `⚠️ STARVATION: ${rotation.starved_feed_count} feed(s) skipped >50% of runs. Max delay ${rotation.max_delay_minutes}min.`
                            : `✅ OK — Max delay ${rotation.max_delay_minutes}min, all feeds rotating.`,
                    },
                    age_based: {
                        max_delay_minutes: ageBased.max_delay_minutes,
                        avg_delay_minutes: ageBased.avg_delay_minutes,
                        starved_feeds: ageBased.starved_feed_count,
                        never_fetched: ageBased.never_fetched_count,
                        worst_feeds: ageBased.worst_feeds,
                        verdict: ageBased.starved_feed_count > 0
                            ? `⚠️ STARVATION: ${ageBased.starved_feed_count} feed(s) starved. Max delay ${ageBased.max_delay_minutes}min.`
                            : `✅ OK — Max delay ${ageBased.max_delay_minutes}min, all feeds rotating.`,
                    },
                    improvement: {
                        max_delay_reduction_minutes: rotation.max_delay_minutes - ageBased.max_delay_minutes,
                        starvation_eliminated: rotation.starved_feed_count > 0 && ageBased.starved_feed_count === 0,
                    },
                };
            }
        }

        // ── Telemetry recommendations (static, returned with every run) ──────────
        const telemetry_recommendations = [
            {
                metric: 'feed_fetch_lag_minutes',
                description: 'For every completed run, log max(now - last_fetched) across ALL feeds, not just processed ones.',
                why: 'The current log only shows feeds_processed and feeds_skipped. You cannot detect starvation without the lag of skipped feeds.',
                implementation: 'After loading allFeeds, compute: Math.max(...allFeeds.map(f => (Date.now() - new Date(f.last_fetched||0)) / 60000))',
                priority: 'P0 — add to next fetchFeeds deploy',
            },
            {
                metric: 'feeds_overdue_count',
                description: 'Count feeds whose last_fetched is older than 2× the run interval (i.e., missed at least one full cycle).',
                why: 'A growing overdue count is the earliest signal of starvation before it becomes a user-visible problem.',
                implementation: 'const overdue = allFeeds.filter(f => !f.last_fetched || (Date.now() - new Date(f.last_fetched)) > 2 * RUN_INTERVAL_MS)',
                priority: 'P0 — add to next fetchFeeds deploy',
            },
            {
                metric: 'p50_p95_p99_fetch_lag',
                description: 'Percentile distribution of (now - last_fetched) at the start of every run.',
                why: 'Averages hide outliers. P99 lag tells you the worst-case user experience.',
                implementation: 'Sort ages array, pick indices [0.5, 0.95, 0.99].map(p => sorted[Math.floor(p * sorted.length)])',
                priority: 'P1 — add within 2 weeks',
            },
            {
                metric: 'run_duration_ms',
                description: 'Log actual wall-clock duration of each fetchFeeds invocation.',
                why: 'If a run takes longer than the 10-minute interval, the overlap lock fires and runs are skipped entirely — invisible without this metric.',
                implementation: 'const startMs = Date.now(); ... metadata.run_duration_ms = Date.now() - startMs',
                priority: 'P0 — add to next fetchFeeds deploy',
            },
            {
                metric: 'starvation_alert_threshold',
                description: 'Emit a console.warn (or SystemHealth alert) if any feed has not been fetched in >30 minutes.',
                why: 'Passive — no one monitors SystemHealth logs today. Active alerting closes the detection gap.',
                implementation: 'const stale = allFeeds.filter(f => age > 30min); if (stale.length > 0) console.warn("[fetchFeeds] STARVATION_ALERT:", stale.length, "feeds unfetched >30min")',
                priority: 'P1 — add within 2 weeks',
            },
        ];

        // ── Path to age-based scheduling ─────────────────────────────────────────
        const migration_path = {
            current_behaviour: {
                summary: 'Sort ALL feeds by last_fetched ASC, slice top 100, process. Feeds 101+ are silently deferred.',
                risk: 'With 300+ feeds, feeds indexed 101-300 are NEVER processed because the 100 oldest feeds always appear first. The sort guarantees the same 100 feeds win every run once they fall behind.',
            },
            phase_1: {
                name: 'Add overdue-only filter (low risk, immediate)',
                change: 'Before slicing, filter: only feeds with last_fetched older than (now - RUN_INTERVAL_MIN*60*1000). Cap to 100.',
                benefit: 'Recently-fetched feeds stop competing for slots. Fresh feeds use zero capacity.',
                risk: 'None — strictly additive filter. If 0 feeds are overdue, behaviour is unchanged.',
                code_diff: `
// BEFORE
const feeds = allFeeds.slice(0, 100);

// AFTER
const overdueMs = RUN_INTERVAL_MINUTES * 60 * 1000;
const overdue = allFeeds.filter(f => !f.last_fetched || (Date.now() - new Date(f.last_fetched)) > overdueMs);
const feeds = overdue.slice(0, 100);
`,
            },
            phase_2: {
                name: 'Add stale-feed telemetry to SystemHealth (no risk)',
                change: 'Compute and log feed_fetch_lag_minutes, feeds_overdue_count, run_duration_ms in every SystemHealth metadata write.',
                benefit: 'Gives you the data to know if phase_1 is enough or if you need phase_3.',
            },
            phase_3: {
                name: 'Per-user feed partitioning (medium complexity)',
                change: 'Group feeds by created_by, allocate cap slots proportionally across users. No single user\'s 200 feeds can starve another user\'s 5 feeds.',
                benefit: 'Multi-tenant fairness. Required when you have users with large personal feed libraries.',
                when: 'When p99 lag metric from phase_2 shows >30min delays for any user.',
            },
            phase_4: {
                name: 'Per-feed custom poll intervals (complex, premium feature)',
                change: 'Add a poll_interval_minutes field to Feed entity. fetchFeeds filters f.last_fetched > (now - poll_interval_minutes*60000).',
                benefit: 'High-frequency feeds (market data: 5min) vs. low-frequency (weekly blog: 360min). Massively reduces wasted cycles.',
                when: 'When feed count exceeds 1000 or premium tier needs differentiated service levels.',
            },
        };

        return Response.json({
            simulation_parameters: {
                run_interval_minutes: RUN_INTERVAL_MINUTES,
                per_run_cap: PER_RUN_CAP,
                batch_size: BATCH_SIZE,
                total_runs_simulated: total_runs,
                simulated_duration_hours: Math.round(total_runs * RUN_INTERVAL_MINUTES / 60),
                feed_counts_tested: feed_counts,
                scenarios_tested: scenarios,
            },
            results,
            telemetry_recommendations,
            migration_path,
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});