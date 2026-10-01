import React, { useState, useMemo } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, LayoutList, ArrowUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, confidenceFromCluster, decisionState, clusterItems } from './intelligenceUtils';
import { rankClusters, explainTrendScore } from '@/lib/trendScoring';
import { updateAndGetEvolution, recordInteraction } from './storyMemory';

const TAG_CONFIG = {
    Trending:    { textClass: 'text-sky-400',     icon: TrendingUp },
    Risk:        { textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { textClass: 'text-stone-500',   icon: Minus },
};

const LIFECYCLE_STYLE = {
    Developing: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10',
    Evolving:   'text-sky-300 border-sky-400/25 bg-sky-400/10',
    Fading:     'text-stone-500 border-white/10',
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
    const trendComponents = useMemo(() => explainTrendScore(cluster), [cluster]);

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
                ? 'bg-[hsl(var(--primary)/0.04)] hover:bg-[hsl(var(--primary)/0.07)]'
                : 'hover:bg-white/[0.03]',
        ].join(' ')}>
            {/* Row 1: primary labels — decision state + confidence progression only */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${decision.style}`}>
                    {decision.label}
                </span>

                {/* Progression signals — high value, always show */}
                {evolution.stateProgression === 'Upgraded' && (
                    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                        <ArrowUp className="w-2.5 h-2.5" />Upgraded
                    </span>
                )}
                {evolution.confidenceProgression && (
                    <span className="font-mono text-[10px] font-semibold text-emerald-400">{evolution.confidenceProgression}</span>
                )}

                {/* Lifecycle + tag — de-emphasized, right-aligned */}
                <div className="ml-auto flex items-center gap-1.5">
                    {evolution.lifecycle && (
                        <span className="meta text-stone-600">{evolution.lifecycle}</span>
                    )}
                    <span className="meta inline-flex items-center gap-0.5 text-stone-600">
                        <Icon className="w-2 h-2" />{tag}
                    </span>
                </div>
            </div>

            {/* Headline */}
            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer"
                className="group/link block mb-1" onClick={handleClick}>
                <h3 className="line-clamp-1 font-sans text-[15px] font-semibold leading-snug tracking-normal text-stone-100 transition-colors group-hover/link:text-[#C4A5FD]">
                    {decodeHtml(item.title)}
                </h3>
            </a>

            {happened && <p className="mb-1 line-clamp-1 text-[13px] leading-snug text-stone-400">{happened}</p>}
            {insight && <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.textClass}`}>↳ {insight}</p>}

            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap">
                {signal && <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>{signal.label}</span>}
                <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider ${confidence.class}`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidence.dot}`} />
                    {confidence.label}
                </span>
                {/* Momentum arrow */}
                {evolution.momentum !== 'stable' && clusterSize > 1 && (
                    <span className={`font-mono text-[10px] font-semibold ${evolution.momentum === 'growing' ? 'text-emerald-400' : 'text-stone-500'}`}>
                        {evolution.momentumIcon} {clusterSize} sources
                    </span>
                )}
                {source && <span className="meta">{source.name}</span>}
                {item.published_date && (
                    <span className="meta ml-auto">
                        {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                    </span>
                )}
                <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" onClick={handleClick}
                    className="rounded-md text-stone-500 transition hover:text-[#C4A5FD]" aria-label="Open story in new tab">
                    <ExternalLink className="w-3 h-3" />
                </a>
                {onBookmark && (
                    <button onClick={handleBookmarkClick} className="rounded-md text-stone-500 transition hover:text-[#C4A5FD]" aria-label={isBookmarked ? 'Saved' : 'Save story'}>
                        {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 text-[hsl(var(--primary))]" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                )}
                {duplicates.length > 0 && (
                    <button onClick={() => setShowSources(s => !s)}
                        aria-expanded={showSources}
                        className="flex items-center gap-0.5 font-mono text-[10px] text-stone-500 transition hover:text-stone-300">
                        <LayoutList className="w-3 h-3" />
                        {clusterSize}
                        {showSources ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                    </button>
                )}
            </div>

            {showSources && duplicates.length > 0 && (
                <div className="mt-2 space-y-1 border-l border-white/10 pl-3">
                    {duplicates.map(dup => (
                        <a key={dup.id} href={safeUrl(dup.url)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 group/dup" onClick={handleClick}>
                            <span className="text-xs text-stone-500 group-hover/dup:text-stone-300 transition line-clamp-1">
                                <span className="font-mono text-[11px] text-stone-600">{feedMap[dup.feed_id]?.name} · </span>
                                {decodeHtml(dup.title)}
                            </span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function RankedFeed({ items = [], feeds = [], storyClusters = [], bookmarkedIds = new Set(), onBookmark }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    // Build a lookup: cluster_id → StoryCluster (for merging backend trend_score)
    const clusterDataMap = useMemo(() =>
        Object.fromEntries(storyClusters.map(c => [c.id, c])),
    [storyClusters]);

    const clusters = useMemo(() => {
        const sorted = [...items].sort((a, b) => {
            const diff = (b.importance_score ?? 0) - (a.importance_score ?? 0);
            return diff !== 0 ? diff : new Date(b.published_date) - new Date(a.published_date);
        });
        const raw = clusterItems(sorted, feedMap);

        // Merge backend StoryCluster fields (trend_score, trend_score_components,
        // velocity_score, source_domains) onto each client cluster object.
        // This allows rankClusters() to use persisted trend_score as primary sort key.
        const enriched = raw.map(cluster => {
            const backendCluster = clusterDataMap[cluster.primary.cluster_id];
            if (!backendCluster) return cluster;
            return {
                ...cluster,
                trend_score: backendCluster.trend_score,
                trend_score_components: backendCluster.trend_score_components,
                velocity_score: backendCluster.velocity_score,
                source_domains: backendCluster.source_domains,
                // Prefer backend article_count for confidence signals
                clusterSize: Math.max(cluster.clusterSize, backendCluster.article_count || 1),
                first_seen_at: backendCluster.first_seen_at,
                last_updated_at: backendCluster.last_updated_at,
                importance_score: backendCluster.importance_score ?? cluster.primary.importance_score,
            };
        });

        return rankClusters(enriched); // sort by persisted trend_score (falls back to estimate if absent)
    }, [items, feeds, clusterDataMap]);

    if (!clusters.length) return (
        <div className="panel p-6 text-center text-sm text-stone-500">
            No stories yet. Add sources to start ranking stories.
        </div>
    );

    return (
        <div className="panel divide-y divide-white/[0.05] overflow-hidden">
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