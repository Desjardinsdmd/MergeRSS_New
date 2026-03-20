import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Layers, RefreshCw, Loader2, ChevronDown, ChevronUp,
  TrendingUp, Globe, Copy, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TAG_COLORS = {
  Trending:    'bg-amber-900/30 text-amber-400',
  Risk:        'bg-red-900/30 text-red-400',
  Opportunity: 'bg-green-900/30 text-green-400',
  Neutral:     'bg-stone-800 text-stone-400',
};

function ClusterRow({ cluster }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-stone-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-800/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-200 line-clamp-1">{cluster.representative_title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
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
          {/* Article count */}
          <div className="text-center">
            <p className="text-sm font-bold text-stone-200">{cluster.article_count}</p>
            <p className="text-[10px] text-stone-600">articles</p>
          </div>
          {/* Source count */}
          <div className="text-center">
            <p className={cn('text-sm font-bold', cluster.source_count >= 3 ? 'text-amber-400' : 'text-stone-400')}>
              {cluster.source_count}
            </p>
            <p className="text-[10px] text-stone-600">sources</p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-stone-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-600" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-800 pt-3 space-y-3">
          {/* Source domains */}
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
          {/* Time range */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">First seen</p>
              <p className="text-stone-400">{cluster.first_seen_at ? format(new Date(cluster.first_seen_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Last update</p>
              <p className="text-stone-400">{cluster.last_updated_at ? format(new Date(cluster.last_updated_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
            {cluster.importance_score != null && (
              <div>
                <p className="text-stone-600 text-[10px] mb-0.5">Importance</p>
                <p className="text-stone-400">{cluster.importance_score}</p>
              </div>
            )}
            <div>
              <p className="text-stone-600 text-[10px] mb-0.5">Cluster ID</p>
              <p className="text-stone-600 font-mono text-[10px] truncate">{cluster.id}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StoryClustersPanel() {
  const [view, setView] = useState('top'); // top | duplicates | spread
  const [running, setRunning] = useState(false);

  const { data: clusters = [], isLoading, refetch } = useQuery({
    queryKey: ['story-clusters', view],
    queryFn: () => base44.entities.StoryCluster.filter(
      { status: 'active' },
      view === 'spread' ? '-source_count' : view === 'duplicates' ? '-article_count' : '-importance_score',
      50
    ),
    staleTime: 60000,
  });

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('clusterStories', { window_hours: 24 });
      toast.success(`Clustering complete — ${res.data?.clusters_created ?? 0} new, ${res.data?.clusters_updated ?? 0} updated, ${res.data?.items_annotated ?? 0} items annotated`);
      refetch();
    } catch (e) {
      toast.error(`Clustering failed: ${e.message}`);
    }
    setRunning(false);
  };

  const views = [
    { key: 'top',        label: 'Top by Signal',    icon: TrendingUp },
    { key: 'duplicates', label: 'Most Duplicated',  icon: Copy },
    { key: 'spread',     label: 'Widest Coverage',  icon: Globe },
  ];

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
            <Button
              variant="outline" size="sm"
              onClick={handleRun}
              disabled={running}
              className="text-stone-300"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Run Clustering
            </Button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 mt-3">
          {views.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                view === v.key
                  ? 'bg-stone-800 text-stone-200'
                  : 'text-stone-500 hover:text-stone-300'
              )}
            >
              <v.icon className="w-3 h-3" />
              {v.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading clusters…
          </div>
        ) : clusters.length === 0 ? (
          <div className="py-8 text-center">
            <Layers className="w-8 h-8 text-stone-700 mx-auto mb-3" />
            <p className="text-stone-500 text-sm">No active clusters yet</p>
            <p className="text-stone-600 text-xs mt-1">Run clustering to group related articles into stories</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Active Clusters', val: clusters.length },
                { label: 'Multi-source', val: clusters.filter(c => c.source_count >= 2).length, highlight: true },
                { label: 'High signal', val: clusters.filter(c => (c.importance_score ?? 0) >= 60).length, highlight: true },
              ].map(s => (
                <div key={s.label} className="bg-stone-950/40 rounded-lg px-3 py-2 text-center">
                  <p className={cn('text-lg font-bold', s.highlight ? 'text-amber-400' : 'text-stone-300')}>{s.val}</p>
                  <p className="text-[10px] text-stone-600">{s.label}</p>
                </div>
              ))}
            </div>

            {clusters.map(cluster => (
              <ClusterRow key={cluster.id} cluster={cluster} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}