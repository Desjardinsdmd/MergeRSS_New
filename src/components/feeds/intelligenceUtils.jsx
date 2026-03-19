/**
 * Intelligence utilities — insight generation, clustering, signal scoring, decision state.
 */

// ─── Tag inference ────────────────────────────────────────────────────────────

export function inferTag(text = '') {
    const t = text.toLowerCase();
    if (/\b(rise|rising|growth|grow|funding|launch|surge|gain|profit|opportu|upside|expand|acqui|deal|partner|ipo|raise|record|beat|exceed)\b/.test(t)) return 'Opportunity';
    if (/\b(decline|drop|fall|risk|crash|loss|warn|danger|threat|vulnerab|breach|bankrupt|layoff|cut|recall|fine|sanction|fraud|miss|below)\b/.test(t)) return 'Risk';
    return null;
}

// ─── Insight layer ────────────────────────────────────────────────────────────

const MACRO_PATTERNS = [
    { re: /\b(interest rate|fed|federal reserve|central bank|rate hike|rate cut)\b/i,       insight: 'Signals shift in borrowing costs and capital allocation' },
    { re: /\b(inflation|cpi|pce|price index)\b/i,                                           insight: 'Could redirect Fed policy and consumer spending outlook' },
    { re: /\b(gdp|recession|contraction|economic growth)\b/i,                               insight: 'Indicates macro cycle positioning and risk appetite' },
    { re: /\b(layoff|job cut|workforce reduction)\b/i,                                      insight: 'Signals cost-pressure response — watch for sector contagion' },
    { re: /\b(ipo|public offering|listing)\b/i,                                             insight: 'Tests risk appetite and sets valuation benchmarks for peers' },
    { re: /\b(acqui|merger|takeover|buyout)\b/i,                                            insight: 'Reshapes competitive dynamics — peer re-rating likely' },
    { re: /\b(funding|series [a-e]|raise|venture|investment round)\b/i,                     insight: 'Signals investor conviction — watch for follow-on activity' },
    { re: /\b(regulation|regulator|sec |fca |compliance|policy change|legislation)\b/i,     insight: 'Regulatory tightening trend — compliance costs likely to rise' },
    { re: /\b(sanction|tariff|trade war|export control)\b/i,                                insight: 'Supply chain and margin pressure; geopolitical escalation risk' },
    { re: /\b(ai |artificial intelligence|llm|model release|foundation model)\b/i,          insight: 'Could compress incumbent margins and accelerate disruption' },
    { re: /\b(real estate|reit|commercial property|housing|rent|mortgage)\b/i,              insight: 'Rate sensitivity will determine near-term direction' },
    { re: /\b(crypto|bitcoin|ethereum|blockchain|defi|token)\b/i,                           insight: 'Reflects risk-on sentiment and institutional positioning' },
    { re: /\b(earnings|revenue|profit|quarterly results|beat|miss)\b/i,                     insight: 'Sets guidance expectations and sector multiple revisions' },
    { re: /\b(supply chain|shortage|inventory|logistics)\b/i,                               insight: 'Downstream pricing risk from input cost and delivery pressure' },
    { re: /\b(climate|carbon|esg|sustainability|net zero)\b/i,                              insight: 'Capital allocation shifts likely to accelerate here' },
    { re: /\b(election|government|political|geopolit)\b/i,                                  insight: 'Political uncertainty compresses risk premiums — monitor' },
    { re: /\b(bank|credit|lending|loan|default)\b/i,                                        insight: 'Credit cycle signal — tightening affects broad capital access' },
    { re: /\b(energy|oil|gas|power grid|electricity)\b/i,                                   insight: 'Energy cost shifts feed into inflation and operating margins' },
];

export function generateInsight(item) {
    const text = ((item.title || '') + ' ' + (item.description || '') + ' ' + (item.ai_summary || '')).toLowerCase();
    for (const { re, insight } of MACRO_PATTERNS) {
        if (re.test(text)) return insight;
    }
    const tag = item.intelligence_tag || inferTag(text);
    if (tag === 'Risk')        return 'Downside signal — assess exposure and watch for confirmation';
    if (tag === 'Opportunity') return 'Upside signal — monitor for follow-through';
    if (tag === 'Trending')    return 'Broad coverage suggests emerging consensus';
    return null;
}

// ─── What happened (tight 1-line) ────────────────────────────────────────────

export function whatHappened(item) {
    const src = item.ai_summary || item.description || '';
    if (!src) return null;
    const clean = src.replace(/<[^>]+>/g, '').trim();
    const first = clean.split(/[.!?]/)[0]?.trim();
    if (!first || first.length < 15) return null;
    // Cap tightly at 100 chars for scan speed
    return first.length > 100 ? first.slice(0, 100) + '…' : first;
}

// ─── Signal level ─────────────────────────────────────────────────────────────

export function signalLevelStyle(score) {
    if (score == null) return null;
    if (score >= 72) return { label: 'HIGH', class: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/40 font-black' };
    if (score >= 40) return { label: 'MED',  class: 'text-blue-400 bg-blue-950 border-blue-800 font-bold' };
    return                  { label: 'LOW',  class: 'text-stone-500 bg-stone-800 border-stone-700' };
}

// ─── Confidence (human language) ─────────────────────────────────────────────

export function confidenceFromCluster(clusterSize = 1) {
    if (clusterSize >= 3) return { label: 'Validated',   class: 'text-emerald-400 font-semibold', dot: 'bg-emerald-400' };
    if (clusterSize === 2) return { label: 'Building',    class: 'text-sky-400',                   dot: 'bg-sky-400' };
    return                         { label: 'Early',       class: 'text-stone-500',                 dot: 'bg-stone-600' };
}

// ─── Decision state ───────────────────────────────────────────────────────────
// Combines signal + confidence + recency into a single user-facing action state.

export function decisionState(item, clusterSize = 1) {
    const score = item.importance_score ?? 0;
    const ageHours = item.published_date
        ? (Date.now() - new Date(item.published_date).getTime()) / 3600000
        : 99;
    const isRecent = ageHours < 12;

    // HIGH signal
    if (score >= 72) {
        if (clusterSize >= 3) return { label: 'Important',      style: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15 border-[hsl(var(--primary))]/40', priority: 4 };
        if (clusterSize === 2) return { label: 'Important',      style: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/30', priority: 3 };
        return                        { label: 'Early Signal',   style: 'text-amber-400 bg-amber-950/40 border-amber-800/50',                                      priority: 2 };
    }

    // MED signal
    if (score >= 40) {
        if (clusterSize >= 2) return   { label: 'Watch',         style: 'text-sky-400 bg-sky-950/30 border-sky-800/40',                                            priority: 2 };
        return                         { label: 'Watch',         style: 'text-stone-400 bg-stone-800/50 border-stone-700',                                         priority: 1 };
    }

    // LOW signal
    return                             { label: 'Low Priority',  style: 'text-stone-600 bg-stone-800/30 border-stone-800',                                         priority: 0 };
}

// ─── Clustering ───────────────────────────────────────────────────────────────

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