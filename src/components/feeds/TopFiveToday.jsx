import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, Loader2, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
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

const LIFECYCLE_STYLE = {
    Developing: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30',
    Evolving:   'text-sky-400 border-sky-800/50 bg-sky-950/30',
    Fading:     'text-stone-500 border-stone-700 bg-stone-800/30',
};

function BriefingCard({ item, idx, feedMap, expanded, onToggle }) {
    const source = feedMap[item.feed_id];
    const isOpen = expanded === item.id;
    const clusterSize = item._clusterSize ?? 1;
    const score = item.importance_score ?? 0;
    const isTop2 = idx < 2;
    const isHigh = score >= 72;

    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
    const Icon = tagCfg.icon;

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
                        {evolution.lifecycle && (
                            <span className={`text-[10px] px-1.5 py-0.5 border ${LIFECYCLE_STYLE[evolution.lifecycle] || ''}`}>
                                {evolution.lifecycle}
                            </span>
                        )}
                        {evolution.stateProgression === 'Upgraded' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-semibold">
                                <ArrowUp className="w-2.5 h-2.5" />Upgraded
                            </span>
                        )}
                        {evolution.confidenceProgression && (
                            <span className="text-[10px] text-emerald-400 font-semibold">{evolution.confidenceProgression}</span>
                        )}
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-600 ml-auto">
                            <Icon className="w-2.5 h-2.5" />{tag}
                        </span>
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
            const filtered = deduped.filter(item => {
                const cs = clusterMap.get(item.id) ?? 1;
                const score = item.importance_score ?? 0;
                return !(cs === 1 && score < 50);
            });

            return (filtered.length >= 3 ? filtered : deduped).slice(0, 5).map(item => ({
                ...item,
                _clusterSize: clusterMap.get(item.id) ?? 1,
            }));
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
                <span className="text-xs text-stone-600 ml-auto">start here</span>
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