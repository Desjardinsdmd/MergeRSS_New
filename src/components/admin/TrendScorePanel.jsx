import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { TIER_LABELS } from '@/lib/trendScoring';

const TAG_COLORS = {
    Trending:    'bg-amber-900/30 text-amber-400',
    Risk:        'bg-red-900/30 text-red-400',
    Opportunity: 'bg-green-900/30 text-green-400',
    Neutral:     'bg-stone-800 text-stone-400',
};

const VIEWS = [
    { key: 'top',        label: 'Top Trend Score',         icon: TrendingUp,    sort: '-trend_score' },
    { key: 'highvol',    label: 'High Volume / Low Auth',  icon: AlertTriangle, sort: '-article_count' },
    { key: 'highauth',   label: 'High Auth / Low Volume',  icon: ArrowUpRight,  sort: '-authority_weighted_source_count' },
];

function ScoreBar({ value, max = 100, color = 'bg-amber-400' }) {
    return (
        <div className="w-16 h-1.5 bg-stone-800 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        </div>
    );
}

function ComponentBreakdown({ components }) {
    if (!components) return null;
    const rows = [
        { label: 'Importance',  val: components.importance_contrib,  color: 'bg-amber-400' },
        { label: 'Authority',   val: components.authority_contrib,   color: 'bg-sky-400' },
        { label: 'Velocity',    val: components.velocity_contrib,    color: 'bg-emerald-400' },
        { label: 'Recency',     val: components.recency_contrib,     color: 'bg-purple-400' },
        { label: 'Penalty',     val: -(components.low_auth_penalty || 0), color: 'bg-red-500', negative: true },
    ];
    return (
        <div className="mt-2 space-y-1.5">
            {rows.map(r => (
                <div key={r.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-600 w-16">{r.label}</span>
                    <ScoreBar value={Math.abs(r.val)} max={35} color={r.color} />
                    <span className={cn('text-[10px] font-mono', r.negative && r.val < 0 ? 'text-red-400' : 'text-stone-400')}>
                        {r.negative && r.val < 0 ? '-' : '+'}{Math.abs(r.val).toFixed(1)}
                    </span>
                </div>
            ))}
            <div className="flex items-center gap-2 pt-1 border-t border-stone-800">
                <span className="text-[10px] text-stone-500 w-16">Total</span>
                <span className="text-[10px] font-bold text-stone-300">{components.raw_before_penalty?.toFixed(1)} → {(components.raw_before_penalty - (components.low_auth_penalty || 0)).toFixed(1)}</span>
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
            'border-b border-stone-800/50 last:border-0',
            isHighVolLowAuth && 'border-l-2 border-l-amber-600/50',
            isHighAuthLowVol && 'border-l-2 border-l-sky-600/50',
        )}>
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-800/30 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-200 line-clamp-1">{cluster.representative_title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={cn('text-[10px] border-0', TAG_COLORS[cluster.intelligence_tag] || TAG_COLORS.Neutral)}>
                            {cluster.intelligence_tag || 'Neutral'}
                        </Badge>
                        <span className="text-[10px] text-stone-500">
                            {formatDistanceToNow(new Date(cluster.last_updated_at || cluster.created_date), { addSuffix: true })}
                        </span>
                        {isHighVolLowAuth && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-amber-900/30 text-amber-500 rounded font-semibold">REPOST HEAVY</span>
                        )}
                        {isHighAuthLowVol && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-sky-900/30 text-sky-400 rounded font-semibold">HIGH AUTH</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div>
                        <p className={cn('text-base font-bold', (cluster.trend_score ?? 0) >= 70 ? 'text-amber-400' : (cluster.trend_score ?? 0) >= 40 ? 'text-sky-400' : 'text-stone-400')}>
                            {cluster.trend_score ?? '—'}
                        </p>
                        <p className="text-[10px] text-stone-600">trend</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-stone-400">{cluster.authority_weighted_source_count?.toFixed(1) ?? '—'}</p>
                        <p className="text-[10px] text-stone-600">auth·src</p>
                    </div>
                    <div>
                        <p className="text-sm text-stone-500">{cluster.article_count}</p>
                        <p className="text-[10px] text-stone-600">articles</p>
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-stone-600" /> : <ChevronDown className="w-4 h-4 text-stone-600" />}
                </div>
            </button>

            {expanded && (
                <div className="px-4 pb-4">
                    {cluster.trend_score_components ? (
                        <ComponentBreakdown components={cluster.trend_score_components} />
                    ) : (
                        <p className="text-xs text-stone-600">No score breakdown available — run scoreClusters to populate.</p>
                    )}
                    {cluster.source_domains?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {cluster.source_domains.map(d => (
                                <span key={d} className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-400 font-mono">{d}</span>
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
        <Card className="border-stone-800 bg-stone-900 mb-6">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-stone-200">
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        Trend Scores
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-stone-400">
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                    </Button>
                </div>

                <div className="flex gap-1 mt-3 flex-wrap">
                    {VIEWS.map(v => (
                        <button
                            key={v.key}
                            onClick={() => setView(v.key)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                view === v.key ? 'bg-stone-800 text-stone-200' : 'text-stone-500 hover:text-stone-300'
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
                        <TrendingUp className="w-8 h-8 text-stone-700 mx-auto mb-3" />
                        <p className="text-stone-500 text-sm">No scored clusters</p>
                        <p className="text-stone-600 text-xs mt-1">Run "Rescore Clusters" from Source Authority panel</p>
                    </div>
                ) : (
                    clusters.map(c => <ClusterTrendRow key={c.id} cluster={c} view={view} />)
                )}
            </CardContent>
        </Card>
    );
}