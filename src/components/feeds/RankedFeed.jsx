import React, { useState } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, TrendingUp, AlertTriangle, Lightbulb, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { base44 } from '@/api/base44Client';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-900',          icon: TrendingUp },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-900',             icon: AlertTriangle },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-900', icon: Lightbulb },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700',       icon: Minus },
};

function ScoreBar({ score }) {
    if (score == null) return null;
    const color = score >= 70 ? 'bg-[hsl(var(--primary))]' : score >= 40 ? 'bg-blue-500' : 'bg-stone-700';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-stone-800 overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-[10px] text-stone-600 font-mono w-8 text-right">{score}</span>
        </div>
    );
}

export default function RankedFeed({ items = [], feeds = [], bookmarkedIds = new Set(), onBookmark }) {
    const [expanded, setExpanded] = useState(null);

    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    // Sort: importance_score DESC, then recency
    const ranked = [...items].sort((a, b) => {
        const sa = a.importance_score ?? 0;
        const sb = b.importance_score ?? 0;
        if (sb !== sa) return sb - sa;
        return new Date(b.published_date) - new Date(a.published_date);
    });

    return (
        <div className="bg-stone-900 border border-stone-800 divide-y divide-stone-800">
            {ranked.length === 0 && (
                <div className="p-6 text-center text-stone-600 text-sm">No articles yet. Add feeds to start seeing your intelligence feed.</div>
            )}
            {ranked.map((item) => {
                const source = feedMap[item.feed_id];
                const tag = item.intelligence_tag;
                const tagCfg = tag ? TAG_CONFIG[tag] : null;
                const Icon = tagCfg?.icon;
                const isOpen = expanded === item.id;
                const isBookmarked = bookmarkedIds.has(item.id);

                return (
                    <div key={item.id} className="p-4 hover:bg-stone-800/30 transition-colors group">
                        <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                                {/* Meta row */}
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    {tagCfg && (
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 border ${tagCfg.color}`}>
                                            <Icon className="w-2.5 h-2.5" />{tag}
                                        </span>
                                    )}
                                    {source && <span className="text-xs text-stone-500 font-medium">{source.name}</span>}
                                    {item.category && <span className="text-xs text-stone-600">{item.category}</span>}
                                    {item.published_date && (
                                        <span className="text-xs text-stone-600 ml-auto">
                                            {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                                        </span>
                                    )}
                                </div>

                                {/* Title */}
                                <h3
                                    className="text-sm font-semibold text-stone-100 leading-snug mb-2 cursor-pointer hover:text-[hsl(var(--primary))] transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : item.id)}
                                >
                                    {decodeHtml(item.title)}
                                </h3>

                                {/* Score bar */}
                                <ScoreBar score={item.importance_score} />

                                {/* Summary — always visible if exists */}
                                {item.ai_summary && (
                                    <p className="text-xs text-stone-400 leading-relaxed mt-2 line-clamp-2">
                                        {item.ai_summary}
                                    </p>
                                )}

                                {/* Expanded detail */}
                                {isOpen && !item.ai_summary && item.description && (
                                    <p className="text-xs text-stone-400 leading-relaxed mt-2 line-clamp-4">
                                        {decodeHtml(item.description)}
                                    </p>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-3 mt-2.5">
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
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}