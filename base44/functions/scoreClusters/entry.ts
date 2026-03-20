/**
 * scoreClusters — authority-weighted trend scoring for StoryClusters.
 *
 * Runs after clusterStories (or independently).
 * Reads active StoryCluster records + SourceAuthority table,
 * computes trend_score per cluster with full explainability,
 * and writes results back to StoryCluster.
 *
 * Also seeds/refreshes SourceAuthority records for any new domains.
 *
 * trend_score formula:
 *   importance_contrib  = importance_score × 0.35
 *   authority_contrib   = authority_weighted_source_count (normalized 0-25) × 0.30
 *   velocity_contrib    = velocity_score (0-100, normalized) × 0.20
 *   recency_contrib     = recency_factor (0-100, normalized) × 0.15
 *   raw = sum of above (0-100)
 *   penalty = low_authority_penalty (reduces score when cluster is repost-heavy but low-auth)
 *   trend_score = clamp(raw - penalty, 0, 100)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ── Authority tiers → scores ─────────────────────────────────────────────────
const TIER_SCORES = { tier1: 100, tier2: 50, tier3: 15 };
const DEFAULT_SCORE = 50;

// ── Known authority domains (auto-seeded, no manual setup required) ───────────
// tier1: established wire services, major financial/tech publishers
const TIER1_DOMAINS = new Set([
    'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'economist.com',
    'nytimes.com', 'washingtonpost.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
    'cnbc.com', 'forbes.com', 'businessinsider.com', 'marketwatch.com',
    'theguardian.com', 'axios.com', 'theatlantic.com', 'nature.com',
    'science.org', 'techcrunch.com', 'wired.com', 'arstechnica.com',
    'theinformation.com', 'morningstar.com', 'seekingalpha.com',
    'financialpost.com', 'theglobeandmail.com', 'cbc.ca', 'globeandmail.com',
]);

// tier3: known aggregators, content farms, social reposts
const TIER3_DOMAINS = new Set([
    'feedburner.com', 'yahoo.com', 'msn.com', 'aol.com', 'flipboard.com',
    'pocket.co', 'feedly.com', 'alltop.com', 'paperli.com', 'scoop.it',
    'tumblr.com', 'medium.com', 'substack.com', 'beehiiv.com',
]);

function domainToTier(domain) {
    if (TIER1_DOMAINS.has(domain)) return 'tier1';
    if (TIER3_DOMAINS.has(domain)) return 'tier3';
    return 'tier2';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Velocity score ────────────────────────────────────────────────────────────
// Articles per hour since first_seen_at, normalized to 0-100.
// Cap: 10+ articles/hour = score 100.
function computeVelocity(cluster) {
    if (!cluster.first_seen_at || !cluster.last_updated_at) return 0;
    const spanHours = Math.max(0.5,
        (new Date(cluster.last_updated_at).getTime() - new Date(cluster.first_seen_at).getTime()) / 3600000
    );
    const articlesPerHour = (cluster.article_count || 1) / spanHours;
    return Math.min(100, articlesPerHour * 10); // 10 art/hr → score 100
}

// ── Recency factor ────────────────────────────────────────────────────────────
// Based on last_updated_at. 0h old = 100, 48h old = 0. Linear decay.
function computeRecency(cluster) {
    if (!cluster.last_updated_at) return 0;
    const hoursOld = (Date.now() - new Date(cluster.last_updated_at).getTime()) / 3600000;
    return Math.max(0, 100 - (hoursOld / 48) * 100);
}

// ── Authority-weighted source count ──────────────────────────────────────────
// Each source contributes: tier1=1.0, tier2=0.5, tier3=0.15
// This is the effective source count preventing low-auth repost amplification.
function computeAuthorityWeightedCount(sourceDomains, authorityMap) {
    let weighted = 0;
    for (const domain of (sourceDomains || [])) {
        const auth = authorityMap[domain];
        const tier = auth?.tier || domainToTier(domain);
        weighted += tier === 'tier1' ? 1.0 : tier === 'tier3' ? 0.15 : 0.5;
    }
    return weighted;
}

// ── Low-authority penalty ─────────────────────────────────────────────────────
// If >70% of sources are tier3, apply a score penalty proportional to the excess.
function computeLowAuthPenalty(sourceDomains, authorityMap) {
    if (!sourceDomains?.length) return 0;
    const tier3Count = sourceDomains.filter(d => {
        const tier = authorityMap[d]?.tier || domainToTier(d);
        return tier === 'tier3';
    }).length;
    const tier3Ratio = tier3Count / sourceDomains.length;
    if (tier3Ratio <= 0.7) return 0;
    // Max penalty 25 points when 100% tier3 sources
    return Math.round((tier3Ratio - 0.7) / 0.3 * 25);
}

// ── Final trend score ─────────────────────────────────────────────────────────
function computeTrendScore(cluster, authorityMap) {
    const importance = cluster.importance_score ?? 50;
    const velocity = computeVelocity(cluster);
    const recency = computeRecency(cluster);
    const weightedCount = computeAuthorityWeightedCount(cluster.source_domains, authorityMap);
    // Normalize weighted count: cap at 5 effective sources = full contribution
    const authorityNorm = Math.min(100, weightedCount * 20); // 5 tier1 sources → 100
    const penalty = computeLowAuthPenalty(cluster.source_domains, authorityMap);

    const importance_contrib  = importance  * 0.35;
    const authority_contrib   = authorityNorm * 0.30;
    const velocity_contrib    = velocity    * 0.20;
    const recency_contrib     = recency     * 0.15;
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

    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch { /* scheduler */ }

    let body = {};
    try { body = await req.json(); } catch {}
    const dryRun = body.dry_run === true;

    const runStart = Date.now();

    // ── 1. Load active clusters ───────────────────────────────────────────────
    let clusters = [];
    try {
        clusters = await base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'active' }, '-last_updated_at', 500
        ) || [];
    } catch (e) {
        return Response.json({ error: `Failed to load clusters: ${e.message}` }, { status: 500 });
    }

    console.log(`[scoreClusters] Loaded ${clusters.length} active clusters`);

    // ── 2. Load existing SourceAuthority records ──────────────────────────────
    let existingAuth = [];
    try {
        existingAuth = await base44.asServiceRole.entities.SourceAuthority.list('-created_date', 500) || [];
    } catch {}

    const authorityMap = {}; // domain → SourceAuthority record
    for (const rec of existingAuth) {
        if (rec.domain) authorityMap[rec.domain] = rec;
    }

    // ── 3. Seed missing domains with auto-scores ──────────────────────────────
    const allDomains = new Set(clusters.flatMap(c => c.source_domains || []));
    const newDomains = [...allDomains].filter(d => !authorityMap[d]);

    if (!dryRun && newDomains.length > 0) {
        console.log(`[scoreClusters] Seeding ${newDomains.length} new domain authority records`);
        for (const domain of newDomains) {
            const tier = domainToTier(domain);
            const score = TIER_SCORES[tier] ?? DEFAULT_SCORE;
            try {
                const rec = await base44.asServiceRole.entities.SourceAuthority.create({
                    domain,
                    tier,
                    authority_score: score,
                    is_manual_override: false,
                    auto_score_basis: `known_${tier}`,
                    last_evaluated_at: new Date().toISOString(),
                });
                authorityMap[domain] = rec;
            } catch {}
            await sleep(50);
        }
    }

    // ── 4. Score all clusters ─────────────────────────────────────────────────
    const scored = clusters.map(cluster => ({
        cluster,
        scoring: computeTrendScore(cluster, authorityMap),
    }));

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

    // ── 5. Write scores back ──────────────────────────────────────────────────
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

    const summary = {
        clusters_scored: written,
        clusters_failed: failed,
        domains_seeded: newDomains.length,
        run_duration_ms: Date.now() - runStart,
    };
    console.log(`[scoreClusters] DONE — ${JSON.stringify(summary)}`);
    return Response.json({ success: true, ...summary });
});