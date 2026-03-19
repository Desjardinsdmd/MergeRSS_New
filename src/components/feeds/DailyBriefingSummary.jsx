import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { clusterItems, confidenceFromCluster, decisionState, generateInsight } from './intelligenceUtils';
import { buildNarratives } from './storyMemory';

// ─── Narrative synthesis ───────────────────────────────────────────────────────
// Each template produces a specific, time-anchored sentence with a forward implication.
function synthesizeNarrative(label, stories, isLead = false) {
    const s = stories.length;
    const TEMPLATES = {
        'Interest Rate Pressure':       () => `Rate pressure is ${s >= 3 ? 'now confirmed across sources' : 'building'} — borrowing costs are forcing capital deployment to the sidelines`,
        'Capital Markets Activity':     () => `Capital markets are ${s >= 3 ? 'reopening for quality assets only' : 'showing selective recovery'} — risk appetite is returning at the top of the quality stack`,
        'Real Estate Dynamics':         () => `Institutional capital is ${s >= 2 ? 'actively repositioning' : 'beginning to shift'} in real estate — rate pressure is now forcing sellers to the table`,
        'AI & Technology Shift':        () => `AI is ${s >= 3 ? 'breaking cost structures across sectors' : 'beginning to break incumbent cost models'} — delayed response is becoming a structural disadvantage`,
        'Regulatory & Policy Pressure': () => `Regulatory tightening is ${s >= 2 ? 'narrowing the compliance window fast' : 'beginning to close the compliance window'} — exposed operators face disproportionate friction`,
        'Energy & Commodities':         () => `Energy cost pressure is ${s >= 2 ? 'now feeding into downstream inflation' : 'beginning to hit operating margins'} — sectors with limited pricing power are most exposed`,
        'Credit & Banking Risk':        () => `Credit conditions are ${s >= 2 ? 'tightening broadly' : 'beginning to tighten'} — lending pullback is restricting capital access faster than rate signals indicate`,
        'Labor & Employment':           () => `Workforce rationalization is ${s >= 2 ? 'accelerating across sectors' : 'beginning'} — consumer demand softness is 60 days behind this signal`,
        'Geopolitical Tensions':        () => `Geopolitical friction is ${s >= 2 ? 'now compressing risk premiums and disrupting supply chains' : 'beginning to delay capital deployment decisions'}`,
        'Crypto & Digital Assets':      () => `Institutional flows are ${s >= 2 ? 'now setting directional moves in digital assets' : 'beginning to move'} — retail sentiment is following, not leading`,
    };
    const fn = TEMPLATES[label];
    return fn ? fn() : `${label} is converging across ${s} sources — a cross-sector signal forming`;
}

// ─── Key Signal derivation ─────────────────────────────────────────────────────
// Produces a specific, non-generic, time-anchored sentence.
// Falls back through: validated cluster → important cluster → dominant narrative → null
function deriveKeySignal(clusters, narratives) {
    // Tier 1: Validated + Important
    const validated = clusters.find(c => {
        const d = decisionState(c.primary, c.clusterSize);
        const conf = confidenceFromCluster(c.clusterSize);
        return d.priority >= 3 && conf.label === 'Validated';
    });

    // Tier 2: Important decision state (any confidence)
    const important = clusters.find(c => decisionState(c.primary, c.clusterSize).priority >= 3);

    const top = validated || important;

    if (top) {
        const insight = generateInsight(top.primary);
        const conf = confidenceFromCluster(top.clusterSize);
        const title = top.primary.title || '';

        // Extract subject entity from title (first capitalized phrase before a verb)
        const entityMatch = title.match(/^([A-Z][a-zA-Z&\s]{2,28}?)(?:\s+(?:is|are|says|reports|warns|raises|cuts|plans|faces|hits|sees|posts|beats|misses|surges|drops|jumps|falls))/);
        const subject = entityMatch ? entityMatch[1].trim() : null;

        // Avoid all generic fallback phrases — only output if we have a specific insight
        const isGeneric = !insight ||
            insight.startsWith('Downside signal') ||
            insight.startsWith('Upside signal') ||
            insight.startsWith('Broad coverage') ||
            insight.startsWith('Downside') ||
            insight === 'Monitor closely';

        if (!isGeneric) {
            const confSuffix = conf.label === 'Validated' ? ` — confirmed across ${top.clusterSize} independent sources` : '';
            return subject ? `${subject}: ${insight}${confSuffix}` : `${insight}${confSuffix}`;
        }
    }

    // Tier 3: Strong narrative as key signal
    const dominantNarrative = narratives.find(n => n.count >= 3);
    if (dominantNarrative) {
        return synthesizeNarrative(dominantNarrative.label, dominantNarrative.stories, true);
    }

    // Tier 4: Any narrative with ≥2 stories
    if (narratives[0]?.count >= 2) {
        return synthesizeNarrative(narratives[0].label, narratives[0].stories);
    }

    return null;
}

