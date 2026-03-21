/**
 * functions/lib.js — MergeRSS Shared Backend Utility Layer
 *
 * PURPOSE: Eliminate recurring failure patterns across all backend functions.
 *
 * EXPORTS:
 *   Data Access:    extractItems, safeList, safeFilter
 *   Auth:           requireAdminOrScheduler, requireAdmin, requireAuthenticatedUser
 *   Batch:          chunkArray, withConcurrencyLimit, safeSequentialWrite
 *   Job Execution:  runJob
 *   Health:         classifyPipelineHealth, writePipelineStatus
 *
 * RULES:
 *   - All entity reads must go through safeList/safeFilter — never raw .list()/.filter()
 *   - All scheduled jobs must use runJob wrapper
 *   - All auth checks must use the helpers below
 *   - No DB queries inside loops without using safeSequentialWrite or batch helpers
 */

// ─── Data Access ─────────────────────────────────────────────────────────────

/**
 * Normalize any Base44 SDK response into a clean array.
 * Handles: plain array, { items }, { data }, { results }, paginated envelope.
 */
export function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'object') return [];
    // Try known envelope shapes
    if (Array.isArray(raw.items))   return raw.items;
    if (Array.isArray(raw.data))    return raw.data;
    if (Array.isArray(raw.results)) return raw.results;
    // Last resort: find any array value in the object
    const found = Object.values(raw).find(v => Array.isArray(v));
    if (found) return found;
    return [];
}

/**
 * Safe wrapper for entity.list() — always returns a clean array.
 * @param {object} entity  - Base44 entity reference (e.g. base44.asServiceRole.entities.Feed)
 * @param {string} sort    - Sort field (e.g. '-created_date')
 * @param {number} limit   - Max records
 */
export async function safeList(entity, sort, limit = 500) {
    const raw = await entity.list(sort, limit);
    return extractItems(raw);
}

/**
 * Safe wrapper for entity.filter() — always returns a clean array.
 * @param {object} entity  - Base44 entity reference
 * @param {object} query   - Filter query object
 * @param {string} sort    - Sort field
 * @param {number} limit   - Max records
 */
export async function safeFilter(entity, query, sort, limit = 500) {
    const raw = await entity.filter(query, sort, limit);
    return extractItems(raw);
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

/**
 * For scheduled OR admin-manual jobs.
 * Returns null if scheduler (no user context) — allowed.
 * Returns user if admin — allowed.
 * Returns Response with 403 if authenticated non-admin user.
 */
export async function requireAdminOrScheduler(base44) {
    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return { error: Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 }) };
        }
        return { user: user || null };
    } catch {
        // No auth context = scheduler run — allow
        return { user: null };
    }
}

/**
 * For admin-only manual endpoints (never called by scheduler).
 * Returns 403 if not admin.
 */
export async function requireAdmin(base44) {
    try {
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return { error: Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 }) };
        }
        return { user };
    } catch {
        return { error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
    }
}

/**
 * For user-facing endpoints — any authenticated user.
 */
