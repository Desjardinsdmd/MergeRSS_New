/**
 * trendScoring — client-side cluster ranking utilities.
 *
 * Mirrors the server-side scoreClusters logic for UI-side sorting
 * when persisted trend_score is unavailable (new articles, lag window).
 *
 * Primary sort key: persisted trend_score (from scoreClusters backend).
 * Fallback: client-computed estimate using same formula sans authority DB.
 */

const TIER_SCORES = { tier1: 100, tier2: 50, tier3: 15 };

// Tier1 domains for client-side fallback (subset of server list)
const TIER1_SET = new Set([
    'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'economist.com',
    'nytimes.com', 'washingtonpost.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
    'cnbc.com', 'forbes.com', 'marketwatch.com', 'theguardian.com', 'axios.com',
    'techcrunch.com', 'wired.com', 'arstechnica.com', 'cbc.ca', 'financialpost.com',
    'theglobeandmail.com',
]);

const TIER3_SET = new Set([
    'yahoo.com', 'msn.com', 'feedburner.com', 'flipboard.com', 'tumblr.com',
]);

function extractDomain(url = '') {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return ''; }
}

function domainTier(domain) {
    if (TIER1_SET.has(domain)) return 'tier1';
    if (TIER3_SET.has(domain)) return 'tier3';
    return 'tier2';
}

function authorityWeightedCount(sourceDomains = []) {
    return sourceDomains.reduce((sum, d) => {
        const t = domainTier(d);
        return sum + (t === 'tier1' ? 1.0 : t === 'tier3' ? 0.15 : 0.5);
    }, 0);
}

function velocityScore(cluster) {
    if (!cluster.first_seen_at || !cluster.last_updated_at) return 0;
    const spanHours = Math.max(0.5,
        (new Date(cluster.last_updated_at) - new Date(cluster.first_seen_at)) / 3600000
    );
    return Math.min(100, ((cluster.article_count || 1) / spanHours) * 10);
}

function recencyScore(cluster) {
    if (!cluster.last_updated_at) return 0;
    const hoursOld = (Date.now() - new Date(cluster.last_updated_at)) / 3600000;
    return Math.max(0, 100 - (hoursOld / 48) * 100);
}

/**
 * Sort clusters by trend_score (persisted) or estimate it client-side.
 */
export function rankClusters(clusters) {
    return [...clusters].sort((a, b) => {
        const scoreA = a.trend_score ?? estimateTrendScore(a);
        const scoreB = b.trend_score ?? estimateTrendScore(b);
        return scoreB - scoreA;
    });
}

/**
 * Client-side trend score estimate (no authority DB lookup).
 * Used only when persisted trend_score is absent.
 */
export function estimateTrendScore(cluster) {
    const importance   = cluster.importance_score ?? 50;
    const weightedCount = authorityWeightedCount(cluster.source_domains || []);
    const authorityNorm = Math.min(100, weightedCount * 20);
    const velocity      = cluster.velocity_score ?? velocityScore(cluster);
    const recency       = recencyScore(cluster);

    return Math.round(
        importance  * 0.35 +
        authorityNorm * 0.30 +
        velocity    * 0.20 +
        recency     * 0.15
    );
}

/**
 * Authority tier for a domain (client-side).
 */
export function getDomainTier(domain) {
    return domainTier(domain);
}

/**
 * Human-readable tier label.
 */
export const TIER_LABELS = {
    tier1: { label: 'Tier 1', color: 'text-amber-400', bg: 'bg-amber-900/20', desc: 'High authority' },
    tier2: { label: 'Tier 2', color: 'text-sky-400',   bg: 'bg-sky-900/20',   desc: 'Medium' },
    tier3: { label: 'Tier 3', color: 'text-stone-500', bg: 'bg-stone-800',    desc: 'Low signal' },
};

/**
 * Explainability breakdown for display. Returns same shape as trend_score_components.
 */
export function explainTrendScore(cluster) {
    if (cluster.trend_score_components) return cluster.trend_score_components;
    // Client-side estimate
    const importance     = cluster.importance_score ?? 50;
    const weightedCount  = authorityWeightedCount(cluster.source_domains || []);
    const authorityNorm  = Math.min(100, weightedCount * 20);
    const velocity       = cluster.velocity_score ?? velocityScore(cluster);
    const recency        = recencyScore(cluster);
    return {
        importance_contrib:  Math.round(importance  * 0.35 * 10) / 10,
        authority_contrib:   Math.round(authorityNorm * 0.30 * 10) / 10,
        velocity_contrib:    Math.round(velocity    * 0.20 * 10) / 10,
        recency_contrib:     Math.round(recency     * 0.15 * 10) / 10,
        low_auth_penalty:    0,
        raw_before_penalty:  Math.round(estimateTrendScore(cluster) * 10) / 10,
    };
}