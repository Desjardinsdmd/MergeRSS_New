import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, Loader2, TrendingUp, AlertTriangle, Lightbulb, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-900',    icon: TrendingUp,    dot: 'bg-blue-400' },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-900',       icon: AlertTriangle, dot: 'bg-red-400' },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-900', icon: Lightbulb, dot: 'bg-emerald-400' },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700', icon: Minus,         dot: 'bg-stone-400' },
};

function TagBadge({ tag }) {
    const cfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 border ${cfg.color}`}>
            <Icon className="w-2.5 h-2.5" />
            {tag}
        </span>
    );
}

export default function TopFiveToday({ feedIds, feeds }) {
    const [expanded, setExpanded] = useState(null);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['top5today', feedIds?.join(',')],
        queryFn: async () => {
            if (!feedIds?.length) return [];
            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since24h } },
                '-importance_score',
                50
            );
            // Sort: items with importance_score first (desc), then by date
            return (raw || [])
                .sort((a, b) => {
                    const sa = a.importance_score ?? -1;
                    const sb = b.importance_score ?? -1;
                    if (sb !== sa) return sb - sa;
                    return new Date(b.published_date) - new Date(a.published_date);
                })
                .slice(0, 5);
        },
        enabled: !!feedIds?.length,
        staleTime: 5 * 60 * 1000,
    });

    const feedMap = Object.fromEntries((feeds || []).map(f => [f.id, f]));

    if (isLoading) {
        return (
            <div className="bg-stone-900 border border-stone-800 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
                </div>
                <div className="flex items-center gap-2 text-stone-600 text-sm py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading intelligence...
                </div>
            </div>
        );
    }

    if (!items.length) {
        return (
            <div className="bg-stone-900 border border-stone-800 p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
                </div>
                <p className="text-stone-600 text-sm">No items from the last 24h yet — feeds are being fetched.</p>
            </div>
        );
    }

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
                <span className="text-xs text-stone-600 ml-auto">AI-ranked · last 24h</span>
            </div>
            <div className="divide-y divide-stone-800">
                {items.map((item, idx) => {
                    const source = feedMap[item.feed_id];
                    const isOpen = expanded === item.id;
                    const tag = item.intelligence_tag || 'Neutral';
                    const score = item.importance_score;

                    return (
                        <div key={item.id} className="px-5 py-4 hover:bg-stone-800/40 transition-colors cursor-pointer" onClick={() => setExpanded(isOpen ? null : item.id)}>
                            <div className="flex items-start gap-3">
                                <span className="text-2xl font-black text-stone-700 w-7 flex-shrink-0 leading-tight mt-0.5">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                        <TagBadge tag={tag} />
                                        {score != null && (
                                            <span className="text-[10px] text-stone-600 font-mono">{score}/100</span>
                                        )}
                                    </div>
                                    <h3 className="text-sm font-semibold text-stone-100 leading-snug line-clamp-2 mb-1.5">
                                        {decodeHtml(item.title)}
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs text-stone-600">
                                        {source && <span className="text-stone-500 font-medium">{source.name}</span>}
                                        {item.published_date && (
                                            <span>{formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}</span>
                                        )}
                                    </div>

                                    {isOpen && (
                                        <div className="mt-3 space-y-2">
                                            {item.ai_summary && (
                                                <p className="text-sm text-stone-300 leading-relaxed border-l-2 border-[hsl(var(--primary))]/40 pl-3">
                                                    {item.ai_summary}
                                                </p>
                                            )}
                                            {!item.ai_summary && item.description && (
                                                <p className="text-sm text-stone-400 leading-relaxed line-clamp-3">
                                                    {decodeHtml(item.description)}
                                                </p>
                                            )}
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
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}