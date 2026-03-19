import React, { useState, useMemo } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, LayoutList } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, generateInsight, signalLevelStyle, confidenceFromCluster, decisionState, clusterItems } from './intelligenceUtils';

const TAG_CONFIG = {
    Trending:    { textClass: 'text-blue-400',    icon: TrendingUp },
    Risk:        { textClass: 'text-red-400',     icon: AlertTriangle },
    Opportunity: { textClass: 'text-emerald-400', icon: Lightbulb },
    Neutral:     { textClass: 'text-stone-500',   icon: Minus },
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

    // Skip Low Priority items in the ranked feed — keep it signal-dense
    if (decision.priority === 0) return null;

    return (
        <div className={[
            'p-4 transition-colors group',
            isHigh
                ? 'border-l-[3px] border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.03] hover:bg-[hsl(var(--primary))]/[0.06]'
                : 'hover:bg-stone-800/30',
        ].join(' ')}>
            {/* Decision state + tag */}
            <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${decision.style}`}>
                    {decision.label}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-600">
                    <Icon className="w-2.5 h-2.5" />{tag}
                </span>
            </div>

            {/* Headline */}
            <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="group/link block mb-1">
                <h3 className={`text-sm leading-snug group-hover/link:text-[hsl(var(--primary))] transition-colors line-clamp-1 ${isHigh ? 'font-bold text-white' : 'font-semibold text-stone-100'}`}>
                    {decodeHtml(item.title)}
                </h3>
            </a>

            {/* What happened */}
            {happened && (
                <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>
            )}

            {/* Insight */}
            {insight && (
                <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.textClass}`}>
                    ↳ {insight}
                </p>
            )}

            {/* Signal · confidence · source · time + actions */}
            <div className="flex items-center gap-2 flex-wrap">
                {signal && (
                    <span className={`text-[10px] px-1.5 py-0.5 border ${signal.class}`}>
                        {signal.label}
                    </span>
                )}
                <span className={`inline-flex items-center gap-1 text-[10px] ${confidence.class}`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidence.dot}`} />
                    {confidence.label}
                </span>
                {source && <span className="text-xs text-stone-500">{source.name}</span>}
                {item.published_date && (
                    <span className="text-xs text-stone-600 ml-auto">
                        {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                    </span>
                )}

                <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-stone-600 hover:text-[hsl(var(--primary))] transition">
                    <ExternalLink className="w-3 h-3" />
                </a>
                {onBookmark && (
                    <button onClick={() => onBookmark(item)} className="text-stone-600 hover:text-[hsl(var(--primary))] transition" title={isBookmarked ? 'Bookmarked' : 'Bookmark'}>
                        {isBookmarked
                            ? <BookmarkCheck className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                            : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                )}
                {duplicates.length > 0 && (
                    <button
                        onClick={() => setShowSources(s => !s)}
                        className="flex items-center gap-0.5 text-[10px] text-stone-600 hover:text-stone-300 transition"
                    >
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
                            className="flex items-center gap-1.5 group/dup">
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