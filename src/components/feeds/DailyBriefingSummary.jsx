import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { clusterItems, confidenceFromCluster, decisionState, generateInsight } from './intelligenceUtils';
import { buildNarratives } from './storyMemory';

// Synthesize a narrative theme into a decisive, opinionated sentence
function synthesizeNarrative(label, stories) {
    const s = stories.length;
    const TEMPLATES = {
        'Interest Rate Pressure':       () => `Rate pressure is ${s >= 3 ? 'broadly confirmed across multiple signals' : 'building'} — refinancing windows are closing and capital costs are rising`,
        'Capital Markets Activity':     () => `Capital markets ${s >= 3 ? 'are showing clear recovery signs' : 'are selectively reopening'} — risk appetite is returning to quality-first deals`,
        'Real Estate Dynamics':         () => `Institutional capital is ${s >= 2 ? 'actively repositioning' : 'beginning to shift'} in real estate as rate sensitivity reshapes the landscape`,
        'AI & Technology Shift':        () => `AI disruption is ${s >= 3 ? 'accelerating faster than incumbents can adapt' : 'creating measurable competitive differentiation'} — margin compression is next`,
        'Regulatory & Policy Pressure': () => `Regulatory tightening is ${s >= 2 ? 'intensifying on multiple fronts' : 'emerging'} — compliance costs and operational constraints will rise`,
        'Energy & Commodities':         () => `Energy costs ${s >= 2 ? 'are becoming a systemic constraint' : 'are adding margin pressure'} — downstream inflation effects are already feeding through`,
        'Credit & Banking Risk':        () => `Credit conditions are ${s >= 2 ? 'tightening broadly' : 'showing early stress signals'} — capital access will narrow faster than rate moves suggest`,
        'Labor & Employment':           () => `Labor market ${s >= 2 ? 'softening is accelerating' : 'is showing early stress'} — workforce rationalization is becoming the primary cost lever`,
        'Geopolitical Tensions':        () => `Geopolitical risk is ${s >= 2 ? 'compressing premiums across multiple markets' : 'adding a meaningful uncertainty discount'} — supply chains are most exposed`,
        'Crypto & Digital Assets':      () => `Digital assets are ${s >= 2 ? 'moving in coordination with macro signals' : 'reacting to broader risk sentiment'} — institutional positioning is the tell`,
    };
    const fn = TEMPLATES[label];
    return fn ? fn() : `${label} is emerging as a significant cross-source signal — ${s} stories are converging`;
}

// Derive the single clearest key signal — must be high conviction only
function deriveKeySignal(clusters, narratives) {
    // First try: find a validated, high-importance cluster
    const validated = clusters.find(c => {
        const d = decisionState(c.primary, c.clusterSize);
        const conf = confidenceFromCluster(c.clusterSize);
        return d.priority >= 3 && conf.label === 'Validated';
    });

    // Second try: Important decision state with building confidence
    const important = clusters.find(c => {
        const d = decisionState(c.primary, c.clusterSize);
        return d.priority >= 3;
    });

    // Third try: dominant narrative with strong count
    const dominantNarrative = narratives.find(n => n.count >= 3);

    const top = validated || important;

    if (top) {
        const insight = generateInsight(top.primary);
        const conf = confidenceFromCluster(top.clusterSize);
        const title = top.primary.title || '';
        const entityMatch = title.match(/^([A-Z][a-zA-Z&\s]{2,30}?)(?:\s+(?:is|are|says|reports|warns|raises|cuts|plans|faces|hits|sees))/);
        const subject = entityMatch ? entityMatch[1].trim() : null;

        if (conf.label === 'Validated' && subject) {
            return `${subject}: ${insight || 'now confirmed across multiple independent sources — treat as high-conviction signal'}`;
        }
        if (insight) {
            return subject ? `${subject}: ${insight}` : insight;
        }
    }

    if (dominantNarrative) {
        return synthesizeNarrative(dominantNarrative.label, dominantNarrative.stories);
    }

    return null;
}

// Generate briefing bullets — only from high-quality signals
// Never generates generic filler. Returns 0–4 bullets.
function generateBullets(clusters, narratives) {
    const bullets = [];

    // Lead with strongest narratives (≥2 stories = meaningful cross-source theme)
    for (const narrative of narratives.slice(0, 3)) {
        if (bullets.length >= 4) break;
        if (narrative.count < 2) continue;
        bullets.push(synthesizeNarrative(narrative.label, narrative.stories));
    }

    // Fill with high-conviction cluster insights not already covered
    const highClusters = clusters.filter(c => {
        const d = decisionState(c.primary, c.clusterSize);
        const insight = generateInsight(c.primary);
        // Only include if: strong decision state AND has a specific (non-generic) insight
        return (
            d.priority >= 2 &&
            (c.primary.importance_score ?? 0) >= 60 &&
            insight &&
            !insight.startsWith('Downside signal') &&
            !insight.startsWith('Upside signal') &&
            !insight.startsWith('Broad coverage')
        );
    });

    for (const cluster of highClusters) {
        if (bullets.length >= 4) break;
        const insight = generateInsight(cluster.primary);
        const d = decisionState(cluster.primary, cluster.clusterSize);
        const prefix = d.label === 'Important' ? '' : 'Watch: ';
        const candidate = `${prefix}${insight}`;
        // Avoid near-duplicates
        if (!bullets.some(b => b.includes(insight.slice(0, 40)))) {
            bullets.push(candidate);
        }
    }

    return [...new Set(bullets)].slice(0, 4);
}

export default function DailyBriefingSummary({ items = [], feeds = [] }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const { bullets, keySignal } = useMemo(() => {
        if (!items.length) return { bullets: [], keySignal: null };

        const clusters = clusterItems(items, feedMap);

        // ONLY use high-signal clusters for the briefing — exclude weak/low-priority content
        const significant = clusters.filter(c => {
            const d = decisionState(c.primary, c.clusterSize);
            return d.priority >= 2; // Watch or above
        });

        if (!significant.length) return { bullets: [], keySignal: null };

        const narratives = buildNarratives(significant);
        return {
            bullets: generateBullets(significant, narratives),
            keySignal: deriveKeySignal(significant, narratives),
        };
    }, [items, feeds]);

    // Only render if we have genuine signal — never show empty state
    if (!keySignal && !bullets.length) return null;

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className="border-2 border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/[0.04]">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/[0.06]">
                <Radio className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                <span className="text-sm font-bold text-[hsl(var(--primary))] uppercase tracking-widest">Intelligence Briefing</span>
                <span className="text-xs text-stone-500 ml-auto">{today}</span>
            </div>

            {/* Today's Key Signal — the single clearest takeaway */}
            {keySignal && (
                <div className="px-5 py-4 border-b border-[hsl(var(--primary))]/20">
                    <div className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-2">Today's Key Signal</div>
                    <p className="text-[0.95rem] font-bold text-stone-100 leading-snug">{keySignal}</p>
                </div>
            )}

            {/* Synthesized bullets — only if they add genuine insight beyond the key signal */}
            {bullets.length > 0 && (
                <div className="px-5 py-4 space-y-2.5">
                    {bullets.map((bullet, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <span className="text-[hsl(var(--primary))] font-black text-sm flex-shrink-0 mt-0 leading-snug">·</span>
                            <p className="text-sm text-stone-400 leading-snug">{bullet}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}