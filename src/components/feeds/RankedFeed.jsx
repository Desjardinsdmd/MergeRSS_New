import React, { useState, useMemo, useEffect } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, LayoutList, ArrowUp, ArrowDown, Minus as MinusIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, confidenceFromCluster, decisionState, clusterItems } from './intelligenceUtils';
import { rankClusters, explainTrendScore } from '@/lib/trendScoring';
import { updateAndGetEvolution, recordInteraction } from './storyMemory';

const TAG_CONFIG = {
    Trending:    { textClass: 'text-blue-400',    icon: TrendingUp },
    Risk:        { textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { textClass: 'text-stone-500',   icon: Minus },
};

const LIFECYCLE_STYLE = {
    Developing: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30',
    Evolving:   'text-sky-400 border-sky-800/50 bg-sky-950/30',
    Fading:     'text-stone-500 border-stone-700 bg-stone-800/30',
};

function ClusterCard({ cluster, feedMap, bookmarkedIds, onBookmark }) {
    const [showSources, setShowSources] = useState(false);
    const { primary: item, duplicates, clusterSize } = cluster;

    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
    const Icon = tagCfg.icon;
    const source = feedMap[item.feed_id];
    const isBookmarked = bookmarkedIds.has(item.id);
    const isHigh = (item.importance_score ?? 0) >= 72;

    const happened = whatHappened(item);
    const insight = generateInsight(item);
    const signal = signalLevelStyle(item.importance_score);
    const confidence = confidenceFromCluster(clusterSize);
    const decision = decisionState(item, clusterSize);

    // Evolution signals from persistent memory
    const evolution = useMemo(() =>
        updateAndGetEvolution(cluster, decision.label, confidence.label),
    [cluster.primary.id, clusterSize, decision.label, confidence.label]);

    if (decision.priority === 0) return null;

    const handleClick = () => recordInteraction(item.title, 'click');
    const handleBookmarkClick = () => {
        recordInteraction(item.title, 'save');
        onBookmark(item);
    };

    return (
        <div className={[
            'p-4 transition-colors group',
            isHigh
                ? 'border-l-[3px] border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.03] hover:bg-[hsl(var(--primary))]/[0.06]'
                : 'hover:bg-stone-800/30',
        ].join(' ')}>
            {/* Row 1: primary labels — decision state + confidence progression only */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${decision.style}`}>
                    {decision.label}
                </span>

                {/* Progression signals — high value, always show */}
                {evolution.stateProgression === 'Upgraded' && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-semibold">
                        <ArrowUp className="w-2.5 h-2.5" />Upgraded
                    </span>
                )}
                {evolution.confidenceProgression && (
                    <span className="text-[10px] text-emerald-400 font-semibold">{evolution.confidenceProgression}</span>
                )}

                {/* Lifecycle + tag — de-emphasized, right-aligned */}
                <div className="ml-auto flex items-center gap-1.5 opacity-50">
                    {evolution.lifecycle && (
                        <span className="text-[9px] text-stone-500">{evolution.lifecycle}</span>
                    )}
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-stone-600">
                        <Icon className="w-2 h-2" />{tag}
                    </span>
                </div>
            </div>

            {/* Headline */}
            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer"
                className="group/link block mb-1" onClick={handleClick}>
                <h3 className={`text-sm leading-snug group-hover/link:text-[hsl(var(--primary))] transition-colors line-clamp-1 ${isHigh ? 'font-bold text-white' : 'font-semibold text-stone-100'}`}>
                    {decodeHtml(item.title)}
                </h3>
            </a>

            {happened && <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>}
            {insight && <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.textClass}`}>↳ {insight}</p>}

            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap">
                {signal && <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>{signal.label}</span>}
                <span className={`inline-flex items-center gap-1 text-[10px] ${confidence.class}`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidence.dot}`} />
                    {confidence.label}
                </span>
                {/* Momentum arrow */}
                {evolution.momentum !== 'stable' && clusterSize > 1 && (
                    <span className={`text-[10px] font-bold ${evolution.momentum === 'growing' ? 'text-emerald-400' : 'text-stone-600'}`}>
                        {evolution.momentumIcon} {clusterSize} sources
                    </span>
                )}
                {source && <span className="text-xs text-stone-500">{source.name}</span>}
                {item.published_date && (
                    <span className="text-xs text-stone-600 ml-auto">
                        {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                    </span>
                )}
                <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" onClick={handleClick}
                    className="text-stone-600 hover:text-[hsl(var(--primary))] transition">
                    <ExternalLink className="w-3 h-3" />
                </a>
                {onBookmark && (
                    <button onClick={handleBookmarkClick} className="text-stone-600 hover:text-[hsl(var(--primary))] transition">
                        {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 text-[hsl(var(--primary))]" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                )}
                {duplicates.length > 0 && (
                    <button onClick={() => setShowSources(s => !s)}
                        className="flex items-center gap-0.5 text-[10px] text-stone-600 hover:text-stone-300 transition">
                        <LayoutList className="w-3 h-3" />
                        {clusterSize}
                        {showSources ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                    </button>
                )}
            </div>

            {showSources && duplicates.length > 0 && (
                <div className="mt-2 pl-3 border-l border-stone-700 space-y-1">
                    {duplicates.map(dup => (
                        <a key={dup.id} href={safeUrl(dup.url)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 group/dup" onClick={handleClick}>
                            <span className="text-xs text-stone-500 group-hover/dup:text-stone-300 transition line-clamp-1">
                                <span className="text-stone-700">{feedMap[dup.feed_id]?.name} · </span>
                                {decodeHtml(dup.title)}
                            </span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function RankedFeed({ items = [], feeds = [], bookmarkedIds = new Set(), onBookmark }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const clusters = useMemo(() => {
        const sorted = [...items].sort((a, b) => {
            const diff = (b.importance_score ?? 0) - (a.importance_score ?? 0);
            return diff !== 0 ? diff : new Date(b.published_date) - new Date(a.published_date);
        });
        return clusterItems(sorted, feedMap);
    }, [items, feeds]);

    if (!clusters.length) return (
        <div className="bg-stone-900 border border-stone-800 p-6 text-center text-stone-600 text-sm">
            No articles yet. Add feeds to start your intelligence feed.
        </div>
    );

    return (
        <div className="bg-stone-900 border border-stone-800 divide-y divide-stone-800/80">
            {clusters.map(cluster => (
                <ClusterCard
                    key={cluster.primary.id}
                    cluster={cluster}
                    feedMap={feedMap}
                    bookmarkedIds={bookmarkedIds}
                    onBookmark={onBookmark}
                />
            ))}
        </div>
    );
}