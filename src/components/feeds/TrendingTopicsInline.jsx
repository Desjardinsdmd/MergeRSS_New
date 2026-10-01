import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ExternalLink, Loader2 } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';

const BUCKET_COLORS = {
    CRE: 'text-[#C4A5FD] border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.14)]',
    'AI/Tech': 'text-[#C4A5FD] border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.14)]',
    Macro: 'text-[#C4A5FD] border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.14)]',
};

export default function TrendingTopicsInline({ feedIds }) {
    const { data, isLoading } = useQuery({
        queryKey: ['rising-signals'],
        queryFn: async () => {
            const res = await base44.functions.invoke('risingSignals', {});
            return res.data?.signals || {};
        },
        staleTime: 10 * 60 * 1000,
    });

    if (isLoading) return (
        <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                <span className="font-display text-lg font-semibold text-stone-100">Rising signals</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing entity velocity…
            </div>
        </div>
    );

    const signals = data || {};
    const hasBuckets = Object.keys(signals).length > 0;

    if (!hasBuckets) return null;

    return (
        <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-5 py-4">
                <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-stone-100">Rising signals</h2>
                <span className="meta ml-auto">7d vs 4-week baseline · authority-weighted</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
                {Object.entries(signals).map(([bucket, entities]) => {
                    const items = Array.isArray(entities) ? entities : [];
                    if (!items.length) return null;
                    return (
                    <div key={bucket} className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${BUCKET_COLORS[bucket] || BUCKET_COLORS.Macro}`}>
                                Rising in {bucket}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {items.slice(0, 5).map((signal) => (
                                <div key={signal.entity}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-semibold text-stone-100">{signal.entity}</span>
                                        <span className="font-mono text-xs font-semibold text-emerald-400">{signal.multiplier}x</span>
                                        <span className="font-mono text-[11px] text-stone-500">
                                            {signal.current_week_count} mentions (baseline: {signal.baseline_count})
                                        </span>
                                    </div>
                                    {signal.top_articles?.length > 0 && (
                                        <div className="pl-3 space-y-0.5">
                                            {signal.top_articles.map((article, i) => (
                                                <a
                                                    key={i}
                                                    href={safeUrl(article.url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="group flex items-center gap-1.5 text-xs text-stone-400 transition hover:text-[#C4A5FD]"
                                                >
                                                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 text-stone-500 group-hover:text-[#C4A5FD]" />
                                                    <span className="line-clamp-1">{decodeHtml(article.title)}</span>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
}