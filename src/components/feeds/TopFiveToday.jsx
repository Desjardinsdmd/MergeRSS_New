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
// An item qualifies if decisionState priority >= 1 (Watch or above)
// AND it's not a single-source weak signal (score < 50 with no cluster)
function qualifiesForBriefing(item, clusterSize) {
    const score = item.importance_score ?? 0;
    const d = decisionState(item, clusterSize);
    // Exclude Low Priority entirely
    if (d.label === 'Low Priority') return false;
    // Exclude weak single-source items unless score is meaningful
    if (clusterSize === 1 && score < 55) return false;
    return true;
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

function BriefingCard({ item, idx, feedMap, expanded, onToggle }) {
    const source = feedMap[item.feed_id];
    const isOpen = expanded === item.id;
    const clusterSize = item._clusterSize ?? 1;
    const score = item.importance_score ?? 0;
    const isTop2 = idx < 2;
    const isHigh = score >= 72;

    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;

    const happened = whatHappened(item);
    const insight = generateInsight(item);
    const signal = signalLevelStyle(score);
    const confidence = confidenceFromCluster(clusterSize);
    const decision = decisionState(item, clusterSize);

    const fakeCluster = useMemo(() => ({ primary: item, clusterSize }), [item.id, clusterSize]);
    const evolution = useMemo(() =>
        updateAndGetEvolution(fakeCluster, decision.label, confidence.label),
    [item.id, clusterSize, decision.label, confidence.label]);

    return (
        <div
            onClick={() => onToggle(item.id)}
            className={[
                'cursor-pointer transition-colors',
                isTop2 ? 'px-5 py-5' : 'px-5 py-3.5',
                isHigh
                    ? 'border-l-[3px] border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.03] hover:bg-[hsl(var(--primary))]/[0.06]'
                    : 'hover:bg-stone-800/40',
            ].join(' ')}
        >
            <div className="flex items-start gap-3">
                <span className={[
                    'flex-shrink-0 leading-none mt-0.5 tabular-nums',
                    isTop2 ? 'text-2xl font-black w-7' : 'text-lg font-black w-6',
                    idx === 0 ? 'text-[hsl(var(--primary))]' : idx === 1 ? 'text-stone-400' : 'text-stone-700',
                ].join(' ')}>{idx + 1}</span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 border ${decision.style}`}>
                            {decision.label}
                        </span>
                        {evolution.stateProgression === 'Upgraded' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-semibold">
                                <ArrowUp className="w-2.5 h-2.5" />Upgraded
                            </span>
                        )}
                        {evolution.confidenceProgression && (
                            <span className="text-[10px] text-emerald-400 font-semibold">{evolution.confidenceProgression}</span>
                        )}
                        <div className="ml-auto flex items-center gap-1.5 opacity-40">
                            {evolution.lifecycle && <span className="text-[9px] text-stone-500">{evolution.lifecycle}</span>}
                            <span className="text-[9px] text-stone-600">{tag}</span>
                        </div>
                    </div>

                    <h3 className={[
                        'leading-snug mb-1',
                        isTop2 ? 'text-[0.9rem]' : 'text-sm',
                        isHigh ? 'font-bold text-white' : 'font-semibold text-stone-100',
                    ].join(' ')}>{decodeHtml(item.title)}</h3>

                    {happened && <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>}
                    {insight && <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.textClass}`}>↳ {insight}</p>}

                    <div className="flex items-center gap-2 flex-wrap">
                        {signal && <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>{signal.label}</span>}
                        <span className={`inline-flex items-center gap-1 text-[10px] ${confidence.class}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidence.dot}`} />
                            {confidence.label}
                        </span>
                        {evolution.momentum === 'growing' && clusterSize > 1 && (
                            <span className="text-[10px] text-emerald-400 font-semibold">↑ {clusterSize} sources</span>
                        )}
                        <span className="text-xs text-stone-600 ml-auto truncate">
                            {source?.name}{item.published_date && <> · {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}</>}
                        </span>
                    </div>

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
                            {evolution.firstSeenAt && (
                                <span className="text-xs text-stone-700 ml-3">
                                    First seen {formatDistanceToNow(new Date(evolution.firstSeenAt), { addSuffix: true })}
                                </span>
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

            // Show 2–5 items — only as many as genuinely qualify
            // If fewer than 2 qualify at this threshold, relax slightly but keep Low Priority excluded
            const topItems = ranked.slice(0, 5);
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
                    />
                ))}
            </div>
        </div>
    );
}