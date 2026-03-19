import React, { useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, ExternalLink, TrendingUp, AlertTriangle, Lightbulb, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, confidenceFromCluster, clusterItems } from './intelligenceUtils';

const TAG_ICONS = { Trending: TrendingUp, Risk: AlertTriangle, Opportunity: Lightbulb, Neutral: Minus };
const TAG_TEXT   = { Trending: 'text-blue-400', Risk: 'text-red-400', Opportunity: 'text-emerald-400', Neutral: 'text-stone-500' };

const LAST_VISIT_KEY = 'mergerss_last_visit';

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

            // Cluster and keep only high-signal items
            const clusters = clusterItems(raw, feedMap);
            return clusters
                .filter(c => (c.primary.importance_score ?? 0) >= 40 || c.primary.intelligence_tag === 'Risk' || c.primary.intelligence_tag === 'Opportunity')
                .sort((a, b) => (b.primary.importance_score ?? 0) - (a.primary.importance_score ?? 0))
                .slice(0, 5)
                .map(c => ({ ...c.primary, _clusterSize: c.clusterSize }));
        },
        enabled: !!feedIds.length,
        staleTime: 2 * 60 * 1000,
    });

    if (!newItems.length) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <Bell className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">What Changed</h2>
                <span className="text-xs text-stone-600 ml-auto">since {sinceLabel} ago</span>
            </div>
            <div className="divide-y divide-stone-800/80">
                {newItems.map((item) => {
                    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
                    const TagIcon = TAG_ICONS[tag] || Minus;
                    const tagTextClass = TAG_TEXT[tag] || 'text-stone-500';
                    const signal = signalLevelStyle(item.importance_score);
                    const confidence = confidenceFromCluster(item._clusterSize ?? 1);
                    const happened = whatHappened(item);
                    const insight = generateInsight(item);
                    const source = feedMap[item.feed_id];
                    const isHigh = (item.importance_score ?? 0) >= 72;

                    return (
                        <div key={item.id} className={`px-5 py-3.5 hover:bg-stone-800/30 transition-colors ${isHigh ? 'border-l-[3px] border-[hsl(var(--primary))]' : ''}`}>
                            {/* 1. Headline */}
                            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 mb-1.5">
                                <h3 className="text-sm font-semibold text-stone-100 leading-snug group-hover:text-[hsl(var(--primary))] transition-colors line-clamp-2 flex-1">
                                    {decodeHtml(item.title)}
                                </h3>
                                <ExternalLink className="w-3 h-3 text-stone-600 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>

                            {/* 2. What happened */}
                            {happened && (
                                <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>
                            )}

                            {/* 3. Insight */}
                            {insight && (
                                <p className={`text-xs font-semibold mb-2 line-clamp-1 ${tagTextClass}`}>↳ {insight}</p>
                            )}

                            {/* 4. Tag · Signal · Confidence · 5. Source · time */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-500">
                                    <TagIcon className="w-2.5 h-2.5" />{tag}
                                </span>
                                {signal && (
                                    <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>
                                        {signal.label}
                                    </span>
                                )}
                                <span className={`text-[10px] ${confidence.class}`}>{confidence.label}</span>
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