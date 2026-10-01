import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const CHIP = 'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit';
const TAG_COLORS = {
    Trending:    'border-sky-400/25 bg-sky-400/10 text-sky-300',
    Risk:        'border-red-400/25 bg-red-400/10 text-red-300',
    Opportunity: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    Neutral:     'border-white/10 bg-white/[0.03] text-stone-400',
};

const VIEWS = [
    { key: 'top',        label: 'Top trend score',         icon: TrendingUp,    sort: '-trend_score' },
    { key: 'highvol',    label: 'High volume / low auth',  icon: AlertTriangle, sort: '-article_count' },
    { key: 'highauth',   label: 'High auth / low volume',  icon: ArrowUpRight,  sort: '-authority_weighted_source_count' },
];

function ScoreBar({ value, max = 100, color = 'bg-[hsl(var(--brand))]' }) {
    return (
        <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        </div>
    );
}

function ComponentBreakdown({ components }) {
    if (!components) return null;
    const rows = [
        { label: 'Importance',  val: components.importance_contrib,  color: 'bg-[hsl(var(--brand))]' },
        { label: 'Authority',   val: components.authority_contrib,   color: 'bg-sky-400' },
        { label: 'Velocity',    val: components.velocity_contrib,    color: 'bg-emerald-400' },
        { label: 'Recency',     val: components.recency_contrib,     color: 'bg-stone-300' },
        { label: 'Penalty',     val: -(components.low_auth_penalty || 0), color: 'bg-red-400', negative: true },
    ];
    return (
        <div className="mt-2 space-y-1.5">
            {rows.map(r => (
                <div key={r.label} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-stone-500 w-16">{r.label}</span>
                    <ScoreBar value={Math.abs(r.val)} max={35} color={r.color} />
                    <span className={cn('text-[10px] font-mono', r.negative && r.val < 0 ? 'text-red-400' : 'text-stone-400')}>
                        {r.negative && r.val < 0 ? '-' : '+'}{Math.abs(r.val).toFixed(1)}
                    </span>
                </div>
            ))}
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                <span className="font-mono text-[10px] text-stone-500 w-16">Total</span>
                <span className="font-mono text-[10px] font-semibold text-stone-300">{components.raw_before_penalty?.toFixed(1)} → {(components.raw_before_penalty - (components.low_auth_penalty || 0)).toFixed(1)}</span>
            </div>
        </div>
    );
}

function ClusterTrendRow({ cluster, view }) {
    const [expanded, setExpanded] = useState(false);

    const isHighVolLowAuth = view === 'highvol' && cluster.article_count >= 5 && cluster.authority_weighted_source_count < 1.5;
    const isHighAuthLowVol = view === 'highauth' && (cluster.authority_weighted_source_count ?? 0) >= 2 && cluster.article_count <= 3;

    return (
        <div className={cn(
            'border-b border-white/[0.05] last:border-0',
            isHighVolLowAuth && 'border-l-2 border-l-amber-400/50',
            isHighAuthLowVol && 'border-l-2 border-l-sky-400/50',
        )}>
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-start gap-3 px-6 py-3 text-left hover:bg-white/[0.03] transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-200 line-clamp-1">{cluster.representative_title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={cn(CHIP, 'normal-case', TAG_COLORS[cluster.intelligence_tag] || TAG_COLORS.Neutral)}>
                            {cluster.intelligence_tag || 'Neutral'}
                        </Badge>
                        <span className="font-mono text-[10px] text-stone-500">
                            {formatDistanceToNow(new Date(cluster.last_updated_at || cluster.created_date), { addSuffix: true })}
                        </span>
                        {isHighVolLowAuth && (
                            <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-amber-400/25 bg-amber-400/10 text-amber-300">Repost heavy</span>
                        )}
                        {isHighAuthLowVol && (
                            <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-sky-400/25 bg-sky-400/10 text-sky-300">High auth</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div>
                        <p className={cn('font-display text-lg font-semibold tabular-nums', (cluster.trend_score ?? 0) >= 70 ? 'text-emerald-300' : (cluster.trend_score ?? 0) >= 40 ? 'text-stone-100' : 'text-stone-400')}>
                            {cluster.trend_score ?? '—'}
                        </p>
                        <p className="font-mono text-[10px] text-stone-500">trend</p>
                    </div>
                    <div>
                        <p className="font-mono text-sm font-semibold text-stone-400">{cluster.authority_weighted_source_count?.toFixed(1) ?? '—'}</p>
                        <p className="font-mono text-[10px] text-stone-500">auth·src</p>
                    </div>
                    <div>
                        <p className="font-mono text-sm text-stone-500">{cluster.article_count}</p>
                        <p className="font-mono text-[10px] text-stone-500">stories</p>
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
                </div>
            </button>

            {expanded && (
                <div className="px-6 pb-4">
                    {cluster.trend_score_components ? (
                        <ComponentBreakdown components={cluster.trend_score_components} />
                    ) : (
                        <p className="text-xs text-stone-500">No score breakdown available. Run <span className="font-mono">scoreClusters</span> to populate.</p>
                    )}
                    {cluster.source_domains?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {cluster.source_domains.map(d => (
                                <span key={d} className="chip-neutral">{d}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TrendScorePanel() {
    const [view, setView] = useState('top');

    const currentView = VIEWS.find(v => v.key === view);

    const buildQuery = () => {
        if (view === 'highvol') return { status: 'active', article_count: { $gte: 5 } };
        if (view === 'highauth') return { status: 'active', authority_weighted_source_count: { $gte: 1 } };
        return { status: 'active', trend_score: { $exists: true } };
    };

    const { data: clusters = [], isLoading, refetch } = useQuery({
        queryKey: ['trend-score-clusters', view],
        queryFn: () => base44.entities.StoryCluster.filter(buildQuery(), currentView?.sort || '-trend_score', 40),
        staleTime: 60000,
    });

    return (
        <Card className="mb-6">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
                        <TrendingUp className="w-4 h-4 text-[#C4A5FD]" />
                        Trend scores
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => refetch()} className="rounded-xl text-stone-400 hover:bg-white/[0.05] hover:text-stone-100">
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                    </Button>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 border-b border-white/[0.07]">
                    {VIEWS.map(v => (
                        <button
                            key={v.key}
                            onClick={() => setView(v.key)}
                            className={cn(
                                '-mb-px flex items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 text-xs font-medium transition-colors',
                                view === v.key ? 'border-[hsl(var(--brand))] text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-300'
                            )}
                        >
                            <v.icon className="w-3 h-3" />
                            {v.label}
                        </button>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="p-0">
                {isLoading ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-stone-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : clusters.length === 0 ? (
                    <div className="py-8 text-center">
                        <TrendingUp className="w-8 h-8 text-stone-600 mx-auto mb-3" />
                        <p className="text-stone-500 text-sm">No scored clusters</p>
                        <p className="text-stone-500 text-xs mt-1">Run "Rescore clusters" from the source authority panel</p>
                    </div>
                ) : (
                    clusters.map(c => <ClusterTrendRow key={c.id} cluster={c} view={view} />)
                )}
            </CardContent>
        </Card>
    );
}