/**
 * Shared intelligence utilities for the dashboard components.
 */

/** Infer an intelligence tag from title/description text when AI hasn't enriched yet */
export function inferTag(text = '') {
    const t = text.toLowerCase();
    if (/\b(rise|rising|growth|grow|funding|launch|surge|gain|profit|opportu|upside|expand|acqui)\b/.test(t)) return 'Opportunity';
    if (/\b(decline|drop|fall|risk|crash|loss|warn|danger|threat|vulnerab|breach|bankrupt|layoff|cut)\b/.test(t)) return 'Risk';
    return null; // caller decides Trending or Neutral
}

/** Derive a short "Why it matters" line from an ai_summary or description */
export function whyItMatters(item) {
    const source = item.ai_summary || item.description || '';
    if (!source) return null;
    // Take first sentence
    const first = source.split(/[.!?]/)[0]?.trim();
    if (!first || first.length < 20) return source.slice(0, 120).trim();
    return first.length > 120 ? first.slice(0, 120) + '…' : first;
}

/** Truncate to ~2 lines of readable text */
export function summaryText(item) {
    if (item.ai_summary) return item.ai_summary;
    if (item.description) {
        const clean = item.description.replace(/<[^>]+>/g, '').trim();
        return clean.length > 280 ? clean.slice(0, 280) + '…' : clean;
    }
    return null;
}

/** Fuzzy deduplicate items: keep the highest-scored item per cluster */
export function deduplicateItems(items) {
    const used = new Set();
    const result = [];

    // Sort so highest importance_score comes first in each cluster
    const sorted = [...items].sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0));

    for (const item of sorted) {
        const titleWords = normalizeTitle(item.title);
        let matched = false;
        for (const u of used) {
            if (similarity(titleWords, u) > 0.55) { matched = true; break; }
        }
        if (!matched) {
            used.add(titleWords);
            result.push(item);
        }
    }
    return result;
}

function normalizeTitle(title = '') {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
    const setA = new Set(a.split(' ').filter(w => w.length > 3));
    const setB = new Set(b.split(' ').filter(w => w.length > 3));
    if (!setA.size || !setB.size) return 0;
    let shared = 0;
    for (const w of setA) if (setB.has(w)) shared++;
    return shared / Math.max(setA.size, setB.size);
}