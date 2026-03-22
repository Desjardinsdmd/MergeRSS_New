/**
 * scoreClusters — authority-weighted trend scoring for StoryClusters.
 *
 * Architecture patterns enforced (see functions/lib.js):
 *   [1] extractItems / safeFilter — safe array extraction
 *   [2] requireAdminOrScheduler   — consistent auth
 *   [3] Lock + heartbeat           — job execution framework
 *   [4] Pipeline health classification — zero scored ≠ success if clusters exist
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

async function safeList(entity, sort, limit = 500) {
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
function makeRunId() { return `score_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

const LOCK_WINDOW_MS = 8 * 60 * 1000;
const ZOMBIE_TTL_MS  = 15 * 60 * 1000;

// ── Authority tiers ───────────────────────────────────────────────────────────
const TIER_SCORES = { tier1: 100, tier2: 50, tier3: 15 };
const DEFAULT_SCORE = 50;

const TIER1_DOMAINS = new Set([
    'reuters.com','bloomberg.com','ft.com','wsj.com','economist.com',
    'nytimes.com','washingtonpost.com','apnews.com','bbc.com','bbc.co.uk',
    'cnbc.com','forbes.com','businessinsider.com','marketwatch.com',
    'theguardian.com','axios.com','theatlantic.com','nature.com',
    'science.org','techcrunch.com','wired.com','arstechnica.com',
    'theinformation.com','morningstar.com','seekingalpha.com',
    'financialpost.com','theglobeandmail.com','cbc.ca','globeandmail.com',
]);
const TIER3_DOMAINS = new Set([
    'feedburner.com','yahoo.com','msn.com','aol.com','flipboard.com',
    'pocket.co','feedly.com','alltop.com','paperli.com','scoop.it',
    'tumblr.com','medium.com','substack.com','beehiiv.com',
]);

function domainToTier(domain) {
    if (TIER1_DOMAINS.has(domain)) return 'tier1';
    if (TIER3_DOMAINS.has(domain)) return 'tier3';
    return 'tier2';
}

function computeVelocity(cluster) {
    if (!cluster.first_seen_at || !cluster.last_updated_at) return 0;
    const spanHours = Math.max(0.5,
        (new Date(cluster.last_updated_at).getTime() - new Date(cluster.first_seen_at).getTime()) / 3600000
    );
    return Math.min(100, ((cluster.article_count || 1) / spanHours) * 10);
}

function computeRecency(cluster) {
    if (!cluster.last_updated_at) return 0;
    const hoursOld = (Date.now() - new Date(cluster.last_updated_at).getTime()) / 3600000;
    return Math.max(0, 100 - (hoursOld / 48) * 100);
}

function computeAuthorityWeightedCount(sourceDomains, authorityMap) {
    let weighted = 0;
    for (const domain of (sourceDomains || [])) {
        const tier = authorityMap[domain]?.tier || domainToTier(domain);
        weighted += tier === 'tier1' ? 1.0 : tier === 'tier3' ? 0.15 : 0.5;
    }
    return weighted;
}

function computeLowAuthPenalty(sourceDomains, authorityMap) {
    if (!sourceDomains?.length) return 0;
    const tier3Count = sourceDomains.filter(d => {
        const tier = authorityMap[d]?.tier || domainToTier(d);
        return tier === 'tier3';
    }).length;
    const tier3Ratio = tier3Count / sourceDomains.length;
    if (tier3Ratio <= 0.7) return 0;
    return Math.round((tier3Ratio - 0.7) / 0.3 * 25);
}

function computeTrendScore(cluster, authorityMap) {
    const importance = cluster.importance_score ?? 50;
    const velocity = computeVelocity(cluster);
    const recency = computeRecency(cluster);
    const weightedCount = computeAuthorityWeightedCount(cluster.source_domains, authorityMap);
    const authorityNorm = Math.min(100, weightedCount * 20);
    const penalty = computeLowAuthPenalty(cluster.source_domains, authorityMap);
    const importance_contrib  = importance    * 0.35;
    const authority_contrib   = authorityNorm * 0.30;
    const velocity_contrib    = velocity      * 0.20;
    const recency_contrib     = recency       * 0.15;
    const raw = importance_contrib + authority_contrib + velocity_contrib + recency_contrib;
    const trend_score = Math.round(Math.max(0, Math.min(100, raw - penalty)));
    return {
        trend_score,
        authority_weighted_source_count: Math.round(weightedCount * 100) / 100,
        velocity_score: Math.round(velocity),
        trend_score_components: {
            importance_contrib:  Math.round(importance_contrib * 10) / 10,
            authority_contrib:   Math.round(authority_contrib * 10) / 10,
            velocity_contrib:    Math.round(velocity_contrib * 10) / 10,
            recency_contrib:     Math.round(recency_contrib * 10) / 10,
            low_auth_penalty:    penalty,
            raw_before_penalty:  Math.round(raw * 10) / 10,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    let base44;
    try {
        base44 = createClientFromRequest(req);
    } catch {
        const { createClient } = await import('npm:@base44/sdk@0.8.21');
        base44 = createClient();
    }

    const { error: authError } = await requireAdminOrScheduler(base44);
    if (authError) return authError;

    let body = {};
    try { body = await req.json(); } catch {}
    const dryRun = body.dry_run === true;
    const instanceId = makeRunId();
    const runStart = Date.now();

    // ── Lock ──────────────────────────────────────────────────────────────────
    if (!dryRun) {
        const activeLocks = await safeFilter(
            base44.asServiceRole.entities.SystemHealth,
            { job_type: 'scoring', status: 'running' },
            '-started_at', 5
        );
        for (const stale of activeLocks) {
            const age = Date.now() - new Date(stale.started_at).getTime();
            if (age >= ZOMBIE_TTL_MS) {
                await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                    status: 'failed', completed_at: new Date().toISOString(),
                    error_message: `Zombie reclaimed by ${instanceId}`,
                }).catch(() => {});
            }
        }
        const liveLock = activeLocks.find(r => {
            const age = Date.now() - new Date(r.started_at).getTime();
            return age < LOCK_WINDOW_MS;
        });
        if (liveLock) {
            return Response.json({ skipped: true, reason: 'Another scoring run is active' });
        }
    }

    let lockRecord = null;
    let heartbeatTimer = null;
    if (!dryRun) {
        try {
            lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
                job_type: 'scoring', status: 'running',
                started_at: new Date().toISOString(),
                metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString() },
            });
            heartbeatTimer = setInterval(() => {
                base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                    metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString() },
                }).catch(() => {});
            }, 60000);
        } catch {}
    }

    // ── 1. Load active clusters ───────────────────────────────────────────────
    const clusters = await safeFilter(
        base44.asServiceRole.entities.StoryCluster,
        { status: 'active' }, '-last_updated_at', 500
    );

    console.log(`[scoreClusters][${instanceId}] Loaded ${clusters.length} active clusters`);

    // ── Pipeline health: zero clusters is DEGRADED (upstream data issue) ──────
    if (clusters.length === 0) {
        clearInterval(heartbeatTimer);
        if (lockRecord?.id) {
            await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                status: 'completed', completed_at: new Date().toISOString(),
                metadata: {
                    instance_id: instanceId, clusters_scored: 0,
                    pipeline_health: 'degraded',
                    pipeline_note: 'No active clusters found — check clusterStories upstream',
                },
            }).catch(() => {});
        }
        return Response.json({
            success: true,
            pipeline_health: 'degraded',
            message: 'No active clusters — check clusterStories upstream',
            clusters_scored: 0,
            clusters_failed: 0,
            domains_seeded: 0,
            run_duration_ms: Date.now() - runStart,
        });
    }

    // ── 2. Load existing SourceAuthority records ──────────────────────────────
    const existingAuth = await safeList(base44.asServiceRole.entities.SourceAuthority, '-created_date', 500);
    const authorityMap = {};
    for (const rec of existingAuth) {
        if (rec.domain) authorityMap[rec.domain] = rec;
    }

    // ── 3. Seed missing domains ───────────────────────────────────────────────
    const allDomains = new Set(clusters.flatMap(c => c.source_domains || []));
    const newDomains = [...allDomains].filter(d => !authorityMap[d]);

    if (!dryRun && newDomains.length > 0) {
        console.log(`[scoreClusters][${instanceId}] Seeding ${newDomains.length} new domain authority records`);
        for (const domain of newDomains) {
            const tier = domainToTier(domain);
            try {
                const rec = await base44.asServiceRole.entities.SourceAuthority.create({
                    domain, tier,
                    authority_score: TIER_SCORES[tier] ?? DEFAULT_SCORE,
                    is_manual_override: false,
                    auto_score_basis: `known_${tier}`,
                    last_evaluated_at: new Date().toISOString(),
                });
                authorityMap[domain] = rec;
            } catch {}
            await sleep(50);
        }
    }

    // ── 4. Compute scores ─────────────────────────────────────────────────────
    const scored = clusters.map(cluster => ({ cluster, scoring: computeTrendScore(cluster, authorityMap) }));

    if (dryRun) {
        const preview = scored
            .sort((a, b) => b.scoring.trend_score - a.scoring.trend_score)
            .slice(0, 20)
            .map(({ cluster, scoring }) => ({
                title: cluster.representative_title,
                importance_score: cluster.importance_score,
                trend_score: scoring.trend_score,
                source_count: cluster.source_count,
                authority_weighted: scoring.authority_weighted_source_count,
                components: scoring.trend_score_components,
            }));
        return Response.json({ dry_run: true, total_clusters: clusters.length, preview });
    }

    // ── 5. Write scores — sequential with delay to avoid rate limits ──────────
    let written = 0, failed = 0;
    for (const { cluster, scoring } of scored) {
        try {
            await base44.asServiceRole.entities.StoryCluster.update(cluster.id, {
                trend_score: scoring.trend_score,
                trend_score_components: scoring.trend_score_components,
                authority_weighted_source_count: scoring.authority_weighted_source_count,
                velocity_score: scoring.velocity_score,
            });
            written++;
        } catch { failed++; }
        await sleep(60);
    }

    // ── Pipeline health classification ────────────────────────────────────────
    const pipelineHealth = written > 0 ? 'healthy' : 'degraded';

    const summary = {
        clusters_scored: written,
        clusters_failed: failed,
        domains_seeded: newDomains.length,
        run_duration_ms: Date.now() - runStart,
        pipeline_health: pipelineHealth,
        instance_id: instanceId,
    };

    console.log(`[scoreClusters][${instanceId}] DONE — ${JSON.stringify(summary)}`);

    clearInterval(heartbeatTimer);
    if (lockRecord?.id) {
        // Distinguish execution failure (wrote 0 of N clusters) from degraded data state
        // (all writes failed vs no clusters existed upstream — handled separately above)
        const lockStatus = failed > 0 && written === 0 ? 'failed' : 'completed';
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: lockStatus,
            completed_at: new Date().toISOString(),
            metadata: summary,
        }).catch(() => {});
    }

    return Response.json({ success: true, ...summary });
});