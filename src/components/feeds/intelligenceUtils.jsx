/**
 * Intelligence utilities — insight generation, clustering, signal scoring.
 */

// ─── Tag inference ────────────────────────────────────────────────────────────

export function inferTag(text = '') {
    const t = text.toLowerCase();
    if (/\b(rise|rising|growth|grow|funding|launch|surge|gain|profit|opportu|upside|expand|acqui|deal|partner|ipo|raise|record|beat|exceed)\b/.test(t)) return 'Opportunity';
    if (/\b(decline|drop|fall|risk|crash|loss|warn|danger|threat|vulnerab|breach|bankrupt|layoff|cut|recall|fine|sanction|fraud|miss|below)\b/.test(t)) return 'Risk';
    return null;
}

// ─── Insight layer ("Why it matters") ────────────────────────────────────────
// Rules: must NOT restate the summary. Must answer: what changes, what signal,
// what might happen next, why it matters to someone.

const MACRO_PATTERNS = [
    { re: /\b(interest rate|fed|federal reserve|central bank|rate hike|rate cut)\b/i,       insight: 'Signals potential shift in borrowing costs and capital allocation' },
    { re: /\b(inflation|cpi|pce|price index)\b/i,                                           insight: 'Could influence Fed policy trajectory and consumer spending outlook' },
    { re: /\b(gdp|recession|contraction|economic growth)\b/i,                               insight: 'Indicates macro cycle positioning and risk appetite across markets' },
    { re: /\b(layoff|job cut|workforce reduction|reduct)\b/i,                               insight: 'Signals cost-pressure response — watch for sector contagion' },
    { re: /\b(ipo|public offering|listing)\b/i,                                             insight: 'Tests risk appetite and may set valuation benchmarks for peers' },
    { re: /\b(acqui|merger|takeover|buyout)\b/i,                                            insight: 'Could reshape competitive dynamics and trigger re-rating of peers' },
    { re: /\b(funding|series [a-e]|raise|venture|investment round)\b/i,                     insight: 'Signals investor conviction in the sector — watch for follow-on activity' },
    { re: /\b(regulation|regulator|sec |fca |compliance|policy change|legislation)\b/i,     insight: 'Indicates regulatory tightening trend — compliance costs likely to rise' },
    { re: /\b(sanction|tariff|trade war|export control)\b/i,                                insight: 'Supply chain and margin pressure likely; watch for geopolitical escalation' },
    { re: /\b(ai |artificial intelligence|llm|model release|foundation model)\b/i,          insight: 'May compress incumbent margins and accelerate platform disruption' },
    { re: /\b(real estate|reit|commercial property|housing|rent|mortgage)\b/i,              insight: 'Demand-supply imbalance indicator — rate sensitivity will determine direction' },
    { re: /\b(crypto|bitcoin|ethereum|blockchain|defi|token)\b/i,                           insight: 'Reflects risk-on sentiment and institutional positioning in digital assets' },
    { re: /\b(earnings|revenue|profit|quarterly results|beat|miss)\b/i,                     insight: 'Sets near-term guidance expectations and sector multiple revisions' },
    { re: /\b(supply chain|shortage|inventory|logistics)\b/i,                               insight: 'Input cost and delivery time pressure signals downstream pricing risk' },
    { re: /\b(climate|carbon|esg|sustainability|net zero)\b/i,                              insight: 'Regulatory and capital allocation shifts likely to accelerate here' },
    { re: /\b(election|government|political|geopolit)\b/i,                                  insight: 'Political uncertainty typically compresses risk premiums — monitor closely' },
    { re: /\b(bank|credit|lending|loan|default)\b/i,                                        insight: 'Credit cycle indicator — tightening conditions affect broad capital access' },
    { re: /\b(energy|oil|gas|power grid|electricity)\b/i,                                   insight: 'Energy cost shifts feed through to inflation and operating margins broadly' },
];

/**
 * Generate a sharp, non-redundant insight for why a story matters.
 * Prioritizes pattern matching on macro themes, falls back to tag-based inference.
 * Never repeats the summary.
 */
