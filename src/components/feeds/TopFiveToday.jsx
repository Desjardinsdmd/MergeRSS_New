import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, Loader2, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, confidenceFromCluster, deduplicateItems, clusterItems } from './intelligenceUtils';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-800',          textClass: 'text-blue-400',    icon: TrendingUp },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-800',             textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-800', textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700',       textClass: 'text-stone-400',   icon: Minus },
};

// Macro-bias scoring boost for executive briefing relevance
const MACRO_BOOST_RE = /\b(fed|federal reserve|interest rate|inflation|gdp|earnings|capital markets|policy|regulation|oil|energy|geopolit|trade|tariff|acqui|merger|ipo|real estate|housing)\b/i;

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

            // Apply macro bias boost before dedup
            const boosted = raw.map(item => {
                const text = (item.title || '') + ' ' + (item.description || '');
                const boost = MACRO_BOOST_RE.test(text) ? 8 : 0;
                return { ...item, _boostedScore: (item.importance_score ?? 0) + boost };
            }).sort((a, b) => b._boostedScore - a._boostedScore);

            // Cluster to track confidence sizes
            const clusterMap = new Map();
            const clusters = clusterItems(boosted, feedMap);
            clusters.forEach(c => {
                clusterMap.set(c.primary.id, c.clusterSize);
                c.duplicates.forEach(d => clusterMap.set(d.id, c.clusterSize));
            });

            // Dedup with source diversity (max 1 per source)
            const deduped = deduplicateItems(boosted, feedMap);

            // Attach cluster size for confidence display
            return deduped.slice(0, 5).map(item => ({
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
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
            </div>
            <div className="flex items-center gap-2 text-stone-600 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Ranking intelligence…
            </div>
        </div>
    );

    if (!items.length) return (
        <div className="bg-stone-900 border border-stone-800 p-5">
            <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
            </div>
            <p className="text-stone-600 text-sm">No high-signal items in the last 48h yet.</p>
        </div>
    );

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
                <span className="text-xs text-stone-600 ml-auto">macro-biased · source-diverse</span>
            </div>
            <div className="divide-y divide-stone-800/80">
                {items.map((item, idx) => {
                    const source = feedMap[item.feed_id];
                    const isOpen = expanded === item.id;
                    const isHigh = (item.importance_score ?? 0) >= 72;

                    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || (idx === 0 ? 'Trending' : 'Neutral');
                    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
                    const Icon = tagCfg.icon;

                    const happened = whatHappened(item);
                    const insight = generateInsight(item);
                    const signal = signalLevelStyle(item.importance_score);
                    const confidence = confidenceFromCluster(item._clusterSize ?? 1);

                    return (
                        <div
                            key={item.id}
                            onClick={() => setExpanded(isOpen ? null : item.id)}
                            className={`
                                px-5 py-4 cursor-pointer transition-colors
                                ${isHigh
                                    ? 'border-l-[3px] border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.03] hover:bg-[hsl(var(--primary))]/[0.06]'
                                    : 'hover:bg-stone-800/40'}
                            `}
                        >
                            <div className="flex items-start gap-3">
                                <span className={`text-xl font-black w-6 flex-shrink-0 leading-tight mt-0.5 ${idx === 0 ? 'text-[hsl(var(--primary))]' : 'text-stone-700'}`}>
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    {/* 1. Headline */}
                                    <h3 className={`text-sm leading-snug mb-1.5 ${isHigh ? 'font-bold text-white' : 'font-semibold text-stone-100'}`}>
                                        {decodeHtml(item.title)}
                                    </h3>

                                    {/* 2. What happened */}
                                    {happened && (
                                        <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>
                                    )}

                                    {/* 3. Insight */}
                                    {insight && (
                                        <p className={`text-xs font-semibold mb-2 line-clamp-1 ${tagCfg.textClass}`}>
                                            ↳ {insight}
                                        </p>
                                    )}

                                    {/* 4. Tag · Signal · Confidence */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 border ${tagCfg.color}`}>
                                            <Icon className="w-2.5 h-2.5" />{tag}
                                        </span>
                                        {signal && (
                                            <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>
                                                {signal.label}
                                            </span>
                                        )}
                                        <span className={`text-[10px] ${confidence.class}`}>{confidence.label}</span>

                                        {/* 5. Source · time */}
                                        <span className="text-xs text-stone-600 ml-auto">
                                            {source?.name}
                                            {item.published_date && <> · {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}</>}
                                        </span>
                                    </div>

                                    {/* Expanded: read link */}
                                    {isOpen && (
                                        <div className="mt-3 pt-3 border-t border-stone-800">
                                            <a
                                                href={safeUrl(item.url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:opacity-80 transition font-medium"
                                            >
                                                Read full article <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <button
                                    className="text-stone-700 hover:text-stone-400 transition flex-shrink-0 mt-0.5"
                                    onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : item.id); }}
                                >
                                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}