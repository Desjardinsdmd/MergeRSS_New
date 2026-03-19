/**
 * Shared intelligence utilities for the dashboard components.
 */

/** Infer an intelligence tag from title/description text when AI hasn't enriched yet */
export function inferTag(text = '') {
    const t = text.toLowerCase();
    if (/\b(rise|rising|growth|grow|funding|launch|surge|gain|profit|opportu|upside|expand|acqui|deal|partner|ipo|raise)\b/.test(t)) return 'Opportunity';
    if (/\b(decline|drop|fall|risk|crash|loss|warn|danger|threat|vulnerab|breach|bankrupt|layoff|cut|recall|fine|sanction|fraud)\b/.test(t)) return 'Risk';
    return null;
}

/** Derive a short "Why it matters" line from an ai_summary or description */
export function whyItMatters(item) {
    const source = item.ai_summary || item.description || '';
    if (!source) return null;
    const clean = source.replace(/<[^>]+>/g, '').trim();
    // Try second sentence for "why" context, else first
    const sentences = clean.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 20);
    const candidate = sentences[1] || sentences[0];
    if (!candidate) return null;
    return candidate.length > 100 ? candidate.slice(0, 100) + '…' : candidate;
}

/** Get a short "what happened" summary — max 1 tight line */
export function whatHappened(item) {
    if (item.ai_summary) {
        const clean = item.ai_summary.replace(/<[^>]+>/g, '').trim();
        const first = clean.split(/[.!?]/)[0]?.trim();
        if (first && first.length > 15) return first.length > 120 ? first.slice(0, 120) + '…' : first;
    }
    if (item.description) {
        const clean = item.description.replace(/<[^>]+>/g, '').trim();
        const first = clean.split(/[.!?]/)[0]?.trim();
        if (first && first.length > 15) return first.length > 120 ? first.slice(0, 120) + '…' : first;
    }
    return null;
}

/** Truncate to ~2 lines of readable text */
export function summaryText(item) {
    if (item.ai_summary) return item.ai_summary;
    if (item.description) {
        const clean = item.description.replace(/<[^>]+>/g, '').trim();
        return clean.length > 240 ? clean.slice(0, 240) + '…' : clean;
    }
    return null;
}

/** Signal level label from importance score */
export function signalLevel(score) {
    if (score == null) return null;
    if (score >= 72) return 'HIGH';
    if (score >= 40) return 'MED';
    return 'LOW';
}

export function signalLevelStyle(score) {
    if (score == null) return null;
    if (score >= 72) return { label: 'HIGH', class: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/30' };
    if (score >= 40) return { label: 'MED',  class: 'text-blue-400 bg-blue-950 border-blue-800' };
    return                  { label: 'LOW',  class: 'text-stone-500 bg-stone-800 border-stone-700' };
}

/** Normalize a title for similarity comparison */
function normalizeTitle(title = '') {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Jaccard similarity between two normalized title strings */
function titleSimilarity(a, b) {
    const setA = new Set(a.split(' ').filter(w => w.length > 3));
    const setB = new Set(b.split(' ').filter(w => w.length > 3));
    if (!setA.size || !setB.size) return 0;
    let shared = 0;
    for (const w of setA) if (setB.has(w)) shared++;
    return shared / (setA.size + setB.size - shared);
}

/**
 * Cluster items by similar titles. Returns an array of clusters:
 * [{ primary: item, duplicates: item[], allSources: string[] }]
 * Primary = highest importance_score in cluster.
 * Threshold: 0.45 for clustering (fairly aggressive — catches same story across sources).
 */
export function clusterItems(items, feedMap = {}) {
    const THRESHOLD = 0.45;
    const clusters = [];
    const assigned = new Set();

    // Sort by score desc so the best article becomes the cluster primary
    const sorted = [...items].sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0));

    for (const item of sorted) {
        if (assigned.has(item.id)) continue;
        assigned.add(item.id);

        const normA = normalizeTitle(item.title);
        const cluster = { primary: item, duplicates: [] };

        for (const other of sorted) {
            if (assigned.has(other.id)) continue;
            const normB = normalizeTitle(other.title);
            if (titleSimilarity(normA, normB) >= THRESHOLD) {
                cluster.duplicates.push(other);
                assigned.add(other.id);
            }
        }

        // Collect source names
        const allItems = [item, ...cluster.duplicates];
        cluster.allSources = [...new Set(
            allItems.map(i => feedMap[i.feed_id]?.name).filter(Boolean)
        )];

        clusters.push(cluster);
    }

    return clusters;
}

/**
 * Simple dedup for Top 5 — keep highest-scored item per cluster.
 * Also enforces source diversity: max 2 items per feed source.
 */
export function deduplicateItems(items, feedMap = {}) {
    const clusters = clusterItems(items, feedMap);
    const sourceCounts = {};
    const result = [];

    for (const { primary } of clusters) {
        const sourceName = feedMap[primary.feed_id]?.name || primary.feed_id;
        const count = sourceCounts[sourceName] || 0;
        if (count >= 2) continue; // source diversity cap
        sourceCounts[sourceName] = count + 1;
        result.push(primary);
    }

    return result;
}