export async function requireAuthenticatedUser(base44) {
    try {
        const user = await base44.auth.me();
        if (!user) {
            return { error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
        }
        return { user };
    } catch {
        return { error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
    }
}

// ─── Batch / Concurrency Helpers ──────────────────────────────────────────────

export function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Run async tasks with a concurrency cap.
 * @param {number} limit      - Max simultaneous tasks
 * @param {Function[]} tasks  - Array of async () => result functions
 */
export async function withConcurrencyLimit(limit, tasks) {
    const results = new Array(tasks.length);
    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]().catch(err => ({ __err: err.message }));
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

/**
 * Write items sequentially with a delay between each to avoid DB rate limits.
 * @param {any[]} items         - Items to process
 * @param {Function} writeFn    - async (item) => void
 * @param {number} delayMs      - Delay between writes (default 100ms)
 */
export async function safeSequentialWrite(items, writeFn, delayMs = 100) {
    const errors = [];
    for (let i = 0; i < items.length; i++) {
        try {
            await writeFn(items[i]);
        } catch (e) {
            errors.push({ index: i, error: e.message });
        }
        if (i < items.length - 1) await sleep(delayMs);
    }
    return errors;
}

export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Job Execution Framework ──────────────────────────────────────────────────

const ZOMBIE_TTL_MS = 15 * 60 * 1000;

function makeRunId(prefix = 'job') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Standardized job execution wrapper for all scheduled/manual backend jobs.
 *
 * Handles:
 *  - Lock acquisition / release
 *  - Heartbeat (proves liveness to zombie detector)
 *  - Error isolation
 *  - Structured result format
 *  - Pipeline health status writing
 *
 * @param {object} options
 *   @param {object}   base44         - Base44 SDK client
 *   @param {string}   jobType        - Matches SystemHealth.job_type enum value
 *   @param {string}   [prefix]       - Instance ID prefix (default: jobType)
 *   @param {number}   [lockWindowMs] - How long before a lock is considered stale (default: 10min)
 *   @param {number}   [heartbeatMs]  - Heartbeat interval (default: 60s)
 *   @param {boolean}  [skipLock]     - Skip lock management (for lightweight jobs)
 * @param {Function} handler         - async (ctx) => stats object
 *   ctx = { base44, instanceId, log, warn, error }
 *
 * @returns {Response} Always returns a Response with structured JSON.
 */
export async function runJob(options, handler) {
    const {
        base44,
        jobType,
        prefix,
        lockWindowMs = 10 * 60 * 1000,
        heartbeatMs = 60 * 1000,
        skipLock = false,
    } = options;

    const instanceId = makeRunId(prefix || jobType.replace(/_/g, ''));
    const startedAt = new Date().toISOString();
    const runStartMs = Date.now();
    const logs = [];

    const log   = (msg) => { console.log(`[${jobType}][${instanceId}] ${msg}`); logs.push({ level: 'info', msg, ts: Date.now() }); };
    const warn  = (msg) => { console.warn(`[${jobType}][${instanceId}] ${msg}`); logs.push({ level: 'warn', msg, ts: Date.now() }); };
    const error = (msg) => { console.error(`[${jobType}][${instanceId}] ${msg}`); logs.push({ level: 'error', msg, ts: Date.now() }); };

    let lockRecord = null;
    let heartbeatTimer = null;

    // ── Lock management ────────────────────────────────────────────────────────
    if (!skipLock) {
        try {
            // Load and expire zombie locks
            const activeLocks = await safeFilter(
                base44.asServiceRole.entities.SystemHealth,
                { job_type: jobType, status: 'running' },
                '-started_at', 5
            );

            for (const stale of activeLocks) {
                const age = Date.now() - new Date(stale.started_at).getTime();
                const lastHb = stale.metadata?.last_heartbeat_at
                    ? Date.now() - new Date(stale.metadata.last_heartbeat_at).getTime()
                    : age;
                if (age >= ZOMBIE_TTL_MS || lastHb > ZOMBIE_TTL_MS) {
                    warn(`Reclaiming zombie lock ${stale.id} (age=${Math.round(age/60000)}min)`);
                    await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                        status: 'failed',
                        completed_at: new Date().toISOString(),
                        error_message: `Zombie reclaimed by ${instanceId}`,
                    }).catch(() => {});
                }
            }

            // Re-check for live locks after zombie expiry
            const liveLock = activeLocks.find(r => {
                const age = Date.now() - new Date(r.started_at).getTime();
                const lastHb = r.metadata?.last_heartbeat_at
                    ? Date.now() - new Date(r.metadata.last_heartbeat_at).getTime()
                    : age;
                return age < lockWindowMs && lastHb < ZOMBIE_TTL_MS;
            });

            if (liveLock) {
                warn(`Lock REFUSED — active owner: ${liveLock.metadata?.instance_id || liveLock.id}`);
                return Response.json({
                    skipped: true,
                    reason: 'Another run is actively in progress',
                    active_owner: liveLock.metadata?.instance_id || liveLock.id,
                    running_since: liveLock.started_at,
                });
            }

            // Acquire lock
            lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
                job_type: jobType,
                status: 'running',
                started_at: startedAt,
                metadata: { instance_id: instanceId, last_heartbeat_at: startedAt },
            });
            log(`Lock ACQUIRED — id=${lockRecord.id}`);
        } catch (e) {
            warn(`Lock management failed (non-fatal): ${e.message}`);
        }

        // Heartbeat — proves liveness to zombie detector
        if (lockRecord?.id) {
            heartbeatTimer = setInterval(() => {
                base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                    metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString() },
                }).catch(() => {});
            }, heartbeatMs);
        }
    }

    // ── Execute handler ────────────────────────────────────────────────────────
    let stats = {};
    let jobStatus = 'completed';
    let jobError = null;

    try {
        stats = await handler({ base44, instanceId, log, warn, error });
        log(`DONE — ${JSON.stringify(stats)}`);
    } catch (e) {
        jobStatus = 'failed';
        jobError = e.message;
        error(`FATAL — ${e.message}`);
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - runStartMs;

    // ── Cleanup lock ───────────────────────────────────────────────────────────
    clearInterval(heartbeatTimer);
    if (lockRecord?.id) {
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: jobStatus,
            completed_at: finishedAt,
            error_message: jobError,
            metadata: { instance_id: instanceId, ...stats, run_duration_ms: durationMs },
        }).catch(() => {});
    }

    const result = {
        success: jobStatus === 'completed',
        instance_id: instanceId,
        started_at: startedAt,
        finished_at: finishedAt,
        run_duration_ms: durationMs,
        ...stats,
        ...(jobError ? { error: jobError } : {}),
    };

    return Response.json(result, { status: jobStatus === 'failed' ? 500 : 200 });
}

