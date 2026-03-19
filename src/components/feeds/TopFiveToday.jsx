import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink, Loader2, TrendingUp, AlertTriangle, Lightbulb, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { inferTag, summaryText, whyItMatters, deduplicateItems } from './intelligenceUtils';

const TAG_CONFIG = {
    Trending:    { color: 'bg-blue-950 text-blue-400 border-blue-800',         icon: TrendingUp,    bar: 'bg-blue-500' },
    Risk:        { color: 'bg-red-950 text-red-400 border-red-800',            icon: AlertTriangle, bar: 'bg-red-500' },
    Opportunity: { color: 'bg-emerald-950 text-emerald-400 border-emerald-800',icon: Lightbulb,     bar: 'bg-emerald-500' },
    Neutral:     { color: 'bg-stone-800 text-stone-400 border-stone-700',      icon: Minus,         bar: 'bg-stone-600' },
};

function TagBadge({ tag }) {
    const cfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border tracking-wide ${cfg.color}`}>
            <Icon className="w-2.5 h-2.5" />{tag.toUpperCase()}
        </span>
    );
}

function ScoreDot({ score }) {
    if (score == null) return null;
    const color = score >= 70 ? 'bg-[hsl(var(--primary))]' : score >= 40 ? 'bg-blue-500' : 'bg-stone-600';
    return (
        <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} title={`Importance: ${score}/100`} />
    );
}

export default function TopFiveToday({ feedIds, feeds }) {
    const [expanded, setExpanded] = useState(null);

    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['top5today', feedIds?.join(',')],
        queryFn: async () => {
            if (!feedIds?.length) return [];
            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since48h } },
                '-importance_score',
                100
            );
            if (!raw?.length) return [];

            // Deduplicate similar titles, then take top 5 by score/date
            const deduped = deduplicateItems(raw);
            return deduped
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Ranking intelligence…
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
                <p className="text-stone-600 text-sm">No items from the last 48h yet — feeds are being fetched.</p>
            </div>
        );
    }

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <Zap className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 5 Today</h2>
                <span className="text-xs text-stone-600 ml-auto">AI-ranked · deduplicated</span>
            </div>
            <div className="divide-y divide-stone-800/80">
                {items.map((item, idx) => {
                    const source = feedMap[item.feed_id];
                    const isOpen = expanded === item.id;

                    // Resolve tag — always show something
                    const tag = item.intelligence_tag ||
                        inferTag((item.title || '') + ' ' + (item.description || '')) ||
                        (idx === 0 ? 'Trending' : 'Neutral');
                    const tagCfg = TAG_CONFIG[tag] || TAG_CONFIG.Neutral;

                    const summary = summaryText(item);
                    const why = whyItMatters(item);
                    const score = item.importance_score;

                    return (
                        <div
                            key={item.id}
                            className="px-5 py-4 hover:bg-stone-800/40 transition-colors cursor-pointer"
                            onClick={() => setExpanded(isOpen ? null : item.id)}
                        >
                            <div className="flex items-start gap-3">
                                {/* Rank number */}
                                <span className={`text-xl font-black w-6 flex-shrink-0 leading-tight mt-0.5 ${idx === 0 ? 'text-[hsl(var(--primary))]' : 'text-stone-700'}`}>
                                    {idx + 1}
                                </span>

                                <div className="flex-1 min-w-0">
                                    {/* Tag + score row */}
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <TagBadge tag={tag} />
                                        <ScoreDot score={score} />
                                        {score != null && (
                                            <span className="text-[10px] text-stone-600 font-mono">{score}/100</span>
                                        )}
                                        <span className="ml-auto text-xs text-stone-600">
                                            {source?.name}
                                            {item.published_date && (
                                                <> · {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}</>
                                            )}
                                        </span>
                                    </div>

                                    {/* Title */}
                                    <h3 className="text-sm font-semibold text-stone-100 leading-snug mb-2">
                                        {decodeHtml(item.title)}
                                    </h3>

                                    {/* Why it matters — ALWAYS shown */}
                                    {why && (
                                        <p className={`text-xs font-medium mb-1.5 ${tagCfg.color.split(' ').find(c => c.startsWith('text-'))}`}>
                                            ↳ {why}
                                        </p>
                                    )}

                                    {/* Summary — shown when expanded or always if short */}
                                    {summary && (
                                        <p className={`text-xs text-stone-400 leading-relaxed ${isOpen ? '' : 'line-clamp-2'}`}>
                                            {summary}
                                        </p>
                                    )}

                                    {/* Expand/collapse + read link */}
                                    <div className="flex items-center gap-3 mt-2.5">
                                        <a
                                            href={safeUrl(item.url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:opacity-80 transition font-medium"
                                        >
                                            Read <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <button
                                            className="ml-auto text-stone-600 hover:text-stone-400 transition"
                                            onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : item.id); }}
                                        >
                                            {isOpen
                                                ? <ChevronUp className="w-3.5 h-3.5" />
                                                : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}