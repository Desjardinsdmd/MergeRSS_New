import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, Loader2, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, ArrowUp, Flame } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import {
    inferTag, whatHappened, generateInsight,
    signalLevelStyle, confidenceFromCluster, decisionState,
    deduplicateItems, clusterItems
} from './intelligenceUtils';
import { updateAndGetEvolution, recordInteraction, getInteractionScore } from './storyMemory';

const TAG_CONFIG = {
    Trending:    { textClass: 'text-blue-400',    icon: TrendingUp },
    Risk:        { textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { textClass: 'text-stone-500',   icon: Minus },
};

const MACRO_BOOST_RE = /\b(fed|federal reserve|interest rate|inflation|gdp|earnings|capital markets|policy|regulation|oil|energy|geopolit|trade|tariff|acqui|merger|ipo|real estate|housing)\b/i;

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

// Why this matters — top-1 item only, decisive and non-generic
const WHY_IT_MATTERS = [
    { re: /\b(interest rate|fed|federal reserve|rate hike|rate cut)\b/i,   why: 'Rate decisions ripple across every asset class — early positioning now determines Q-end outcomes' },
    { re: /\b(inflation|cpi|pce)\b/i,                                       why: 'Early margin compression signals tend to precede broader earnings resets by one to two quarters' },
    { re: /\b(layoff|job cut|workforce)\b/i,                                why: 'Workforce cuts signal structural cost-shift, not cyclical — consumer demand softness follows within 60 days' },
    { re: /\b(acqui|merger|takeover|buyout)\b/i,                            why: 'Consolidation events reset competitive positioning for the entire sector — peer exposure is immediate' },
    { re: /\b(ai |artificial intelligence|llm)\b/i,                         why: 'Capability gaps widen faster than markets price in — delayed strategic response becomes a structural disadvantage' },
    { re: /\b(regulation|regulator|sec |compliance|legislation)\b/i,        why: 'Regulatory windows close fast — operators who move early capture significant compliance arbitrage' },
    { re: /\b(real estate|reit|commercial property|housing|mortgage)\b/i,   why: 'Property market inflection points are rare — missed entry timing is costly and hard to recover' },
    { re: /\b(energy|oil|gas|electricity)\b/i,                              why: 'Energy cost shifts pass through to inflation within one quarter — exposed sectors reprice accordingly' },
    { re: /\b(earnings|revenue|profit|quarterly results)\b/i,               why: 'Guidance resets create repricing cascades — the first mover on re-rating captures the spread' },
    { re: /\b(gdp|recession|contraction)\b/i,                               why: 'Macro cycle turns are asymmetric — the cost of being late is disproportionately high' },
    { re: /\b(bank|credit|lending|loan|default)\b/i,                        why: 'Credit contraction spreads faster than rate data suggests — capital access risk is already building' },
    { re: /\b(tariff|trade war|sanction)\b/i,                               why: 'Trade friction embeds in cost structures quickly — supply chain rewiring decisions cannot be deferred' },
    { re: /\b(crypto|bitcoin|ethereum)\b/i,                                  why: 'Institutional positioning shifts are directional tells — retail flows confirm, not lead' },
    { re: /\b(funding|series [a-e]|raise|venture)\b/i,                      why: 'Capital concentration signals are early market structure tells — follow-on activity confirms within weeks' },
];

function getWhyItMatters(item) {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
    for (const { re, why } of WHY_IT_MATTERS) {
        if (re.test(text)) return why;
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
                isReadFirst ? 'px-5 py-5' : isSkim ? 'px-5 py-3 opacity-75' : 'px-5 py-4',
                isReadFirst
                    ? 'border-l-[3px] border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.05] hover:bg-[hsl(var(--primary))]/[0.08]'
                    : isHigh
                    ? 'border-l-[2px] border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/[0.02] hover:bg-[hsl(var(--primary))]/[0.04]'
                    : 'hover:bg-stone-800/30',
            ].join(' ')}
        >
            <div className="flex items-start gap-3">
                {/* Index number */}
                <span className={[
                    'flex-shrink-0 leading-none mt-0.5 tabular-nums',
                    isReadFirst ? 'text-2xl font-black w-7' : 'text-base font-black w-6',
                    idx === 0 ? 'text-[hsl(var(--primary))]' : idx === 1 ? 'text-stone-400' : 'text-stone-700',
                ].join(' ')}>{idx + 1}</span>

                <div className="flex-1 min-w-0">
                    {/* Priority signal row */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        {/* READ FIRST / SKIM label */}
                        {isReadFirst && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-stone-900 bg-[hsl(var(--primary))] px-2 py-0.5 tracking-wider uppercase">
                                <Flame className="w-2.5 h-2.5" /> Read First
                            </span>
                        )}
                        {isSkim && (
                            <span className="text-[10px] font-semibold text-stone-600 border border-stone-800 px-1.5 py-0.5 uppercase tracking-wider">
                                Skim
                            </span>
                        )}

                        {/* Decision state */}
                        {!isReadFirst && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 border ${decision.style}`}>
                                {decision.label}
                            </span>
                        )}

                        {/* Urgency tag */}
                        {urgency && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
                                urgency === 'Now Confirmed' ? 'text-emerald-400 border border-emerald-800/50 bg-emerald-950/30' :
                                urgency === 'Escalating'   ? 'text-red-400 border border-red-800/50 bg-red-950/30' :
                                                             'text-amber-400 border border-amber-800/50 bg-amber-950/30'
                            }`}>{urgency}</span>
                        )}

                        {/* Evolution signals — kept muted */}
                        <div className="ml-auto flex items-center gap-1.5 opacity-30">
                            {evolution.lifecycle && <span className="text-[9px] text-stone-500">{evolution.lifecycle}</span>}
                        </div>
                    </div>

                    {/* Headline */}
                    <h3 className={[
                        'leading-snug mb-1',
                        isReadFirst ? 'text-[0.95rem]' : 'text-sm',
                        isReadFirst ? 'font-bold text-white' : isHigh ? 'font-semibold text-stone-100' : 'font-medium text-stone-300',
                    ].join(' ')}>{decodeHtml(item.title)}</h3>

                    {/* Decisive insight — skip generic */}
                    {!isGenericInsight && (
                        <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.textClass}`}>↳ {insight}</p>
                    )}

                    {/* Why this matters — #1 item only */}
                    {whyItMatters && (
                        <p className="text-xs text-stone-400 italic mb-2 line-clamp-2 border-l border-[hsl(var(--primary))]/40 pl-2">
                            Why this matters: {whyItMatters}
                        </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] ${confidence.class}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidence.dot}`} />
                            {confidence.label}
                        </span>
                        {clusterSize > 1 && (
                            <span className="text-[10px] text-emerald-400 font-semibold">↑ {clusterSize} sources</span>
                        )}
                        <span className="text-xs text-stone-600 ml-auto truncate">
                            {source?.name}{item.published_date && <> · {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}</>}
                        </span>
                    </div>

                    {/* Expanded — read article */}
                    {isOpen && (
                        <div className="mt-3 pt-3 border-t border-stone-800">
                            <a
                                href={safeUrl(item.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => { e.stopPropagation(); recordInteraction(item.title, 'click'); }}
                                className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:opacity-80 transition font-medium"
                            >
                                Read full article <ExternalLink className="w-3 h-3" />
                            </a>
                            {clusterSize > 1 && (
                                <span className="text-xs text-stone-600 ml-3">{clusterSize} sources covering this</span>
                            )}
                        </div>
                    )}
                </div>

                <button
                    className="text-stone-700 hover:text-stone-400 transition flex-shrink-0 mt-1"
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
            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since48h } },
                '-importance_score',
                200
            );
            if (!raw?.length) return [];

            const boosted = raw.map(item => {
                const text = (item.title || '') + ' ' + (item.description || '');
                const macroBoost = MACRO_BOOST_RE.test(text) ? 8 : 0;
                const interactionBoost = Math.min(getInteractionScore(item.title) * 2, 10);
                return { ...item, _boostedScore: (item.importance_score ?? 0) + macroBoost + interactionBoost };
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

            // Cap at 4 items — deduplicate items with nearly identical insights
            const topItems = [];
            const seenInsights = new Set();
            for (const item of ranked) {
                const insight = generateInsight(item);
                const insightKey = insight ? insight.slice(0, 50) : `score:${item.importance_score}`;
                if (seenInsights.has(insightKey)) continue;
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
        <div className="bg-stone-900 border border-stone-800 p-5">
            <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Today's Briefing</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Ranking intelligence…
            </div>
        </div>
    );

    if (!items.length) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Today's Briefing</h2>
                <span className="text-xs text-stone-600 ml-auto">{items.length} high-signal {items.length === 1 ? 'story' : 'stories'}</span>
            </div>
            <div className="divide-y divide-stone-800/80">
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