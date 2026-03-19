import React, { useState, useMemo } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp, LayoutList } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, whatHappened, whyItMatters, signalLevelStyle, clusterItems } from './intelligenceUtils';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-800',          icon: TrendingUp },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-800',             icon: AlertTriangle },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-800', icon: Lightbulb },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700',       icon: Minus },
};

function SignalBadge({ score }) {
    const signal = signalLevelStyle(score);
    if (!signal) return null;
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${signal.class}`}>
            {signal.label}
        </span>
    );
}

function ClusterCard({ cluster, feedMap, bookmarkedIds, onBookmark }) {
    const [showSources, setShowSources] = useState(false);
    const { primary: item, duplicates, allSources } = cluster;

    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || '')) || 'Neutral';
    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
    const Icon = tagCfg.icon;
    const source = feedMap[item.feed_id];
    const isBookmarked = bookmarkedIds.has(item.id);
    const happened = whatHappened(item);
    const why = whyItMatters(item);
    const isHighSignal = (item.importance_score ?? 0) >= 72;

    return (
        <div className={`p-4 hover:bg-stone-800/30 transition-colors group ${isHighSignal ? 'border-l-2 border-[hsl(var(--primary))]/60' : ''}`}>
            {/* Headline */}
            <a
                href={safeUrl(item.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link block mb-1.5"
            >
                <h3 className={`text-sm font-semibold leading-snug group-hover/link:text-[hsl(var(--primary))] transition-colors ${isHighSignal ? 'text-stone-50' : 'text-stone-100'}`}>
                    {decodeHtml(item.title)}
                </h3>
            </a>

            {/* What happened */}
            {happened && (
                <p className="text-xs text-stone-400 leading-snug mb-1 line-clamp-1">{happened}</p>
            )}

            {/* Why it matters */}
            {why && (
                <p className={`text-xs font-medium mb-2 line-clamp-1 ${tagCfg.color.split(' ').find(c => c.startsWith('text-'))}`}>
                    ↳ {why}
                </p>
            )}

            {/* Meta row: tag · signal · source · time */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 border ${tagCfg.color}`}>
                    <Icon className="w-2.5 h-2.5" />{tag}
                </span>
                <SignalBadge score={item.importance_score} />
                {source && <span className="text-xs text-stone-500">{source.name}</span>}
                {item.published_date && (
                    <span className="text-xs text-stone-600 ml-auto">
                        {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                    </span>
                )}
            </div>

            {/* Cluster indicator + actions */}
            <div className="flex items-center gap-3 mt-2">
                <a
                    href={safeUrl(item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:opacity-80 transition font-medium"
                >
                    Read <ExternalLink className="w-3 h-3" />
                </a>
                {onBookmark && (
                    <button
                        onClick={() => onBookmark(item)}
                        className="text-stone-600 hover:text-[hsl(var(--primary))] transition"
                        title={isBookmarked ? 'Bookmarked' : 'Bookmark'}
                    >
                        {isBookmarked
                            ? <BookmarkCheck className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                            : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                )}
                {duplicates.length > 0 && (
                    <button
                        onClick={() => setShowSources(s => !s)}
                        className="ml-auto flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 transition"
                    >
                        <LayoutList className="w-3 h-3" />
                        {duplicates.length + 1} sources
                        {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                )}
            </div>

            {/* Expanded source list */}
            {showSources && duplicates.length > 0 && (
                <div className="mt-2.5 pl-3 border-l border-stone-700 space-y-1.5">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-1">Also reported by</p>
                    {duplicates.map(dup => {
                        const dupSource = feedMap[dup.feed_id];
                        return (
                            <a
                                key={dup.id}
                                href={safeUrl(dup.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 group/dup"
                            >
                                <span className="text-xs text-stone-400 group-hover/dup:text-stone-200 transition line-clamp-1 flex-1">
                                    {dupSource?.name && <span className="text-stone-600 mr-1.5">{dupSource.name} ·</span>}
                                    {decodeHtml(dup.title)}
                                </span>
                                <ExternalLink className="w-2.5 h-2.5 text-stone-700 flex-shrink-0 opacity-0 group-hover/dup:opacity-100 transition" />
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function RankedFeed({ items = [], feeds = [], bookmarkedIds = new Set(), onBookmark }) {
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const clusters = useMemo(() => {
        const sorted = [...items].sort((a, b) => {
            const sa = a.importance_score ?? 0;
            const sb = b.importance_score ?? 0;
            if (sb !== sa) return sb - sa;
            return new Date(b.published_date) - new Date(a.published_date);
        });
        return clusterItems(sorted, feedMap);
    }, [items, feeds]);

    if (!clusters.length) {
        return (
            <div className="bg-stone-900 border border-stone-800 p-6 text-center text-stone-600 text-sm">
                No articles yet. Add feeds to start seeing your intelligence feed.
            </div>
        );
    }

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