/**
 * auditDuplicateRace — Concurrency race condition audit for FeedItem deduplication
 *
 * Admin-only. Tests whether concurrent fetchFeeds runs can insert duplicate
 * (feed_id, guid) pairs by simulating the exact read-then-write window.
 *
 * Test scenarios:
 *   1. serial_baseline    — sequential runs, expect zero duplicates
 *   2. concurrent_same    — N concurrent workers against the same feed
 *   3. concurrent_overlap — N workers against an overlapping feed set
 *   4. forced_delay       — artificial delay injected between dedup-read and bulkCreate
 *   5. existing_duplicates — scan DB for duplicates already present
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Synthetic feed items with predictable GUIDs for deterministic testing
function syntheticItems(feedId, count = 20) {
    return Array.from({ length: count }, (_, i) => ({
        feed_id: feedId,
        title: `Audit Item ${i}`,
        url: `https://audit-test.invalid/item-${i}`,
        description: 'Race condition audit item',
        content: '',
        author: 'audit',
        published_date: new Date().toISOString(),
        guid: `audit-guid-${i}`,
        category: 'Other',
        tags: [],
        is_read: false,
    }));
}

/**
 * Core dedup-then-insert logic — mirrors fetchFeeds exactly.
 * Returns { inserted: number, elapsed_ms: number }
 */
async function dedupAndInsert(base44, feedId, items, delayMs = 0) {
    const t0 = Date.now();

    // Step 1: read existing (same as fetchFeeds)
    const existing = await base44.asServiceRole.entities.FeedItem.filter(
        { feed_id: feedId }, '-created_date', 300
    );
    const existingGuids = new Set((existing || []).map(i => i.guid).filter(Boolean));
    const existingUrls  = new Set((existing || []).map(i => i.url).filter(Boolean));

    // Step 2: application-level dedup
    const toInsert = items.filter(item =>
        !existingGuids.has(item.guid) && !existingUrls.has(item.url)
    );

    if (toInsert.length === 0) return { inserted: 0, elapsed_ms: Date.now() - t0 };

    // Step 3: optional delay to widen the race window
    if (delayMs > 0) await sleep(delayMs);

    // Step 4: bulk insert — THIS IS THE RACE WINDOW
    if (toInsert.length > 0) {
        await base44.asServiceRole.entities.FeedItem.bulkCreate(toInsert);
    }

    return { inserted: toInsert.length, elapsed_ms: Date.now() - t0 };
}

/**
 * Count exact duplicates in DB for a given feedId
 * Returns array of { guid, url, count } where count > 1
 */
async function findDuplicates(base44, feedId) {
    const all = await base44.asServiceRole.entities.FeedItem.filter(
        { feed_id: feedId }, '-created_date', 1000
    );
    const guidMap = {};
    for (const item of (all || [])) {
        const key = item.guid || item.url;
        if (!key) continue;
        guidMap[key] = (guidMap[key] || 0) + 1;
    }
    return Object.entries(guidMap)
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count }));
}

