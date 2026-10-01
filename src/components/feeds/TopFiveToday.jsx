import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, Loader2, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, Flame } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import {
    inferTag, whatHappened, generateInsight,
    signalLevelStyle, confidenceFromCluster, decisionState,
    deduplicateItems, clusterItems
} from './intelligenceUtils';
import { updateAndGetEvolution, recordInteraction, getInteractionScore } from './storyMemory';
import { queryArticles } from '@/api/articles';

const TAG_CONFIG = {
    Trending:    { textClass: 'text-sky-400',     icon: TrendingUp },
    Risk:        { textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { textClass: 'text-stone-500',   icon: Minus },
};

// Category diversity helper — ensures no single category dominates the briefing
function diversifyByCategory(items, maxPerCategory = 2, total = 4) {
    const result = [];
    const catCount = {};
    for (const item of items) {
        const cat = (item.category || 'Uncategorized').toLowerCase();
        catCount[cat] = (catCount[cat] || 0);
        if (catCount[cat] >= maxPerCategory) continue;
        catCount[cat]++;
        result.push(item);
        if (result.length >= total) break;
    }
    return result;
}

// HARD RULE: Low Priority items never appear in Today's Briefing
function qualifiesForBriefing(item, clusterSize) {
    const score = item.importance_score ?? 0;
    const d = decisionState(item, clusterSize);
    if (d.label === 'Low Priority') return false;
    if (clusterSize === 1 && score < 55) return false;
    return true;
}

// Urgency tag — only when justified by multi-source, recency, or high score
function getUrgencyTag(item, clusterSize) {
    const score = item.importance_score ?? 0;
    const ageHours = item.published_date
        ? (Date.now() - new Date(item.published_date).getTime()) / 3600000
        : 99;
    if (clusterSize >= 3 && score >= 72) return 'Now Confirmed';
    if (clusterSize >= 2 && ageHours < 6) return 'Developing';
    if (score >= 85) return 'Escalating';
    if (clusterSize >= 2 && score >= 72) return 'Developing';
    return null;
}

// Why this matters — ≤15 words, no hedging, direct consequence, conclusion not observation
const WHY_IT_MATTERS = [
    { re: /\b(interest rate|fed|federal reserve|rate hike|rate cut)\b/i,   why: 'Rate moves now determine capital access — positioning this week sets Q-end outcomes' },
    { re: /\b(inflation|cpi|pce)\b/i,                                       why: 'Inflation above target forces Fed action — margin compression hits earnings next quarter' },
    { re: /\b(layoff|job cut|workforce)\b/i,                                why: 'Structural cuts precede demand destruction — consumer softness is 60 days behind this' },
    { re: /\b(acqui|merger|takeover|buyout)\b/i,                            why: 'Consolidation resets the competitive map — peer valuations reprice immediately' },
    { re: /\b(ai |artificial intelligence|llm)\b/i,                         why: 'AI is breaking cost structures now — delayed response becomes a permanent disadvantage' },
    { re: /\b(regulation|regulator|sec |compliance|legislation)\b/i,        why: 'Regulatory windows close fast — early movers capture the compliance arbitrage' },
    { re: /\b(real estate|reit|commercial property|housing|mortgage)\b/i,   why: 'Rate-forced sellers are building — missed entry now is expensive to recover' },
    { re: /\b(energy|oil|gas|electricity)\b/i,                              why: 'Energy costs pass through to inflation in one quarter — exposed sectors reprice now' },
    { re: /\b(earnings|revenue|profit|quarterly results)\b/i,               why: 'Guidance resets cascade into multiple compression — first re-rater captures the spread' },
    { re: /\b(gdp|recession|contraction)\b/i,                               why: 'Cycle turns are asymmetric — cost of being late is always disproportionately high' },
    { re: /\b(bank|credit|lending|loan|default)\b/i,                        why: 'Credit tightening restricts capital access within one quarter — risk is already building' },
    { re: /\b(tariff|trade war|sanction)\b/i,                               why: 'Trade friction embeds in cost structures fast — rewiring decisions cannot wait' },
    { re: /\b(crypto|bitcoin|ethereum)\b/i,                                  why: 'Institutional flows lead direction — retail confirms it, never leads it' },
    { re: /\b(funding|series [a-e]|raise|venture)\b/i,                      why: 'Capital concentration is a market structure signal — follow-on rounds confirm within weeks' },
    { re: /\b(supply chain|shortage|inventory|logistics)\b/i,               why: 'Supply disruption hits end-market pricing in weeks — margin compression follows directly' },
    { re: /\b(geopolit|election|government|political)\b/i,                  why: 'Political uncertainty delays capital deployment — risk premiums are rising now' },
];

// Bottom line — ≤12 words, memorable, core takeaway for #1 item only
const BOTTOM_LINE = [
    { re: /\b(interest rate|fed|federal reserve|rate hike|rate cut)\b/i,   line: 'Rate risk is now a capital access problem, not just a policy debate' },
    { re: /\b(inflation|cpi|pce)\b/i,                                       line: 'Cost pressure is now hitting margins, not just prices' },
    { re: /\b(layoff|job cut|workforce)\b/i,                                line: 'Structural cuts are in — demand weakness is next' },
    { re: /\b(acqui|merger|takeover|buyout)\b/i,                            line: 'The deal changes the competitive map permanently' },
    { re: /\b(ai |artificial intelligence|llm)\b/i,                         line: 'AI is breaking incumbents now — not eventually' },
    { re: /\b(regulation|regulator|sec |compliance|legislation)\b/i,        line: 'The window to act before enforcement is closing' },
    { re: /\b(real estate|reit|commercial property|housing|mortgage)\b/i,   line: 'Forced sellers are emerging — buyers hold the leverage now' },
    { re: /\b(energy|oil|gas|electricity)\b/i,                              line: 'Energy costs are now an earnings problem across sectors' },
    { re: /\b(earnings|revenue|profit|quarterly results)\b/i,               line: 'Guidance is being cut — multiples are following it down' },
    { re: /\b(gdp|recession|contraction)\b/i,                               line: 'The macro turn is in — risk assets are mispriced' },
    { re: /\b(bank|credit|lending|loan|default)\b/i,                        line: 'Credit is tightening now — capital access narrows next quarter' },
    { re: /\b(tariff|trade war|sanction)\b/i,                               line: 'Trade friction is structural — margins absorb it permanently' },
    { re: /\b(crypto|bitcoin|ethereum)\b/i,                                  line: 'Institutional flows are moving — direction is being set now' },
    { re: /\b(funding|series [a-e]|raise|venture)\b/i,                      line: 'Smart capital moved first — follow-on confirms the thesis' },
];

function getWhyItMatters(item) {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
    for (const { re, why } of WHY_IT_MATTERS) {
        if (re.test(text)) return why;
    }
    return null;
}

function getBottomLine(item) {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
    for (const { re, line } of BOTTOM_LINE) {
        if (re.test(text)) return line;
    }
    return null;
}

// Forward implication for top-3 items — what happens next
const FORWARD_IMPLICATION = [
    { re: /\b(interest rate|fed|federal reserve|rate hike|rate cut)\b/i,   fwd: 'Watch for credit spread widening and deal pipeline freezes in the next 30 days' },
    { re: /\b(inflation|cpi|pce)\b/i,                                       fwd: 'Earnings guidance revisions are the next signal — watch sector by sector' },
    { re: /\b(layoff|job cut|workforce)\b/i,                                fwd: 'Consumer spending data in 60 days will confirm whether this is cyclical or structural' },
    { re: /\b(acqui|merger|takeover|buyout)\b/i,                            fwd: 'Peer stocks will move on forced re-rating — expect sector repricing within days' },
    { re: /\b(ai |artificial intelligence|llm)\b/i,                         fwd: 'Watch which incumbents respond strategically vs. defensively — that gap compounds fast' },
    { re: /\b(regulation|regulator|sec |compliance|legislation)\b/i,        fwd: 'Enforcement action follows guidance — operators without compliance plans are exposed now' },
    { re: /\b(real estate|reit|commercial property|housing|mortgage)\b/i,   fwd: 'Distressed inventory is building — transaction volume picks up when sellers capitulate' },
    { re: /\b(energy|oil|gas|electricity)\b/i,                              fwd: 'Input cost pressure reaches end-market pricing within one quarter — watch margin reports' },
    { re: /\b(earnings|revenue|profit|quarterly results)\b/i,               fwd: 'Multiple compression cascades through the sector — the first analyst downgrade triggers the move' },
    { re: /\b(gdp|recession|contraction)\b/i,                               fwd: 'Risk asset repricing follows GDP revision — equity and credit spreads move together' },
    { re: /\b(bank|credit|lending|loan|default)\b/i,                        fwd: 'Credit rationing hits real economy activity within two quarters — watch SME lending data' },
    { re: /\b(tariff|trade war|sanction)\b/i,                               fwd: 'Cost pass-through to end markets happens in weeks — watch CPI components for confirmation' },
    { re: /\b(crypto|bitcoin|ethereum)\b/i,                                  fwd: 'Retail sentiment follows institutional positioning by 2–4 weeks — direction is being set now' },
    { re: /\b(funding|series [a-e]|raise|venture)\b/i,                      fwd: 'Follow-on activity confirms the thesis — watch for syndicate expansion in 30–60 days' },
    { re: /\b(supply chain|shortage|inventory|logistics)\b/i,               fwd: 'Price pass-through hits consumers in weeks — inflation data will reflect this next cycle' },
    { re: /\b(geopolit|election|government|political)\b/i,                  fwd: 'Capital sits on the sidelines until uncertainty resolves — expect deployment to lag by a quarter' },
];

function getForwardImplication(item) {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
    for (const { re, fwd } of FORWARD_IMPLICATION) {
        if (re.test(text)) return fwd;
    }
    return null;
}

// Score item quality for ranking inside the briefing
function briefingQualityScore(item, clusterSize) {
    const score = item.importance_score ?? 0;
    const d = decisionState(item, clusterSize);
    const insight = generateInsight(item);
    // Bonus for validated/building confidence
    const clusterBonus = clusterSize >= 3 ? 15 : clusterSize === 2 ? 8 : 0;
    // Bonus for high-conviction decision state
    const priorityBonus = d.priority * 12;
    // Bonus for having a specific macro insight (not generic)
    const insightBonus = insight && !insight.startsWith('Downside signal') && !insight.startsWith('Upside signal') && !insight.startsWith('Broad coverage') ? 10 : 0;
    return score + clusterBonus + priorityBonus + insightBonus;
}

function BriefingCard({ item, idx, feedMap, expanded, onToggle, totalCount }) {
    const source = feedMap[item.feed_id];
    const isOpen = expanded === item.id;
    const clusterSize = item._clusterSize ?? 1;
    const score = item.importance_score ?? 0;
    const isReadFirst = idx === 0;   // #1 = READ FIRST
    const isSkim = idx >= 3;         // #4+ = SKIM
    const isHigh = score >= 72;

    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;

    const happened = whatHappened(item);
    const insight = generateInsight(item);
    const signal = signalLevelStyle(score);
    const confidence = confidenceFromCluster(clusterSize);
    const decision = decisionState(item, clusterSize);
    const urgency = getUrgencyTag(item, clusterSize);
    const whyItMatters = isReadFirst ? getWhyItMatters(item) : null;
    const bottomLine = isReadFirst ? getBottomLine(item) : null;
    const isTop3 = idx < 3;
    const forwardImplication = isTop3 && !isReadFirst ? getForwardImplication(item) : null;

    const fakeCluster = useMemo(() => ({ primary: item, clusterSize }), [item.id, clusterSize]);
    const evolution = useMemo(() =>
        updateAndGetEvolution(fakeCluster, decision.label, confidence.label),
    [item.id, clusterSize, decision.label, confidence.label]);

    // Suppress generic insights
    const isGenericInsight = !insight ||
        insight.startsWith('Downside signal') ||
        insight.startsWith('Upside signal') ||
        insight.startsWith('Broad coverage');

    return (
        <div
            onClick={() => onToggle(item.id)}
            className={[
                'cursor-pointer transition-colors',
                isReadFirst ? 'px-5 py-5' : isSkim ? 'px-5 py-3 opacity-70' : 'px-5 py-4',
                isReadFirst
                    ? 'bg-[hsl(var(--primary)/0.06)] hover:bg-[hsl(var(--primary)/0.09)]'
                    : 'hover:bg-white/[0.03]',
            ].join(' ')}
        >
            <div className="flex items-start gap-3">
                {/* Index number — dominance decreases by position */}
                <span className={[
                    'mt-0.5 w-8 flex-shrink-0 font-display text-[28px] font-semibold leading-none tabular-nums',
                    idx === 0 ? 'text-[hsl(var(--primary))]' : 'text-stone-500',
                ].join(' ')} aria-hidden="true">{String(idx + 1).padStart(2, '0')}</span>

                <div className="flex-1 min-w-0">
                    {/* Badge row */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        {isReadFirst && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--primary))] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
                                <Flame className="w-2.5 h-2.5" aria-hidden="true" /> Read first
                            </span>
                        )}
                        {isSkim && (
                            <span className="chip-neutral uppercase tracking-wider">
                                Skim
                            </span>
                        )}
                        {!isReadFirst && !isSkim && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 border ${decision.style}`}>
                                {decision.label}
                            </span>
                        )}
                        {urgency && (
                            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                                urgency === 'Now Confirmed' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' :
                                urgency === 'Escalating'   ? 'border-red-400/25 bg-red-400/10 text-red-300' :
                                                             'border-sky-400/25 bg-sky-400/10 text-sky-300'
                            }`}>{urgency}</span>
                        )}
                        <div className="ml-auto flex items-center gap-1.5">
                            {evolution.lifecycle && <span className="meta text-stone-600">{evolution.lifecycle}</span>}
                        </div>
                    </div>

                    {/* Headline — weight drops with position */}
                    <h3 className={[
                        'mb-1.5 font-sans font-semibold leading-snug tracking-normal',
                        isReadFirst ? 'text-[17px] text-stone-100' :
                        isSkim      ? 'text-sm text-stone-300' :
                                      'text-[15px] text-stone-100',
                    ].join(' ')}>{decodeHtml(item.title)}</h3>

                    {/* Decisive insight */}
                    {!isGenericInsight && (
                        <p className={`text-xs font-semibold mb-2 line-clamp-1 ${tagCfg.textClass}`}>↳ {insight}</p>
                    )}

                    {/* Why this matters — #1 only, short and direct */}
                    {whyItMatters && (
                        <p className="mb-2 text-[13px] leading-snug text-stone-300">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#C4A5FD]">Why this matters · </span>
                            {whyItMatters}
                        </p>
                    )}

                    {/* Forward implication — top 2–3 items */}
                    {forwardImplication && (
                        <p className="mb-2 line-clamp-1 text-[13px] leading-snug text-stone-400">
                            → {forwardImplication}
                        </p>
                    )}

                    {/* Bottom line — #1 only, bold summary */}
                    {bottomLine && (
                        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-[#C4A5FD]">
                            Bottom line: {bottomLine}
                        </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider ${confidence.class}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidence.dot}`} />
                            {confidence.label}
                        </span>
                        {clusterSize > 1 && (
                            <span className="font-mono text-[10px] font-semibold text-emerald-400">↑ {clusterSize} sources</span>
                        )}
                        <span className="meta ml-auto truncate">
                            {source?.name}{item.published_date && <> · {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}</>}
                        </span>
                    </div>

                    {/* Expanded */}
                    {isOpen && (
                        <div className="mt-3 border-t border-white/[0.07] pt-3">
                            <a
                                href={safeUrl(item.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => { e.stopPropagation(); recordInteraction(item.title, 'click'); }}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#C4A5FD] transition hover:opacity-80"
                            >
                                Read full story <ExternalLink className="w-3 h-3" />
                            </a>
                            {clusterSize > 1 && (
                                <span className="meta ml-3">{clusterSize} sources covering this</span>
                            )}
                        </div>
                    )}
                </div>

                <button
                    className="mt-1 flex-shrink-0 rounded-lg text-stone-500 transition hover:text-stone-300"
                    aria-label={isOpen ? 'Collapse story' : 'Expand story'}
                    aria-expanded={isOpen}
                    onClick={e => { e.stopPropagation(); onToggle(item.id); }}
                >
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
            </div>
        </div>
    );
}

export default function TopFiveToday({ feedIds, feeds, onItemsLoaded }) {
    const [expanded, setExpanded] = useState(null);
    const feedMap = Object.fromEntries((feeds || []).map(f => [f.id, f]));
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['top5today', feedIds?.join(',')],
        queryFn: async () => {
            if (!feedIds?.length) return [];
            const raw = await queryArticles({ feed_ids: feedIds, since: since48h, sort: '-importance_score', limit: 200 });
            if (!raw?.length) return [];

            const boosted = raw.map(item => {
                const interactionBoost = Math.min(getInteractionScore(item.title) * 2, 10);
                return { ...item, _boostedScore: (item.importance_score ?? 0) + interactionBoost };
            }).sort((a, b) => b._boostedScore - a._boostedScore);

            const clusterMap = new Map();
            clusterItems(boosted, feedMap).forEach(c => {
                clusterMap.set(c.primary.id, c.clusterSize);
                c.duplicates.forEach(d => clusterMap.set(d.id, c.clusterSize));
            });

            const deduped = deduplicateItems(boosted, feedMap);

            // HARD RULE: filter out Low Priority items
            const qualified = deduped.filter(item => {
                const cs = clusterMap.get(item.id) ?? 1;
                return qualifiesForBriefing(item, cs);
            });

            // Sort by briefing quality score (conviction + specificity + cluster)
            const ranked = qualified
                .map(item => {
                    const cs = clusterMap.get(item.id) ?? 1;
                    return { ...item, _clusterSize: cs, _qualityScore: briefingQualityScore(item, cs) };
                })
                .sort((a, b) => b._qualityScore - a._qualityScore);

            // Cap at 4 items — deduplicate insights AND enforce category diversity
            const topItems = [];
            const seenInsights = new Set();
            const catCount = {};
            for (const item of ranked) {
                const insight = generateInsight(item);
                const insightKey = insight ? insight.slice(0, 50) : `score:${item.importance_score}`;
                if (seenInsights.has(insightKey)) continue;
                // Max 2 items from the same category to prevent one topic dominating
                const cat = (item.category || 'Uncategorized').toLowerCase();
                catCount[cat] = (catCount[cat] || 0);
                if (catCount[cat] >= 2) continue;
                catCount[cat]++;
                seenInsights.add(insightKey);
                topItems.push(item);
                if (topItems.length >= 4) break;
            }
            return topItems;
        },
        enabled: !!feedIds?.length,
        staleTime: 5 * 60 * 1000,
        onSuccess: (data) => onItemsLoaded?.(new Set(data.map(i => i.id))),
    });

    if (isLoading) return (
        <div className="panel p-5">
            <div className="mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                <span className="font-display text-lg font-semibold text-stone-100">Today's briefing</span>
            </div>
            <div className="flex items-center gap-2 py-4 text-sm text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Ranking intelligence…
            </div>
        </div>
    );

    if (!items.length) return null;

    return (
        <div className="panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-4">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-stone-100">Today's briefing</h2>
                <span className="meta ml-auto">{items.length} high-signal {items.length === 1 ? 'story' : 'stories'}</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
                {items.map((item, idx) => (
                    <BriefingCard
                        key={item.id}
                        item={item}
                        idx={idx}
                        feedMap={feedMap}
                        expanded={expanded}
                        onToggle={id => setExpanded(expanded === id ? null : id)}
                        totalCount={items.length}
                    />
                ))}
            </div>
        </div>
    );
}