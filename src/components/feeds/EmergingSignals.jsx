import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, TrendingUp, AlertTriangle, Lightbulb, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, clusterItems } from './intelligenceUtils';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-800', icon: TrendingUp },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-800',    icon: AlertTriangle },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-800', icon: Lightbulb },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700', icon: Minus },
};

export default function EmergingSignals({ feedIds = [], feeds = [], top5Ids = new Set() }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: emerging = [] } = useQuery({
        queryKey: ['emerging-signals', feedIds.join(',')],
        queryFn: async () => {
            if (!feedIds.length) return [];
            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since24h } },
                '-importance_score',
                100
            );
            if (!raw?.length) return [];

            // Cluster to get cluster sizes
            const clusters = clusterItems(raw, feedMap);

            // Emerging = solo or duo signals (cluster size 1–2) with score >= 60, not in top5
            return clusters
                .filter(c => c.clusterSize <= 2 && (c.primary.importance_score ?? 0) >= 60 && !top5Ids.has(c.primary.id))
                .sort((a, b) => (b.primary.importance_score ?? 0) - (a.primary.importance_score ?? 0))
                .slice(0, 5)
                .map(c => c.primary);
        },
        enabled: !!feedIds.length,
        staleTime: 5 * 60 * 1000,
    });

    if (!emerging.length) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <Zap className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Emerging Signals</h2>
                <span className="text-xs text-stone-600 ml-auto">single-source · last 24h</span>
            </div>
            <div className="divide-y divide-stone-800/80">
                {emerging.map((item) => {
                    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
                    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
                    const Icon = tagCfg.icon;
                    const signal = signalLevelStyle(item.importance_score);
                    const happened = whatHappened(item);
                    const insight = generateInsight(item);
                    const source = feedMap[item.feed_id];

                    return (
                        <div key={item.id} className="px-5 py-3.5 hover:bg-stone-800/30 transition-colors">
                            {/* Headline */}
                            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="group block mb-1.5">
                                <h3 className="text-sm font-semibold text-stone-100 leading-snug line-clamp-2 group-hover:text-[hsl(var(--primary))] transition-colors">
                                    {decodeHtml(item.title)}
                                </h3>
                            </a>

                            {/* What happened */}
                            {happened && (
                                <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>
                            )}

                            {/* Insight */}
                            {insight && (
                                <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.color.split(' ').find(c => c.startsWith('text-'))}`}>
                                    ↳ {insight}
                                </p>
                            )}

                            {/* Tag · signal · source · time */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 border ${tagCfg.color}`}>
                                    <Icon className="w-2.5 h-2.5" />{tag}
                                </span>
                                {signal && (
                                    <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>
                                        {signal.label}
                                    </span>
                                )}
                                <span className="text-[10px] text-stone-600 italic">unconfirmed</span>
                                {source && <span className="text-xs text-stone-600">{source.name}</span>}
                                <span className="text-xs text-stone-700 ml-auto">
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