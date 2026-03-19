import React, { useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, ExternalLink, ArrowUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, confidenceFromCluster, decisionState, clusterItems } from './intelligenceUtils';

const LAST_VISIT_KEY = 'mergerss_last_visit';

function getChangeLabel(item, clusterSize) {
    const d = decisionState(item, clusterSize);
    const c = confidenceFromCluster(clusterSize);
    if (c.label === 'Validated') return { text: 'Now Validated', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' };
    if (d.label === 'Important') return { text: 'Important', color: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/30' };
    if (c.label === 'Building') return { text: 'Building', color: 'text-sky-400 bg-sky-950/30 border-sky-800/40' };
    return { text: 'New', color: 'text-stone-400 bg-stone-800/50 border-stone-700' };
}

export default function WhatChanged({ feedIds = [], feeds = [] }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const lastVisit = useMemo(() => {
        const stored = localStorage.getItem(LAST_VISIT_KEY);
        return stored ? new Date(stored) : new Date(Date.now() - 8 * 60 * 60 * 1000);
    }, []);

    useEffect(() => {
        localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    }, []);

    const since = lastVisit.toISOString();
    const sinceLabel = formatDistanceToNow(lastVisit, { addSuffix: false });

    const { data: newItems = [] } = useQuery({
        queryKey: ['what-changed', feedIds.join(','), since],
        queryFn: async () => {
            if (!feedIds.length) return [];
            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since } },
                '-importance_score',
                80
            );
            if (!raw?.length) return [];
            const clusters = clusterItems(raw, feedMap);
            return clusters
                .filter(c => (c.primary.importance_score ?? 0) >= 40 || c.primary.intelligence_tag === 'Risk' || c.primary.intelligence_tag === 'Opportunity')
                .sort((a, b) => (b.primary.importance_score ?? 0) - (a.primary.importance_score ?? 0))
                .slice(0, 6)
                .map(c => ({ ...c.primary, _clusterSize: c.clusterSize }));
        },
        enabled: !!feedIds.length,
        staleTime: 2 * 60 * 1000,
    });

    if (!newItems.length) return null;

    return (
        <div className="bg-stone-950 border-2 border-stone-700">
            {/* Header — stronger visual presence */}
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-stone-700 bg-stone-900">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
                    <Bell className="w-3.5 h-3.5 text-stone-300" />
                </div>
                <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider">Since Your Last Visit</h2>
                <span className="text-xs text-stone-500 ml-auto">{sinceLabel} ago · {newItems.length} update{newItems.length > 1 ? 's' : ''}</span>
            </div>

            <div className="divide-y divide-stone-800/80">
                {newItems.map((item) => {
                    const clusterSize = item._clusterSize ?? 1;
                    const changeLabel = getChangeLabel(item, clusterSize);
                    const happened = whatHappened(item);
                    const insight = generateInsight(item);
                    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
                    const source = feedMap[item.feed_id];
                    const isHigh = (item.importance_score ?? 0) >= 72;

                    return (
                        <div key={item.id} className={[
                            'px-5 py-4 hover:bg-stone-900/60 transition-colors',
                            isHigh ? 'border-l-[3px] border-[hsl(var(--primary))]' : 'border-l-[3px] border-transparent',
                        ].join(' ')}>
                            {/* Change label — prominent */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 border ${changeLabel.color}`}>
                                    {changeLabel.text}
                                </span>
                                {clusterSize > 1 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-semibold">
                                        <ArrowUp className="w-2.5 h-2.5" />{clusterSize} sources
                                    </span>
                                )}
                                {tag !== 'Neutral' && (
                                    <span className="text-[10px] text-stone-600">{tag}</span>
                                )}
                            </div>

                            {/* Headline */}
                            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 mb-1.5">
                                <h3 className="text-sm font-semibold text-stone-100 leading-snug group-hover:text-[hsl(var(--primary))] transition-colors line-clamp-2 flex-1">
                                    {decodeHtml(item.title)}
                                </h3>
                                <ExternalLink className="w-3 h-3 text-stone-600 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>

                            {/* What happened */}
                            {happened && <p className="text-xs text-stone-400 leading-snug mb-1.5 line-clamp-1">{happened}</p>}

                            {/* Insight */}
                            {insight && (
                                <p className={`text-xs font-medium mb-2 line-clamp-1 ${
                                    tag === 'Risk' ? 'text-red-400' : tag === 'Opportunity' ? 'text-emerald-400' : 'text-blue-400'
                                }`}>↳ {insight}</p>
                            )}

                            {/* Source + time */}
                            <div className="flex items-center gap-2">
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