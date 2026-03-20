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

const TAG_COLORS = {
  Trending:    'bg-amber-900/30 text-amber-400',
  Risk:        'bg-red-900/30 text-red-400',
  Opportunity: 'bg-green-900/30 text-green-400',
  Neutral:     'bg-stone-800 text-stone-400',
};

const VIEWS = [
  { key: 'top',         label: 'Top Signal',       icon: TrendingUp,  sort: '-importance_score' },
  { key: 'duplicates',  label: 'Most Articles',    icon: Copy,        sort: '-article_count' },
  { key: 'spread',      label: 'Widest Coverage',  icon: Globe,       sort: '-source_count' },
  { key: 'singletons',  label: 'Singletons',       icon: User,        sort: '-created_date' },
  { key: 'reactivated', label: 'Reactivated',      icon: RotateCcw,   sort: '-last_updated_at' },
  { key: 'lowconf',     label: 'Low Confidence',   icon: AlertTriangle, sort: '-created_date' },
];

function ClusterRow({ cluster }) {
  const [expanded, setExpanded] = useState(false);

  const isSingleton   = cluster.article_count === 1;
  const isReactivated = !!cluster.reactivated_from_id;
  const isLowConf     = cluster.source_count === 1 && cluster.article_count <= 2;

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden',
      isSingleton   ? 'border-stone-800/50 opacity-70' :
      isReactivated ? 'border-sky-800/40' :
                      'border-stone-800'
    )}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-800/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {isSingleton && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-500 font-semibold uppercase">Singleton</span>
            )}
            {isReactivated && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-900/40 text-sky-400 font-semibold uppercase flex items-center gap-1">
                <RotateCcw className="w-2 h-2" />Reactivated ×{cluster.reactivation_count}
              </span>
            )}
            {isLowConf && !isSingleton && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-600 font-semibold uppercase">Low Confidence</span>
            )}
          </div>
          <p className="text-sm font-medium text-stone-200 line-clamp-1">{cluster.representative_title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge className={cn('text-[10px] border-0', TAG_COLORS[cluster.intelligence_tag] || TAG_COLORS.Neutral)}>
              {cluster.intelligence_tag || 'Neutral'}
            </Badge>
            {cluster.category && (
              <span className="text-[10px] text-stone-500">{cluster.category}</span>
            )}
            <span className="text-[10px] text-stone-500">
              {formatDistanceToNow(new Date(cluster.last_updated_at || cluster.created_date), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-center">
            <p className="text-sm font-bold text-stone-200">{cluster.article_count}</p>
            <p className="text-[10px] text-stone-600">articles</p>
          </div>
          <div className="text-center">
            <p className={cn('text-sm font-bold', cluster.source_count >= 3 ? 'text-amber-400' : 'text-stone-400')}>
              {cluster.source_count}
            </p>
            <p className="text-[10px] text-stone-600">sources</p>
          </div>
          <div className="text-center">
            <p className={cn('text-sm font-bold', cluster.importance_score >= 72 ? 'text-amber-400' : cluster.importance_score >= 40 ? 'text-sky-400' : 'text-stone-500')}>
              {cluster.importance_score ?? '—'}
            </p>
            <p className="text-[10px] text-stone-600">score</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-stone-600" /> : <ChevronDown className="w-4 h-4 text-stone-600" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-800 pt-3 space-y-3">
          {cluster.source_domains?.length > 0 && (
            <div>
              <p className="text-[10px] text-stone-600 font-semibold uppercase mb-1.5">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {cluster.source_domains.map(d => (
                  <span key={d} className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-400 font-mono">{d}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">First seen</p>
              <p className="text-stone-400">{cluster.first_seen_at ? format(new Date(cluster.first_seen_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Last update</p>
              <p className="text-stone-400">{cluster.last_updated_at ? format(new Date(cluster.last_updated_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Blended score</p>
              <p className="text-stone-400">{cluster.importance_score ?? '—'}</p>
            </div>
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Status</p>
              <p className={cluster.status === 'active' ? 'text-emerald-400' : 'text-stone-500'}>{cluster.status}</p>
            </div>
          </div>
          {cluster.cluster_fingerprint && (
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Fingerprint</p>
              <p className="text-stone-600 font-mono text-[10px] break-all">{cluster.cluster_fingerprint}</p>
            </div>
          )}
          {cluster.reactivated_from_id && (
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Reactivated from</p>
              <p className="text-sky-600 font-mono text-[10px] truncate">{cluster.reactivated_from_id}</p>
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
        `Clustering done — ${d?.clusters_created ?? 0} new, ${d?.clusters_updated ?? 0} updated, ` +
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
        `Dry run — ${d?.total_clusters} clusters from ${d?.total_items} items. ` +
        `Multi-article: ${d?.multi_article_clusters}, Singletons: ${d?.singletons}`
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
    <Card className="border-stone-800 bg-stone-900 mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-stone-200">
            <Layers className="w-4 h-4 text-amber-400" />
            Story Clusters
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-stone-400">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDryRun} disabled={running} className="text-stone-500 text-xs">
              Dry Run
            </Button>
            <Button variant="outline" size="sm" onClick={handleRun} disabled={running} className="text-stone-300">
              {running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Run Clustering
            </Button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex flex-wrap gap-1 mt-3">
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
              {v.key === 'singletons'  && stats.singletons  > 0 && <span className="ml-1 text-stone-600">{stats.singletons}</span>}
              {v.key === 'reactivated' && stats.reactivated > 0 && <span className="ml-1 text-sky-600">{stats.reactivated}</span>}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary stats */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { label: 'Active',       val: stats.total,       color: 'text-stone-300' },
            { label: 'Multi-source', val: stats.multiSource, color: 'text-amber-400' },
            { label: 'Singletons',   val: stats.singletons,  color: 'text-stone-500' },
            { label: 'High signal',  val: stats.highSignal,  color: 'text-amber-400' },
            { label: 'Reactivated',  val: stats.reactivated, color: 'text-sky-400' },
          ].map(s => (
            <div key={s.label} className="bg-stone-950/40 rounded-lg px-2 py-2 text-center">
              <p className={cn('text-base font-bold', s.color)}>{s.val}</p>
              <p className="text-[10px] text-stone-600">{s.label}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : clusters.length === 0 ? (
          <div className="py-8 text-center">
            <Layers className="w-8 h-8 text-stone-700 mx-auto mb-3" />
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