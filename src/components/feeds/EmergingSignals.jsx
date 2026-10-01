import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, TrendingUp, AlertTriangle, Lightbulb, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, decisionState, clusterItems } from './intelligenceUtils';
import { queryArticles } from '@/api/articles';

const TAG_CONFIG = {
    Trending:    { textClass: 'text-sky-400',     icon: TrendingUp },
    Risk:        { textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { textClass: 'text-stone-500',   icon: Minus },
};

export default function EmergingSignals({ feedIds = [], feeds = [], top5Ids = new Set() }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: emerging = [] } = useQuery({
        queryKey: ['emerging-signals', feedIds.join(',')],
        queryFn: async () => {
            if (!feedIds.length) return [];
            const raw = await queryArticles({ feed_ids: feedIds, since: since24h, sort: '-importance_score', limit: 100 });
            if (!raw?.length) return [];

            const clusters = clusterItems(raw, feedMap);

            const filtered = clusters
                .filter(c => {
                    const score = c.primary.importance_score ?? 0;
                    const insight = generateInsight(c.primary);
                    const hasSpecificInsight = insight &&
                        !insight.startsWith('Downside signal') &&
                        !insight.startsWith('Upside signal') &&
                        !insight.startsWith('Broad coverage');
                    return c.clusterSize <= 2 && score >= 65 && !top5Ids.has(c.primary.id) && hasSpecificInsight;
                })
                .sort((a, b) => (b.primary.importance_score ?? 0) - (a.primary.importance_score ?? 0));

            // Category diversity — max 1 per category to surface different topics
            const result = [];
            const seenCats = new Set();
            for (const c of filtered) {
                const cat = (c.primary.category || 'Uncategorized').toLowerCase();
                if (seenCats.has(cat)) continue;
                seenCats.add(cat);
                result.push(c);
                if (result.length >= 3) break;
            }
            return result.map(c => ({ ...c.primary, _clusterSize: c.clusterSize }));
        },
        enabled: !!feedIds.length,
        staleTime: 5 * 60 * 1000,
    });

    if (!emerging.length) return null;

    return (
        <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-5 py-3.5">
                <Zap className="w-3.5 h-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-stone-100">Early trends</h2>
                <span className="meta ml-1">worth watching early</span>
                <span className="chip-brand ml-auto">
                    low confirmation · high potential
                </span>
            </div>
            <div className="divide-y divide-white/[0.05]">
                {emerging.map((item) => {
                    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
                    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
                    const Icon = tagCfg.icon;
                    const signal = signalLevelStyle(item.importance_score);
                    const clusterSize = item._clusterSize ?? 1;
                    const happened = whatHappened(item);
                    const insight = generateInsight(item);
                    const source = feedMap[item.feed_id];
                    const decision = decisionState(item, clusterSize);

                    return (
                        <div key={item.id} className="px-5 py-3.5 transition-colors hover:bg-white/[0.03]">
                            {/* Decision state */}
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${decision.style}`}>
                                    {decision.label}
                                </span>
                                <span className="meta inline-flex items-center gap-0.5">
                                    <Icon className="w-2.5 h-2.5" />{tag}
                                </span>
                                <span className="meta ml-auto text-[#C4A5FD]">Early · {clusterSize === 1 ? '1 source' : `${clusterSize} sources`}</span>
                            </div>

                            {/* Headline */}
                            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="group block mb-1">
                                <h3 className="line-clamp-1 font-sans text-[15px] font-semibold leading-snug tracking-normal text-stone-100 transition-colors group-hover:text-[#C4A5FD]">
                                    {decodeHtml(item.title)}
                                </h3>
                            </a>

                            {/* What happened */}
                            {happened && (
                                <p className="mb-1 line-clamp-1 text-[13px] leading-snug text-stone-400">{happened}</p>
                            )}

                            {/* Insight */}
                            {insight && (
                                <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.textClass}`}>
                                    ↳ {insight}
                                </p>
                            )}

                            {/* Signal · source · time */}
                            <div className="flex items-center gap-2">
                                {signal && (
                                    <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>
                                        {signal.label}
                                    </span>
                                )}
                                {source && <span className="meta">{source.name}</span>}
                                <span className="meta ml-auto">
                                    {item.published_date && formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}