// ─── Pipeline Health ──────────────────────────────────────────────────────────

/**
 * Classify pipeline health based on output metrics.
 *
 * @param {object} metrics  - Key metrics from the job run
 * @param {object} rules    - { healthy: fn(m), degraded: fn(m), stale: fn(m) }
 * @returns {'healthy'|'degraded'|'stale'|'failed'}
 */
export function classifyPipelineHealth(metrics, rules) {
    if (rules.healthy && rules.healthy(metrics)) return 'healthy';
    if (rules.stale   && rules.stale(metrics))   return 'stale';
    if (rules.degraded && rules.degraded(metrics)) return 'degraded';
    return 'failed';
}

/**
 * Write a named pipeline status record to SystemHealth for observability.
 * Uses a synthetic job_type of `pipeline_<name>`.
 *
 * @param {object} base44
 * @param {string} name           - Pipeline name (e.g. 'clustering', 'scoring')
 * @param {string} status         - 'healthy'|'degraded'|'stale'|'failed'
 * @param {object} metadata       - Metrics/details to store
 */
export async function writePipelineStatus(base44, name, status, metadata = {}) {
    try {
        // Find and close any prior open record for this pipeline
        const existing = await safeFilter(
            base44.asServiceRole.entities.SystemHealth,
            { job_type: `pipeline_${name}`, status: 'running' },
            '-started_at', 1
        );
        for (const rec of existing) {
            await base44.asServiceRole.entities.SystemHealth.update(rec.id, {
                status: 'completed',
                completed_at: new Date().toISOString(),
            }).catch(() => {});
        }

        await base44.asServiceRole.entities.SystemHealth.create({
            job_type: `pipeline_${name}`,
            status: status === 'healthy' ? 'completed' : status === 'failed' ? 'failed' : 'running',
            started_at: new Date().toISOString(),
            completed_at: status !== 'running' ? new Date().toISOString() : undefined,
            metadata: { pipeline_status: status, ...metadata },
        });
    } catch {}
}