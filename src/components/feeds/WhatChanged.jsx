import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, ExternalLink, ArrowUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, confidenceFromCluster, decisionState, clusterItems } from './intelligenceUtils';
import { queryArticles } from '@/api/articles';

const LAST_VISIT_KEY = 'mergerss_last_visit';

function getChangeLabel(item, clusterSize) {
    const d = decisionState(item, clusterSize);
    const c = confidenceFromCluster(clusterSize);
    if (c.label === 'Validated') return { text: 'Now validated', color: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' };
    if (d.label === 'Important') return { text: 'Important', color: 'text-[#C4A5FD] bg-[hsl(var(--primary)/0.12)] border-[hsl(var(--primary)/0.3)]' };
    if (c.label === 'Building') return { text: 'Building', color: 'text-sky-300 bg-sky-400/10 border-sky-400/25' };
    return { text: 'New', color: 'text-stone-300 bg-white/[0.03] border-white/15' };
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
            const raw = await queryArticles({ feed_ids: feedIds, since, sort: '-importance_score', limit: 80 });
            if (!raw?.length) return [];
            const clusters = clusterItems(raw, feedMap);
            const filtered = clusters
                .filter(c => (c.primary.importance_score ?? 0) >= 40 || c.primary.intelligence_tag === 'Risk' || c.primary.intelligence_tag === 'Opportunity')
                .sort((a, b) => (b.primary.importance_score ?? 0) - (a.primary.importance_score ?? 0));

            // Category diversity — max 2 per category in top 6
            const result = [];
            const catCount = {};
            for (const c of filtered) {
                const cat = (c.primary.category || 'Uncategorized').toLowerCase();
                catCount[cat] = (catCount[cat] || 0);
                if (catCount[cat] >= 2) continue;
                catCount[cat]++;
                result.push(c);
                if (result.length >= 6) break;
            }
            return result.map(c => ({ ...c.primary, _clusterSize: c.clusterSize }));
        },
        enabled: !!feedIds.length,
        staleTime: 2 * 60 * 1000,
    });

    if (!newItems.length) return null;

    return (
        <div className="panel overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2.5 border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
                    <Bell className="w-3.5 h-3.5 text-stone-300" aria-hidden="true" />
                </div>
                <h2 className="font-display text-lg font-semibold text-stone-100">Since your last visit</h2>
                <span className="meta ml-auto">{sinceLabel} ago · {newItems.length} update{newItems.length > 1 ? 's' : ''}</span>
            </div>

            <div className="divide-y divide-white/[0.05]">
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
                            'px-5 py-4 transition-colors hover:bg-white/[0.03]',
                            isHigh ? 'bg-[hsl(var(--primary)/0.04)]' : '',
                        ].join(' ')}>
                            {/* Change label — prominent */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${changeLabel.color}`}>
                                    {changeLabel.text}
                                </span>
                                {clusterSize > 1 && (
                                    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                                        <ArrowUp className="w-2.5 h-2.5" />{clusterSize} sources
                                    </span>
                                )}
                                {tag !== 'Neutral' && (
                                    <span className="meta">{tag}</span>
                                )}
                            </div>

                            {/* Headline */}
                            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 mb-1.5">
                                <h3 className="line-clamp-2 flex-1 font-sans text-[15px] font-semibold leading-snug tracking-normal text-stone-100 transition-colors group-hover:text-[#C4A5FD]">
                                    {decodeHtml(item.title)}
                                </h3>
                                <ExternalLink className="w-3 h-3 text-stone-500 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>

                            {/* What happened */}
                            {happened && <p className="mb-1.5 line-clamp-1 text-[13px] leading-snug text-stone-400">{happened}</p>}

                            {/* Insight */}
                            {insight && (
                                <p className={`text-xs font-medium mb-2 line-clamp-1 ${
                                    tag === 'Risk' ? 'text-red-400' : tag === 'Opportunity' ? 'text-emerald-400' : 'text-sky-400'
                                }`}>↳ {insight}</p>
                            )}

                            {/* Source + time */}
                            <div className="flex items-center gap-2">
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