export function generateInsight(item) {
    const text = ((item.title || '') + ' ' + (item.description || '') + ' ' + (item.ai_summary || '')).toLowerCase();

    // Try macro pattern matching first (most decisive)
    for (const { re, insight } of MACRO_PATTERNS) {
        if (re.test(text)) return insight;
    }

    // Tag-based fallback — still decisive, not generic
    const tag = item.intelligence_tag || inferTag(text);
    if (tag === 'Risk')        return 'Downside signal — assess exposure and watch for confirmation';
    if (tag === 'Opportunity') return 'Early-stage upside signal — monitor for follow-through';
    if (tag === 'Trending')    return 'Broad coverage suggests emerging consensus forming';

    return null; // show nothing if we can't be precise
}

// ─── What happened (1-line summary) ──────────────────────────────────────────

export function whatHappened(item) {
    const src = item.ai_summary || item.description || '';
    if (!src) return null;
    const clean = src.replace(/<[^>]+>/g, '').trim();
    const first = clean.split(/[.!?]/)[0]?.trim();
    if (!first || first.length < 15) return null;
    return first.length > 140 ? first.slice(0, 140) + '…' : first;
}

// ─── Signal level styling ─────────────────────────────────────────────────────

export function signalLevelStyle(score) {
    if (score == null) return null;
    if (score >= 72) return { label: 'HIGH', class: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/40 font-black' };
    if (score >= 40) return { label: 'MED',  class: 'text-blue-400 bg-blue-950 border-blue-800 font-bold' };
    return                  { label: 'LOW',  class: 'text-stone-500 bg-stone-800 border-stone-700' };
}

// ─── Signal confidence (from cluster size) ────────────────────────────────────

export function confidenceFromCluster(clusterSize = 1) {
    if (clusterSize >= 3) return { label: 'HIGH CONF', class: 'text-emerald-400' };
    if (clusterSize === 2) return { label: 'MED CONF',  class: 'text-stone-400' };
    return                         { label: 'LOW CONF',  class: 'text-stone-600' };
}

// ─── Title normalization & clustering ────────────────────────────────────────

function normalizeTitle(title = '') {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a, b) {
    const setA = new Set(a.split(' ').filter(w => w.length > 3));
    const setB = new Set(b.split(' ').filter(w => w.length > 3));
    if (!setA.size || !setB.size) return 0;
    let shared = 0;
    for (const w of setA) if (setB.has(w)) shared++;
    return shared / (setA.size + setB.size - shared);
}

/**
 * Cluster items by title similarity.
 * Returns: [{ primary, duplicates, allSources, clusterSize }]
 */
export function clusterItems(items, feedMap = {}) {
    const THRESHOLD = 0.45;
    const clusters = [];
    const assigned = new Set();

    const sorted = [...items].sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0));

    for (const item of sorted) {
        if (assigned.has(item.id)) continue;
        assigned.add(item.id);

        const normA = normalizeTitle(item.title);
        const cluster = { primary: item, duplicates: [] };

        for (const other of sorted) {
            if (assigned.has(other.id)) continue;
            if (titleSimilarity(normA, normalizeTitle(other.title)) >= THRESHOLD) {
                cluster.duplicates.push(other);
                assigned.add(other.id);
            }
        }

        const allItems = [item, ...cluster.duplicates];
        cluster.clusterSize = allItems.length;
        cluster.allSources = [...new Set(allItems.map(i => feedMap[i.feed_id]?.name).filter(Boolean))];
        clusters.push(cluster);
    }

    return clusters;
}

/**
 * Deduplicate for Top 5: max 1 per cluster, max 1 per source.
 */
export function deduplicateItems(items, feedMap = {}) {
    const clusters = clusterItems(items, feedMap);
    const sourceSeen = new Set();
    const result = [];

    for (const { primary } of clusters) {
        const sourceName = feedMap[primary.feed_id]?.name || primary.feed_id;
        if (sourceSeen.has(sourceName)) continue;
        sourceSeen.add(sourceName);
        result.push(primary);
    }

    return result;
}