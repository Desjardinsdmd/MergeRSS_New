import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Layers, RefreshCw, Loader2, ChevronDown, ChevronUp,
  TrendingUp, Globe, Copy, Zap, AlertTriangle, RotateCcw, User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHIP = 'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit';
const TAG_COLORS = {
  Trending:    'border-sky-400/25 bg-sky-400/10 text-sky-300',
  Risk:        'border-red-400/25 bg-red-400/10 text-red-300',
  Opportunity: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  Neutral:     'border-white/10 bg-white/[0.03] text-stone-400',
};

const VIEWS = [
  { key: 'top',         label: 'Top signal',       icon: TrendingUp,  sort: '-importance_score' },
  { key: 'duplicates',  label: 'Most stories',    icon: Copy,        sort: '-article_count' },
  { key: 'spread',      label: 'Widest coverage',  icon: Globe,       sort: '-source_count' },
  { key: 'singletons',  label: 'Singletons',       icon: User,        sort: '-created_date' },
  { key: 'reactivated', label: 'Reactivated',      icon: RotateCcw,   sort: '-last_updated_at' },
  { key: 'lowconf',     label: 'Low confidence',   icon: AlertTriangle, sort: '-created_date' },
];

function ClusterRow({ cluster }) {
  const [expanded, setExpanded] = useState(false);

  const isSingleton   = cluster.article_count === 1;
  const isReactivated = !!cluster.reactivated_from_id;
  const isLowConf     = cluster.source_count === 1 && cluster.article_count <= 2;

  return (
    <div className={cn(
      'panel-raised overflow-hidden',
      isSingleton   ? 'opacity-70' :
      isReactivated ? 'border-sky-400/25' :
                      ''
    )}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {isSingleton && (
              <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-white/10 bg-white/[0.03] text-stone-400">Singleton</span>
            )}
            {isReactivated && (
              <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-sky-400/25 bg-sky-400/10 text-sky-300 flex items-center gap-1">
                <RotateCcw className="w-2 h-2" />Reactivated ×{cluster.reactivation_count}
              </span>
            )}
            {isLowConf && !isSingleton && (
              <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-amber-400/25 bg-amber-400/10 text-amber-300">Low confidence</span>
            )}
          </div>
          <p className="text-sm font-medium text-stone-200 line-clamp-1">{cluster.representative_title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge className={cn(CHIP, 'normal-case', TAG_COLORS[cluster.intelligence_tag] || TAG_COLORS.Neutral)}>
              {cluster.intelligence_tag || 'Neutral'}
            </Badge>
            {cluster.category && (
              <span className="font-mono text-[10px] text-stone-500">{cluster.category}</span>
            )}
            <span className="font-mono text-[10px] text-stone-500">
              {formatDistanceToNow(new Date(cluster.last_updated_at || cluster.created_date), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-center">
            <p className="font-mono text-sm font-semibold text-stone-200">{cluster.article_count}</p>
            <p className="font-mono text-[10px] text-stone-500">stories</p>
          </div>
          <div className="text-center">
            <p className={cn('font-mono text-sm font-semibold', cluster.source_count >= 3 ? 'text-[#C4A5FD]' : 'text-stone-400')}>
              {cluster.source_count}
            </p>
            <p className="font-mono text-[10px] text-stone-500">sources</p>
          </div>
          <div className="text-center">
            <p className={cn('font-mono text-sm font-semibold', cluster.importance_score >= 72 ? 'text-emerald-300' : cluster.importance_score >= 40 ? 'text-stone-200' : 'text-stone-500')}>
              {cluster.importance_score ?? '—'}
            </p>
            <p className="font-mono text-[10px] text-stone-500">score</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-3">
          {cluster.source_domains?.length > 0 && (
            <div>
              <p className="micro-label mb-1.5">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {cluster.source_domains.map(d => (
                  <span key={d} className="chip-neutral">{d}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="micro-label mb-0.5">First seen</p>
              <p className="font-mono text-stone-400">{cluster.first_seen_at ? format(new Date(cluster.first_seen_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
            <div>
              <p className="micro-label mb-0.5">Last update</p>
              <p className="font-mono text-stone-400">{cluster.last_updated_at ? format(new Date(cluster.last_updated_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
            <div>
              <p className="micro-label mb-0.5">Blended score</p>
              <p className="font-mono text-stone-400">{cluster.importance_score ?? '—'}</p>
            </div>
            <div>
              <p className="micro-label mb-0.5">Status</p>
              <p className={cn('font-mono', cluster.status === 'active' ? 'text-emerald-400' : 'text-stone-500')}>{cluster.status}</p>
            </div>
          </div>
          {cluster.cluster_fingerprint && (
            <div>
              <p className="micro-label mb-0.5">Fingerprint</p>
              <p className="text-stone-500 font-mono text-[10px] break-all">{cluster.cluster_fingerprint}</p>
            </div>
          )}
          {cluster.reactivated_from_id && (
            <div>
              <p className="micro-label mb-0.5">Reactivated from</p>
              <p className="text-sky-400 font-mono text-[10px] truncate">{cluster.reactivated_from_id}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StoryClustersPanel() {
  const [view, setView] = useState('top');
  const [running, setRunning] = useState(false);

  const currentView = VIEWS.find(v => v.key === view);

  const buildQuery = () => {
    if (view === 'singletons')  return { status: 'active', article_count: 1 };
    if (view === 'reactivated') return { status: 'active', reactivated_from_id: { $exists: true } };
    if (view === 'lowconf')     return { status: 'active', source_count: 1 };
    return { status: 'active' };
  };

  const { data: clusters = [], isLoading, refetch } = useQuery({
    queryKey: ['story-clusters', view],
    queryFn: () => base44.entities.StoryCluster.filter(buildQuery(), currentView?.sort || '-importance_score', 50),
    staleTime: 60000,
  });

  const { data: allActive = [] } = useQuery({
    queryKey: ['story-clusters-stats'],
    queryFn: () => base44.entities.StoryCluster.filter({ status: 'active' }, '-importance_score', 500),
    staleTime: 120000,
  });

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('clusterStories', { window_hours: 24 });
      const d = res.data;
      toast.success(
        `Clustering done. ${d?.clusters_created ?? 0} new, ${d?.clusters_updated ?? 0} updated, ` +
        `${d?.clusters_reactivated ?? 0} reactivated, ${d?.items_reassigned ?? 0} reassigned`
      );
      refetch();
    } catch (e) {
      toast.error(`Clustering failed: ${e.message}`);
    }
    setRunning(false);
  };

  const handleDryRun = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('clusterStories', { window_hours: 24, dry_run: true });
      const d = res.data;
      toast.info(
        `Dry run: ${d?.total_clusters} clusters from ${d?.total_items} stories. ` +
        `Multi-story: ${d?.multi_article_clusters}, Singletons: ${d?.singletons}`
      );
    } catch (e) {
      toast.error(`Dry run failed: ${e.message}`);
    }
    setRunning(false);
  };

  // Stats from full active set
  const stats = {
    total:       allActive.length,
    multiSource: allActive.filter(c => c.source_count >= 2).length,
    singletons:  allActive.filter(c => c.article_count === 1).length,
    highSignal:  allActive.filter(c => (c.importance_score ?? 0) >= 60).length,
    reactivated: allActive.filter(c => c.reactivated_from_id).length,
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <Layers className="w-4 h-4 text-[#C4A5FD]" />
            Story clusters
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="rounded-xl text-stone-400 hover:bg-white/[0.05] hover:text-stone-100">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <button type="button" onClick={handleDryRun} disabled={running} className="btn-ghost text-xs disabled:opacity-50">
              Dry run
            </button>
            <button type="button" onClick={handleRun} disabled={running} className="btn-soft disabled:opacity-50">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Run clustering
            </button>
          </div>
        </div>

        {/* View tabs */}
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
              {v.key === 'singletons'  && stats.singletons  > 0 && <span className="ml-1 font-mono text-stone-500">{stats.singletons}</span>}
              {v.key === 'reactivated' && stats.reactivated > 0 && <span className="ml-1 font-mono text-sky-400">{stats.reactivated}</span>}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary stats */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { label: 'Active',       val: stats.total,       color: 'text-stone-300' },
            { label: 'Multi-source', val: stats.multiSource, color: 'text-[#C4A5FD]' },
            { label: 'Singletons',   val: stats.singletons,  color: 'text-stone-500' },
            { label: 'High signal',  val: stats.highSignal,  color: 'text-emerald-300' },
            { label: 'Reactivated',  val: stats.reactivated, color: 'text-sky-400' },
          ].map(s => (
            <div key={s.label} className="panel-raised px-2 py-2.5 text-center">
              <p className={cn('font-display text-xl font-semibold tabular-nums', s.color)}>{s.val}</p>
              <p className="micro-label mt-0.5 truncate">{s.label}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : clusters.length === 0 ? (
          <div className="py-8 text-center">
            <Layers className="w-8 h-8 text-stone-600 mx-auto mb-3" />
            <p className="text-stone-500 text-sm">No clusters in this view</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clusters.map(cluster => (
              <ClusterRow key={cluster.id} cluster={cluster} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}