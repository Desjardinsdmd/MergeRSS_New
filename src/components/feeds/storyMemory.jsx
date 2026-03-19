/**
 * storyMemory.js
 * Client-side persistence layer for story evolution tracking.
 * Stores cluster fingerprints in localStorage so we can detect
 * momentum, progression, and confidence changes across visits.
 *
 * Schema (per fingerprint key):
 * {
 *   firstSeenAt: ISO string,
 *   lastSeenAt: ISO string,
 *   sizes: number[],           // last N cluster sizes (ring buffer, max 10)
 *   prevDecisionLabel: string, // last recorded decision state label
 *   prevConfidenceLabel: string,
 *   interactionScore: number,  // accumulated click/save weight
 * }
 */

const MEMORY_KEY = 'mergerss_story_memory_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — prune stale entries

// ─── Fingerprinting ───────────────────────────────────────────────────────────

/** Derive a stable key from a title: keep only meaningful words */
export function fingerprint(title = '') {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 6)
        .sort()
        .join('_');
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadMemory() {
    try {
        const raw = localStorage.getItem(MEMORY_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveMemory(mem) {
    try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
    } catch {}
}

function pruneMemory(mem) {
    const cutoff = Date.now() - MAX_AGE_MS;
    const pruned = {};
    for (const [k, v] of Object.entries(mem)) {
        if (new Date(v.lastSeenAt).getTime() > cutoff) pruned[k] = v;
    }
    return pruned;
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Update memory for a cluster and return the evolution data.
 * Call this once per cluster render — returns derived evolution signals.
 *
 * Returns:
 * {
 *   firstSeenAt: string,
 *   momentum: 'growing' | 'stable' | 'fading',
 *   momentumIcon: '↑' | '→' | '↓',
 *   stateProgression: 'Upgraded' | 'Downgraded' | null,
 *   confidenceProgression: 'Now Validated' | 'Now Building' | null,
 *   lifecycle: 'Developing' | 'Evolving' | 'Fading' | 'New' | null,
 *   interactionScore: number,
 * }
 */
export function updateAndGetEvolution(cluster, currentDecisionLabel, currentConfidenceLabel) {
    const key = fingerprint(cluster.primary?.title || '');
    if (!key) return defaultEvolution();

    const mem = pruneMemory(loadMemory());
    const now = new Date().toISOString();
    const entry = mem[key];
    const clusterSize = cluster.clusterSize ?? 1;

    let evolution;

    if (!entry) {
        // First time seeing this story
        mem[key] = {
            firstSeenAt: now,
            lastSeenAt: now,
            sizes: [clusterSize],
            prevDecisionLabel: currentDecisionLabel,
            prevConfidenceLabel: currentConfidenceLabel,
            interactionScore: 0,
        };
        evolution = { ...defaultEvolution(), firstSeenAt: now };
    } else {
        const sizes = [...(entry.sizes || []), clusterSize].slice(-10);
        const prev = sizes[sizes.length - 2] ?? sizes[0];
        const curr = sizes[sizes.length - 1];

        // Momentum from size trend
        let momentum = 'stable';
        let momentumIcon = '→';
        if (curr > prev) { momentum = 'growing'; momentumIcon = '↑'; }
        else if (curr < prev) { momentum = 'fading'; momentumIcon = '↓'; }

        // Lifecycle label based on age + momentum
        const ageHours = (Date.now() - new Date(entry.firstSeenAt).getTime()) / 3600000;
        let lifecycle = null;
        if (ageHours < 6) lifecycle = null; // too new, no label
        else if (momentum === 'growing') lifecycle = 'Developing';
        else if (ageHours > 48 && momentum === 'fading') lifecycle = 'Fading';
        else if (ageHours > 12) lifecycle = 'Evolving';

        // Decision state progression
        const PRIORITY_MAP = { 'Low Priority': 0, 'Watch': 1, 'Early Signal': 2, 'Important': 3 };
        const prevP = PRIORITY_MAP[entry.prevDecisionLabel] ?? -1;
        const currP = PRIORITY_MAP[currentDecisionLabel] ?? -1;
        let stateProgression = null;
        if (currP > prevP && prevP >= 0) stateProgression = 'Upgraded';
        else if (currP < prevP && currP >= 0) stateProgression = 'Downgraded';

        // Confidence progression
        const CONF_MAP = { 'Early': 0, 'Building': 1, 'Validated': 2 };
        const prevC = CONF_MAP[entry.prevConfidenceLabel] ?? -1;
        const currC = CONF_MAP[currentConfidenceLabel] ?? -1;
        let confidenceProgression = null;
        if (currC === 2 && prevC < 2 && prevC >= 0) confidenceProgression = 'Now Validated';
        else if (currC === 1 && prevC < 1 && prevC >= 0) confidenceProgression = 'Now Building';

        mem[key] = {
            ...entry,
            lastSeenAt: now,
            sizes,
            prevDecisionLabel: currentDecisionLabel,
            prevConfidenceLabel: currentConfidenceLabel,
            interactionScore: entry.interactionScore ?? 0,
        };

        evolution = {
            firstSeenAt: entry.firstSeenAt,
            momentum,
            momentumIcon,
            stateProgression,
            confidenceProgression,
            lifecycle,
            interactionScore: entry.interactionScore ?? 0,
        };
    }

    saveMemory(mem);
    return evolution;
}

/**
 * Record a user interaction (click or save) for a story.
 * Adds weight that can be used to boost similar stories.
 */
export function recordInteraction(title, type = 'click') {
    const key = fingerprint(title);
    if (!key) return;
    const mem = loadMemory();
    if (!mem[key]) return; // only boost known stories
    const weight = type === 'save' ? 3 : 1;
    mem[key].interactionScore = (mem[key].interactionScore ?? 0) + weight;
    saveMemory(mem);
}

/**
 * Get interaction score for a title (used to boost ranking).
 * Returns 0 if unknown.
 */
export function getInteractionScore(title) {
    const key = fingerprint(title);
    if (!key) return 0;
    const mem = loadMemory();
    return mem[key]?.interactionScore ?? 0;
}

/**
 * Extract top keyword groups from a set of clusters for narrative grouping.
 * Returns: [{ theme, stories: cluster[], count }]
 */
export function buildNarratives(clusters) {
    const THEMES = [
        { label: 'Interest Rate Pressure',       re: /\b(fed|rate|inflation|cpi|monetary|hike|cut|bond|yield)\b/i },
        { label: 'Capital Markets Activity',      re: /\b(ipo|merger|acqui|funding|raise|series|venture|deal|valuation|buyout)\b/i },
        { label: 'Real Estate Dynamics',          re: /\b(real estate|reit|housing|mortgage|rent|commercial property|cre)\b/i },
        { label: 'AI & Technology Shift',         re: /\b(ai |artificial intelligence|llm|openai|model|tech|software|startup|platform)\b/i },
        { label: 'Regulatory & Policy Pressure',  re: /\b(regulation|sec|fca|policy|legislation|compliance|government|sanction|tariff)\b/i },
        { label: 'Energy & Commodities',          re: /\b(oil|energy|gas|electricity|commodity|crude|power|solar|renewabl)\b/i },
        { label: 'Credit & Banking Risk',         re: /\b(bank|credit|loan|default|debt|lending|liquidity|bankruptcy|insolvency)\b/i },
        { label: 'Labor & Employment',            re: /\b(layoff|job|employment|workforce|hiring|wage|labor|workers)\b/i },
        { label: 'Geopolitical Tensions',         re: /\b(geopolit|war|trade war|sanction|tariff|china|russia|middle east|election)\b/i },
        { label: 'Crypto & Digital Assets',       re: /\b(crypto|bitcoin|ethereum|blockchain|defi|token|nft|web3)\b/i },
    ];

    const narrativeMap = new Map(); // label → { stories, score }

    for (const cluster of clusters) {
        const text = ((cluster.primary?.title || '') + ' ' + (cluster.primary?.description || '') + ' ' + (cluster.primary?.ai_summary || '')).toLowerCase();
        for (const { label, re } of THEMES) {
            if (re.test(text)) {
                if (!narrativeMap.has(label)) narrativeMap.set(label, { stories: [], score: 0 });
                const entry = narrativeMap.get(label);
                entry.stories.push(cluster);
                entry.score += cluster.primary?.importance_score ?? 0;
            }
        }
    }

    return [...narrativeMap.entries()]
        .filter(([, v]) => v.stories.length >= 2) // only show narratives with ≥2 stories
        .sort((a, b) => b[1].score - a[1].score)  // sort by aggregate importance
        .slice(0, 3)
        .map(([label, { stories, score }]) => ({ label, stories, count: stories.length, score }));
}

function defaultEvolution() {
    return {
        firstSeenAt: null,
        momentum: 'stable',
        momentumIcon: '→',
        stateProgression: null,
        confidenceProgression: null,
        lifecycle: null,
        interactionScore: 0,
    };
}