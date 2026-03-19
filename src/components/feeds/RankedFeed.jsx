import React, { useState } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, TrendingUp, AlertTriangle, Lightbulb, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, summaryText, whyItMatters } from './intelligenceUtils';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-800',          icon: TrendingUp,    bar: 'bg-blue-500' },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-800',             icon: AlertTriangle, bar: 'bg-red-500' },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-800', icon: Lightbulb,     bar: 'bg-emerald-500' },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700',       icon: Minus,         bar: 'bg-stone-600' },
};

function ScoreBar({ score }) {
    if (score == null) return null;
    const bar = score >= 70 ? 'bg-[hsl(var(--primary))]' : score >= 40 ? 'bg-blue-500' : 'bg-stone-600';
    return (
        <div className="flex items-center gap-1.5 mt-1.5">
            <div className="flex-1 h-0.5 bg-stone-800 overflow-hidden">
                <div className={`h-full ${bar} transition-all`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-[9px] text-stone-600 font-mono">{score}</span>
        </div>
    );
}

export default function RankedFeed({ items = [], feeds = [], bookmarkedIds = new Set(), onBookmark }) {
    const [expanded, setExpanded] = useState(null);
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const ranked = [...items].sort((a, b) => {
        const sa = a.importance_score ?? 0;
        const sb = b.importance_score ?? 0;
        if (sb !== sa) return sb - sa;
        return new Date(b.published_date) - new Date(a.published_date);
    });

    if (!ranked.length) {
        return (
            <div className="bg-stone-900 border border-stone-800 p-6 text-center text-stone-600 text-sm">
                No articles yet. Add feeds to start seeing your intelligence feed.
            </div>
        );
    }

    return (
        <div className="bg-stone-900 border border-stone-800 divide-y divide-stone-800/80">
            {ranked.map((item) => {
                const source = feedMap[item.feed_id];
                const isOpen = expanded === item.id;
                const isBookmarked = bookmarkedIds.has(item.id);

                // Always resolve a tag
                const tag = item.intelligence_tag ||
                    inferTag((item.title || '') + ' ' + (item.description || '')) ||
                    'Neutral';
                const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
                const Icon = tagCfg.icon;

                const summary = summaryText(item);
                const why = whyItMatters(item);

                return (
                    <div key={item.id} className="p-4 hover:bg-stone-800/30 transition-colors group">
                        {/* Meta row */}
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 border tracking-wide ${tagCfg.color}`}>
                                <Icon className="w-2.5 h-2.5" />{tag.toUpperCase()}
                            </span>
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
                            className="text-sm font-semibold text-stone-100 leading-snug mb-1.5 cursor-pointer hover:text-[hsl(var(--primary))] transition-colors"
                            onClick={() => setExpanded(isOpen ? null : item.id)}
                        >
                            {decodeHtml(item.title)}
                        </h3>

                        {/* Why it matters — always visible */}
                        {why && (
                            <p className={`text-xs font-medium mb-1 ${tagCfg.color.split(' ').find(c => c.startsWith('text-'))}`}>
                                ↳ {why}
                            </p>
                        )}

                        {/* Summary — always visible, 2-line clamp unless expanded */}
                        {summary && (
                            <p className={`text-xs text-stone-400 leading-relaxed ${isOpen ? '' : 'line-clamp-2'}`}>
                                {summary}
                            </p>
                        )}

                        {/* Score bar */}
                        <ScoreBar score={item.importance_score} />

                        {/* Actions */}
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
                        </div>
                    </div>
                );
            })}
        </div>
    );
}