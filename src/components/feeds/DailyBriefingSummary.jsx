import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { clusterItems, confidenceFromCluster, decisionState, generateInsight } from './intelligenceUtils';
import { buildNarratives } from './storyMemory';

// Generate a decisive one-sentence synthesis from a narrative theme + its top stories
function synthesizeNarrative(label, stories) {
    const NARRATIVE_TEMPLATES = {
        'Interest Rate Pressure':       s => `Rising rate pressure is ${s >= 2 ? 'broadly confirmed' : 'emerging'} — constraining refinancing and compressing development margins`,
        'Capital Markets Activity':     s => `Capital markets ${s >= 3 ? 'are showing clear signs of recovery' : 'activity is picking up'} with ${s} distinct deals or raises in play`,
        'Real Estate Dynamics':         s => `Institutional capital is ${s >= 2 ? 'actively repositioning' : 'beginning to shift'} across real estate segments in response to rate dynamics`,
        'AI & Technology Shift':        s => `AI adoption is ${s >= 3 ? 'accelerating across sectors' : 'creating competitive differentiation'} — incumbent disruption risk is rising`,
        'Regulatory & Policy Pressure': s => `Regulatory tightening is ${s >= 2 ? 'intensifying' : 'emerging'} — compliance burden and operating costs are set to increase`,
        'Energy & Commodities':         s => `Energy ${s >= 2 ? 'constraints are becoming a key inflation driver' : 'volatility is adding margin pressure'} across downstream sectors`,
        'Credit & Banking Risk':        s => `Credit cycle signals are ${s >= 2 ? 'broadly tightening' : 'showing early stress'} — capital access will narrow in coming months`,
        'Labor & Employment':           s => `Labor market ${s >= 2 ? 'softening is accelerating' : 'is showing early signs of stress'} as cost pressures drive workforce rationalization`,
        'Geopolitical Tensions':        s => `Geopolitical risk is ${s >= 2 ? 'intensifying across multiple fronts' : 'adding uncertainty'} — supply chains and capital flows are at risk`,
        'Crypto & Digital Assets':      s => `Digital asset markets are ${s >= 2 ? 'showing coordinated movement' : 'responding to macro signals'} — institutional positioning is shifting`,
    };
    const fn = NARRATIVE_TEMPLATES[label];
    return fn ? fn(stories.length) : `${label} is emerging as a significant macro signal worth monitoring`;
}

// Derive the single most important signal sentence from top clusters
function deriveKeySignal(clusters) {
    if (!clusters.length) return null;
    // Pick highest-priority cluster with validated or building confidence
    const top = clusters.find(c => {
        const d = decisionState(c.primary, c.clusterSize);
        return d.priority >= 3;
    }) || clusters[0];

    const insight = generateInsight(top.primary);
    const title = top.primary.title || '';

    // Try to extract meaningful entity from title
    const companyMatch = title.match(/^([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){0,2})/);
    const subject = companyMatch ? companyMatch[1] : 'The leading story';
    const confidence = confidenceFromCluster(top.clusterSize);

    if (confidence.label === 'Validated') {
        return `${subject}: ${insight || 'now confirmed across multiple sources — treat as high-conviction signal'}`;
    }
    return insight ? `${subject}: ${insight}` : `${subject} is driving the most significant signal today`;
}

// Generate 3-5 bullets from clusters + narratives
function generateBullets(clusters, narratives) {
    const bullets = [];

    // 1. Lead with the dominant narrative if strong enough
    if (narratives[0]?.count >= 2) {
        bullets.push(synthesizeNarrative(narratives[0].label, narratives[0].stories));
    }

    // 2. Add secondary narrative if meaningfully different
    if (narratives[1] && narratives[1].label !== narratives[0]?.label && narratives[1].count >= 2) {
        bullets.push(synthesizeNarrative(narratives[1].label, narratives[1].stories));
    }

    // 3. Pick top 2 high-importance clusters not already covered by a narrative bullet
    const highClusters = clusters
        .filter(c => (c.primary.importance_score ?? 0) >= 65 && c.clusterSize >= 1)
        .slice(0, 3);

    for (const cluster of highClusters) {
        if (bullets.length >= 4) break;
        const insight = generateInsight(cluster.primary);
        const d = decisionState(cluster.primary, cluster.clusterSize);
        if (insight && d.priority >= 2) {
            const prefix = d.label === 'Important' ? '' : 'Watch: ';
            bullets.push(`${prefix}${insight}`);
        }
    }

    // 4. Add a 3rd narrative as diversity if we have room
    if (bullets.length < 3 && narratives[2]?.count >= 2) {
        bullets.push(synthesizeNarrative(narratives[2].label, narratives[2].stories));
    }

    // Deduplicate and cap
    return [...new Set(bullets)].slice(0, 5);
}

export default function DailyBriefingSummary({ items = [], feeds = [] }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const { bullets, keySignal } = useMemo(() => {
        if (!items.length) return { bullets: [], keySignal: null };
        const clusters = clusterItems(items, feedMap);
        const significant = clusters.filter(c => (c.primary.importance_score ?? 0) >= 40);
        const narratives = buildNarratives(significant);
        return {
            bullets: generateBullets(significant, narratives),
            keySignal: deriveKeySignal(significant),
        };
    }, [items, feeds]);

    if (!bullets.length && !keySignal) return null;

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className="border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/[0.04]">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[hsl(var(--primary))]/20">
                <Radio className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                <span className="text-sm font-bold text-[hsl(var(--primary))] uppercase tracking-widest">Intelligence Briefing</span>
                <span className="text-xs text-stone-600 ml-auto">{today}</span>
            </div>

            {/* Key Signal — anchor insight */}
            {keySignal && (
                <div className="px-5 py-4 border-b border-[hsl(var(--primary))]/15 bg-[hsl(var(--primary))]/[0.04]">
                    <div className="flex items-start gap-3">
                        <span className="text-[10px] font-black text-stone-900 bg-[hsl(var(--primary))] px-2 py-1 flex-shrink-0 mt-0.5 tracking-wider">
                            KEY SIGNAL
                        </span>
                        <p className="text-sm font-semibold text-stone-100 leading-snug">{keySignal}</p>
                    </div>
                </div>
            )}

            {/* Bullets */}
            {bullets.length > 0 && (
                <div className="px-5 py-4 space-y-2.5">
                    {bullets.map((bullet, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <span className="text-[hsl(var(--primary))] font-black text-xs flex-shrink-0 mt-0.5 w-3">·</span>
                            <p className="text-sm text-stone-300 leading-snug">{bullet}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}