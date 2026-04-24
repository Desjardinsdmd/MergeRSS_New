import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ExternalLink, Loader2 } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';

const BUCKET_COLORS = {
    CRE: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30',
    'AI/Tech': 'text-blue-400 border-blue-800/50 bg-blue-950/30',
    Macro: 'text-amber-400 border-amber-800/50 bg-amber-950/30',
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
        <div className="bg-stone-900 border border-stone-800 p-5">
            <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Rising Signals</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing entity velocity…
            </div>
        </div>
    );

    const signals = data || {};
    const hasBuckets = Object.keys(signals).length > 0;

    if (!hasBuckets) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Rising Signals</h2>
                <span className="text-xs text-stone-600 ml-auto">7d vs 4-week baseline · authority-weighted</span>
            </div>
            <div className="divide-y divide-stone-800/60">
                {Object.entries(signals).map(([bucket, entities]) => (
                    <div key={bucket} className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 border ${BUCKET_COLORS[bucket] || BUCKET_COLORS.Macro}`}>
                                Rising in {bucket}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {entities.slice(0, 5).map((signal) => (
                                <div key={signal.entity}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-semibold text-stone-100">{signal.entity}</span>
                                        <span className="text-xs text-emerald-400 font-bold">{signal.multiplier}x</span>
                                        <span className="text-xs text-stone-600">
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
                                                    className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-[hsl(var(--primary))] transition group"
                                                >
                                                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 text-stone-600 group-hover:text-[hsl(var(--primary))]" />
                                                    <span className="line-clamp-1">{decodeHtml(article.title)}</span>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}