// ─── Bullet generation ─────────────────────────────────────────────────────────
// Enforces structural diversity: Macro driver → Supporting signal → Forward implication
// Never all-identical sentence structures. Max 4 bullets.
function generateBullets(clusters, narratives) {
    const bullets = [];

    // SLOT 1 — Macro driver: the biggest cross-source theme (narrative-level)
    const leadNarrative = narratives.find(n => n.count >= 2);
    if (leadNarrative) {
        bullets.push({ role: 'macro', text: synthesizeNarrative(leadNarrative.label, leadNarrative.stories) });
    }

    // SLOT 2 — Supporting signal: a second distinct narrative or high-confidence cluster event
    const secondNarrative = narratives.find(n => n !== leadNarrative && n.count >= 2);
    if (secondNarrative) {
        bullets.push({ role: 'support', text: synthesizeNarrative(secondNarrative.label, secondNarrative.stories) });
    } else {
        // Fall back to a high-conviction cluster insight as the supporting data point
        const supportCluster = clusters.find(c => {
            const d = decisionState(c.primary, c.clusterSize);
            const insight = generateInsight(c.primary);
            const isGeneric = !insight || insight.startsWith('Downside signal') || insight.startsWith('Upside signal') || insight.startsWith('Broad coverage');
            return d.priority >= 2 && (c.primary.importance_score ?? 0) >= 65 && !isGeneric &&
                !bullets.some(b => b.text.includes(insight.slice(0, 35)));
        });
        if (supportCluster) {
            const insight = generateInsight(supportCluster.primary);
            const d = decisionState(supportCluster.primary, supportCluster.clusterSize);
            bullets.push({ role: 'support', text: `${d.label === 'Important' ? '' : 'Watch: '}${insight}` });
        }
    }

    // SLOT 3 — Forward implication: what the combined signals mean for what happens next
    if (bullets.length >= 2) {
        const FORWARD_IMPLICATIONS = {
            'Interest Rate Pressure':       'Credit conditions tighten next — discretionary capital deployment pauses within the quarter',
            'Capital Markets Activity':     'Quality deal flow accelerates — distressed and speculative positions stay sidelined',
            'Real Estate Dynamics':         'Buyer leverage emerges where sellers face refinancing pressure — distressed inventory is building now',
            'AI & Technology Shift':        'Incumbents face forced pivots — the capability gap compounds and consolidation accelerates',
            'Regulatory & Policy Pressure': 'Compliance-light operators are most exposed — the arbitrage window is closing now',
            'Energy & Commodities':         'Input cost pressure embeds in pricing — sectors without pricing power absorb it directly in margins',
            'Credit & Banking Risk':        'Below-investment-grade borrowers face restricted access within one quarter — refinancing risk is real',
            'Labor & Employment':           'Consumer demand softness follows in 60 days — downstream signals lag workforce cuts by one quarter',
            'Geopolitical Tensions':        'Supply chain rewiring accelerates — cost efficiency is being traded for resilience at speed',
            'Crypto & Digital Assets':      'Institutional flows are the directional tell — retail confirms direction, never sets it',
        };
        const leadLabel = leadNarrative?.label || narratives[0]?.label;
        const implication = FORWARD_IMPLICATIONS[leadLabel];
        if (implication && !bullets.some(b => b.text.includes(implication.slice(0, 30)))) {
            bullets.push({ role: 'forward', text: implication });
        }
    }

    return [...new Map(bullets.map(b => [b.text.slice(0, 40), b])).values()].slice(0, 4);
}

// Role labels shown inline before each bullet
const ROLE_LABEL = {
    macro:   { text: 'Driver',      cls: 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10' },
    support: { text: 'Signal',      cls: 'text-sky-400 border-sky-800/50 bg-sky-950/30' },
    forward: { text: 'Implication', cls: 'text-stone-400 border-stone-700 bg-stone-800/50' },
};

export default function DailyBriefingSummary({ items = [], feeds = [] }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const { bullets, keySignal } = useMemo(() => {
        if (!items.length) return { bullets: [], keySignal: null };

        const clusters = clusterItems(items, feedMap);

        // Only include Watch-or-above clusters in the briefing
        const significant = clusters.filter(c => decisionState(c.primary, c.clusterSize).priority >= 2);
        if (!significant.length) return { bullets: [], keySignal: null };

        const narratives = buildNarratives(significant);
        return {
            bullets: generateBullets(significant, narratives),
            keySignal: deriveKeySignal(significant, narratives),
        };
    }, [items, feeds]);

    if (!keySignal && !bullets.length) return null;

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className="border-2 border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/[0.03] shadow-[0_0_40px_-8px_hsl(var(--primary)/0.15)]">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/[0.07]">
                <Radio className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                <span className="text-sm font-bold text-[hsl(var(--primary))] uppercase tracking-widest">Intelligence Briefing</span>
                <span className="text-xs text-stone-500 ml-auto">{today}</span>
            </div>

            {/* Today's Key Signal */}
            {keySignal && (
                <div className="px-5 py-5 border-b border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/[0.04]">
                    <div className="text-[10px] font-black text-[hsl(var(--primary))]/70 uppercase tracking-[0.2em] mb-2">Today's Key Signal</div>
                    <p className="text-[1rem] font-bold text-stone-100 leading-snug">{keySignal}</p>
                </div>
            )}

            {/* Structured bullets — Macro / Signal / Implication */}
            {bullets.length > 0 && (
                <div className="px-5 py-4 space-y-3">
                    {bullets.map((bullet, i) => {
                        const role = ROLE_LABEL[bullet.role] || ROLE_LABEL.support;
                        return (
                            <div key={i} className="flex items-start gap-3">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 border flex-shrink-0 mt-0.5 uppercase tracking-wider ${role.cls}`}>
                                    {role.text}
                                </span>
                                <p className="text-sm text-stone-300 leading-snug">{bullet.text}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}