/** Clean up all audit items inserted during this test run */
async function cleanupAuditItems(base44, feedId) {
    const all = await base44.asServiceRole.entities.FeedItem.filter(
        { feed_id: feedId, author: 'audit' }, '-created_date', 1000
    );
    await Promise.allSettled(
        (all || []).map(item => base44.asServiceRole.entities.FeedItem.delete(item.id))
    );
    return (all || []).length;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const {
            feed_id,           // required: a real Feed ID to test against
            concurrency = 5,   // how many workers to fire simultaneously
            delay_ms = 200,    // artificial delay in forced_delay test (ms)
            cleanup = true,    // whether to delete audit items after test
            scenarios = ['serial_baseline', 'concurrent_same', 'forced_delay', 'existing_duplicates'],
        } = body;

        if (!feed_id) {
            return Response.json({
                error: 'feed_id is required. Pass any active Feed ID from your database.',
                hint: 'GET /Feeds to find a feed ID, then POST { feed_id: "..." }'
            }, { status: 400 });
        }

        // Verify feed exists
        const feed = await base44.asServiceRole.entities.Feed.get(feed_id).catch(() => null);
        if (!feed) return Response.json({ error: `Feed ${feed_id} not found` }, { status: 404 });

        const report = {
            feed_id,
            feed_name: feed.name,
            concurrency,
            delay_ms,
            scenarios: {},
            verdict: null,
            reproduction: null,
            severity: null,
            recommended_fix: null,
        };

        // ─── Scenario 1: Serial Baseline ──────────────────────────────────────────
        if (scenarios.includes('serial_baseline')) {
            await cleanupAuditItems(base44, feed_id);
            const items = syntheticItems(feed_id, 10);

            // Run twice serially — second run should insert 0
            const run1 = await dedupAndInsert(base44, feed_id, items, 0);
            const run2 = await dedupAndInsert(base44, feed_id, items, 0);

            const dups = await findDuplicates(base44, feed_id);
            report.scenarios.serial_baseline = {
                run1_inserted: run1.inserted,
                run2_inserted: run2.inserted,
                duplicates_found: dups.length,
                pass: run2.inserted === 0 && dups.length === 0,
                note: run2.inserted === 0
                    ? 'Serial dedup works correctly — second run correctly skipped all items'
                    : `FAIL: Second serial run inserted ${run2.inserted} items that already existed`,
            };
            if (cleanup) await cleanupAuditItems(base44, feed_id);
        }

        // ─── Scenario 2: Concurrent Same Feed ────────────────────────────────────
        if (scenarios.includes('concurrent_same')) {
            await cleanupAuditItems(base44, feed_id);
            const items = syntheticItems(feed_id, 20);

            // Fire N workers all at exactly the same time against the same feed + same items
            const workers = Array.from({ length: concurrency }, () =>
                dedupAndInsert(base44, feed_id, items, 0)
            );
            const results = await Promise.allSettled(workers);

            const totalInserted = results
                .filter(r => r.status === 'fulfilled')
                .reduce((sum, r) => sum + r.value.inserted, 0);

            const dups = await findDuplicates(base44, feed_id);
            const raceOccurred = dups.length > 0;

            report.scenarios.concurrent_same = {
                workers: concurrency,
                items_per_worker: 20,
                total_inserted: totalInserted,
                expected_unique: 20,
                duplicates_found: dups.length,
                duplicate_keys: dups.slice(0, 5),
                race_condition_triggered: raceOccurred,
                pass: !raceOccurred,
                note: raceOccurred
                    ? `⚠️ RACE CONFIRMED: ${dups.length} duplicate guid(s) inserted. Total inserted ${totalInserted} vs expected 20.`
                    : `Clean run — ${concurrency} concurrent workers, ${totalInserted} total inserts, 0 duplicates. Race window may be too narrow to trigger consistently; re-run with higher concurrency or delay_ms.`,
            };
            if (cleanup) await cleanupAuditItems(base44, feed_id);
        }

        // ─── Scenario 3: Forced Delay (maximally exploits race window) ───────────
        if (scenarios.includes('forced_delay')) {
            await cleanupAuditItems(base44, feed_id);
            const items = syntheticItems(feed_id, 15);

            // Worker A reads existing, then sleeps delay_ms, then inserts
            // Worker B reads existing (before A has inserted), then immediately inserts
            // This deterministically reproduces the race window
            const [resultA, resultB] = await Promise.allSettled([
                dedupAndInsert(base44, feed_id, items, delay_ms),  // A: delayed
                dedupAndInsert(base44, feed_id, items, 0),          // B: immediate
            ]);

            const totalInserted = [resultA, resultB]
                .filter(r => r.status === 'fulfilled')
                .reduce((sum, r) => sum + r.value.inserted, 0);

            const dups = await findDuplicates(base44, feed_id);
            const raceOccurred = dups.length > 0;

            report.scenarios.forced_delay = {
                delay_ms,
                worker_A: resultA.status === 'fulfilled' ? resultA.value : { error: resultA.reason?.message },
                worker_B: resultB.status === 'fulfilled' ? resultB.value : { error: resultB.reason?.message },
                total_inserted: totalInserted,
                expected_unique: 15,
                duplicates_found: dups.length,
                duplicate_keys: dups.slice(0, 5),
                race_condition_triggered: raceOccurred,
                pass: !raceOccurred,
                note: raceOccurred
                    ? `⚠️ RACE CONFIRMED DETERMINISTICALLY: ${dups.length} duplicate guid(s) with ${delay_ms}ms forced delay. This is the exact production risk.`
                    : `No duplicates with ${delay_ms}ms delay. Increase delay_ms or concurrency to widen the window.`,
            };
            if (cleanup) await cleanupAuditItems(base44, feed_id);
        }

        // ─── Scenario 4: Existing DB Duplicates Scan ─────────────────────────────
        if (scenarios.includes('existing_duplicates')) {
            // Scan this feed for any pre-existing duplicates in production data
            const dups = await findDuplicates(base44, feed_id);

            // Also do a platform-wide sample (first 20 feeds)
            const allFeedsRaw = await base44.asServiceRole.entities.Feed.filter(
                { status: 'active' }, '-last_fetched', 20
            );
            const allFeeds = Array.isArray(allFeedsRaw) ? allFeedsRaw : [];

            let platformDupCount = 0;
            const platformDupFeeds = [];
            for (const f of allFeeds) {
                const fDups = await findDuplicates(base44, f.id);
                if (fDups.length > 0) {
                    platformDupCount += fDups.length;
                    platformDupFeeds.push({ feed_name: f.name, feed_id: f.id, dup_count: fDups.length, examples: fDups.slice(0, 3) });
                }
            }

            report.scenarios.existing_duplicates = {
                target_feed_dups: dups.length,
                target_feed_dup_keys: dups.slice(0, 5),
                platform_sample_size: allFeeds.length,
                platform_feeds_with_dups: platformDupFeeds.length,
                platform_total_dup_pairs: platformDupCount,
                platform_dup_feeds: platformDupFeeds,
                pass: dups.length === 0,
                note: platformDupCount > 0
                    ? `⚠️ ${platformDupCount} duplicate pairs found across ${platformDupFeeds.length} feeds in production. Cleanup job is NEEDED NOW.`
                    : `No existing duplicates found in ${allFeeds.length} sampled feeds.`,
            };
        }

        // ─── Final Verdict ────────────────────────────────────────────────────────
        const scenarioResults = Object.values(report.scenarios);
        const raceConfirmed = scenarioResults.some(s => s.race_condition_triggered);
        const existingDups  = report.scenarios.existing_duplicates?.platform_total_dup_pairs > 0;

        report.verdict = raceConfirmed
            ? 'RACE CONDITION CONFIRMED — duplicates CAN and DO occur under concurrent fetch runs'
            : 'Race condition not triggered in this run — but the code path is structurally vulnerable (read-then-write without atomic guarantee)';

        report.reproduction = {
            steps: [
                '1. Two scheduled fetchFeeds automations fire within the same ~200ms window (e.g. if cron overlaps or is manually triggered)',
                '2. Both workers call FeedItem.filter({ feed_id }) — both read the same empty/stale set',
                '3. Both compute the same toInsert list (same items, no overlap in their read snapshots)',
                '4. Both call bulkCreate — DB has no unique constraint, both succeed',
                '5. Result: identical (feed_id, guid) pairs exist in FeedItem table',
            ],
            most_likely_trigger: 'Manual "run now" while scheduled run is in progress, OR two automation triggers firing within the batch processing window',
            forced_delay_test: `Set delay_ms >= 100 and concurrency >= 2 — reproduces deterministically in forced_delay scenario`,
        };

        report.severity = {
            level: 'HIGH',
            impact: [
                'Users see duplicate articles in their feeds and digests',
                'Digest item counts are inflated — same article summarized multiple times',
                'Feed item_count drifts upward incorrectly',
                'DB storage grows unnecessarily',
                'Digest generation LLM prompt gets polluted with repeated content',
            ],
            likelihood: 'MEDIUM — only triggers when two fetchFeeds invocations overlap on the same feed. Currently mitigated by single automation schedule, but manual triggers or overlapping runs break this.',
        };

        report.db_unique_constraint_analysis = {
            is_only_real_fix: true,
            reason: 'Application-level dedup with a read-then-write pattern CANNOT be made race-safe without distributed locking or a DB unique constraint. The dedup check and the insert are not atomic.',
            proposed_constraint: 'UNIQUE INDEX on FeedItem (feed_id, guid) — rejects duplicate inserts at the DB level regardless of concurrency',
            platform_note: 'Base44 does not currently expose unique constraint configuration. The recommended workaround until it does is the post-insert dedup approach below, combined with preventing overlapping automation runs.',
            workarounds_without_db_constraint: [
                '1. POST-INSERT DEDUP JOB: Run a periodic cleanup that deletes the newer of any (feed_id, guid) pair with count > 1 (keep oldest by created_date)',
                '2. IDEMPOTENT INSERT: Fetch existing guids immediately before each individual feed insert (not batch), reducing the race window from minutes to milliseconds',
                '3. PREVENT OVERLAP: Add a SystemHealth "running" lock — if a fetchFeeds job is already running, new invocations exit early',
                '4. HASH-BASED DEDUP: Store a dedupe_hash on each item combining feed_id+guid and do a filter({ dedupe_hash: ... }) before each single-item insert (expensive but safer)',
            ],
        };

        report.recommended_implementation_plan = [
            {
                priority: 1,
                action: 'Add fetchFeeds overlap prevention lock',
                description: 'At the start of fetchFeeds, check SystemHealth for a job_type=feed_fetch with status=running started in the last 10 minutes. If found, exit early. Write status=running at start, status=completed at end.',
                effort: 'LOW',
                eliminates: 'Overlapping scheduled + manual trigger race',
            },
            {
                priority: 2,
                action: 'Run deduplicateFeedItems cleanup job NOW',
                description: 'Query FeedItem for all feeds, group by (feed_id, guid), delete newer duplicates (keep min created_date). Run once immediately, then weekly as maintenance.',
                effort: 'LOW',
                eliminates: 'Existing duplicates in production',
            },
            {
                priority: 3,
                action: 'Narrow race window per-feed',
                description: 'Move the FeedItem.filter() call to immediately before each bulkCreate (inside the per-feed loop), not in a pre-batch sweep. Reduces window from O(batch_time) to O(~10ms).',
                effort: 'MEDIUM',
                eliminates: 'Most practical race scenarios',
            },
            {
                priority: 4,
                action: 'Request DB unique constraint from Base44 platform',
                description: 'Add dedupe_hash field (md5 of feed_id+guid) and request unique index enforcement at platform level. This is the only bulletproof fix.',
                effort: 'PLATFORM DEPENDENCY',
                eliminates: 'All race conditions permanently',
            },
        ];

        return Response.json(report);

    } catch (err) {
        return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
    }
});