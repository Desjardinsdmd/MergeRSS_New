import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Rss, RefreshCw, PauseCircle, ShieldCheck, Lock, Activity,
  RotateCcw, AlertTriangle, CheckCircle2, Clock, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function LaneBadge({ status }) {
  if (status === 'running') return <Badge className="bg-blue-900/30 text-blue-400 border-blue-700">Running</Badge>;
  if (status === 'completed') return <Badge className="bg-green-900/30 text-green-400 border-green-700">Completed</Badge>;
  if (status === 'failed') return <Badge className="bg-red-900/30 text-red-400 border-red-700">Failed</Badge>;
  return <Badge className="bg-stone-800 text-stone-400">Idle</Badge>;
}

export default function FeedEngineStatus({ onRefresh }) {
  const [triggeringRecovery, setTriggeringRecovery] = React.useState(false);

  const { data: recentJobs = [], refetch } = useQuery({
    queryKey: ['feed-engine-jobs'],
    queryFn: () => base44.entities.SystemHealth.list('-created_date', 30),
    refetchInterval: 30000,
  });

  const { data: pausedFeeds = [] } = useQuery({
    queryKey: ['system-paused-feeds'],
    queryFn: () => base44.entities.Feed.filter({ status: 'paused', paused_by_system: true }),
    refetchInterval: 60000,
  });

  // Latest run of each lane
  const latestMainRun = recentJobs.find(j => j.job_type === 'feed_fetch');
  const latestRecoveryRun = recentJobs.find(j => j.job_type === 'feed_recovery');

  // Active lock detection
  const activeLock = recentJobs.find(j =>
    (j.job_type === 'feed_fetch' || j.job_type === 'feed_recovery') &&
    j.status === 'running' &&
    (Date.now() - new Date(j.started_at).getTime()) < 15 * 60 * 1000
  );

  // Paused feeds grouped by escalation state
  const escalatedFeeds = pausedFeeds.filter(f => f.repair_status === 'failed');
  const retryableFeeds = pausedFeeds.filter(f => f.repair_status !== 'failed' && f.retry_after_at && new Date(f.retry_after_at) <= new Date());
  const cooldownFeeds = pausedFeeds.filter(f => f.repair_status !== 'failed' && f.retry_after_at && new Date(f.retry_after_at) > new Date());

  const handleTriggerRecovery = async () => {
    setTriggeringRecovery(true);
    try {
      const res = await base44.functions.invoke('recoverFeeds', {});
      if (res.data?.skipped) {
        toast.info(`Recovery skipped: ${res.data.reason}`);
      } else if (res.data?.recovered !== undefined) {
        toast.success(`Recovery complete — ${res.data.recovered} recovered, ${res.data.escalated} escalated`);
      } else {
        toast.success('Recovery run triggered');
      }
      refetch();
      onRefresh?.();
    } catch (e) {
      toast.error(`Recovery failed: ${e.message}`);
    }
    setTriggeringRecovery(false);
  };

  return (
    <Card className="border-stone-800 bg-stone-900 mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-stone-200">
            <Activity className="w-4 h-4 text-amber-400" />
            Feed Engine Status
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { refetch(); onRefresh?.(); }} className="text-stone-400">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={handleTriggerRecovery}
              disabled={triggeringRecovery || !!activeLock}
              className="text-stone-300"
            >
              {triggeringRecovery ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
              Run Recovery
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Active Lock Banner */}
        {activeLock && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-950/40 border border-blue-800">
            <Lock className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-blue-300 text-sm font-semibold">
                {activeLock.job_type === 'feed_fetch' ? 'Main fetch' : 'Recovery'} run in progress
              </p>
              <p className="text-blue-400/70 text-xs mt-0.5">
                Owner: <code className="font-mono">{activeLock.metadata?.instance_id || activeLock.id}</code>
                {' · '}Started {formatDistanceToNow(new Date(activeLock.started_at), { addSuffix: true })}
                {activeLock.metadata?.last_heartbeat_at && (
                  <> · Last heartbeat {formatDistanceToNow(new Date(activeLock.metadata.last_heartbeat_at), { addSuffix: true })}</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Execution Lanes */}
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Main Fetch Lane */}
          <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Rss className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-stone-300">Main Fetch</span>
              </div>
              <LaneBadge status={latestMainRun?.status} />
            </div>
            {latestMainRun ? (
              <div className="space-y-1.5 text-xs text-stone-500">
                <p>Started: <span className="text-stone-400">{format(new Date(latestMainRun.started_at), 'MMM d, h:mm:ss a')}</span></p>
                {latestMainRun.completed_at && (
                  <p>Finished: <span className="text-stone-400">{format(new Date(latestMainRun.completed_at), 'h:mm:ss a')}</span>
                    {' · '}<span className="text-stone-500">{Math.round((new Date(latestMainRun.completed_at) - new Date(latestMainRun.started_at)) / 1000)}s</span>
                  </p>
                )}
                {latestMainRun.metadata && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[
                      { label: 'OK', val: latestMainRun.metadata.feeds_ok, color: 'text-green-400' },
                      { label: 'Err', val: latestMainRun.metadata.feeds_error, color: 'text-red-400' },
                      { label: 'Paused', val: latestMainRun.metadata.feeds_auto_paused, color: 'text-stone-400' },
                      { label: 'New Items', val: latestMainRun.metadata.new_items_total, color: 'text-amber-400' },
                      { label: 'p50 lag', val: latestMainRun.metadata.p50_lag_min != null ? `${latestMainRun.metadata.p50_lag_min}m` : null, color: 'text-stone-400' },
                      { label: 'Instance', val: latestMainRun.metadata.instance_id?.slice(0, 12), color: 'text-stone-600' },
                    ].filter(i => i.val != null).map(item => (
                      <div key={item.label} className="bg-stone-900 rounded px-2 py-1">
                        <p className="text-[10px] text-stone-600">{item.label}</p>
                        <p className={cn('font-semibold text-xs', item.color)}>{item.val}</p>
                      </div>
                    ))}
                  </div>
                )}
                {latestMainRun.error_message && (
                  <p className="text-red-400 mt-1 text-[11px] truncate">⚠ {latestMainRun.error_message}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-stone-600">No runs recorded yet</p>
            )}
          </div>

          {/* Recovery Lane */}
          <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-stone-300">Recovery</span>
              </div>
              <LaneBadge status={latestRecoveryRun?.status} />
            </div>
            {latestRecoveryRun ? (
              <div className="space-y-1.5 text-xs text-stone-500">
                <p>Started: <span className="text-stone-400">{format(new Date(latestRecoveryRun.started_at), 'MMM d, h:mm:ss a')}</span></p>
                {latestRecoveryRun.completed_at && (
                  <p>Finished: <span className="text-stone-400">{format(new Date(latestRecoveryRun.completed_at), 'h:mm:ss a')}</span></p>
                )}
                {latestRecoveryRun.metadata && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[
                      { label: 'Recovered', val: latestRecoveryRun.metadata.recovered, color: 'text-green-400' },
                      { label: 'Re-paused', val: latestRecoveryRun.metadata.re_paused, color: 'text-amber-400' },
                      { label: 'Escalated', val: latestRecoveryRun.metadata.escalated, color: 'text-red-400' },
                      { label: 'Eligible', val: latestRecoveryRun.metadata.total_paused_eligible, color: 'text-stone-400' },
                    ].filter(i => i.val != null).map(item => (
                      <div key={item.label} className="bg-stone-900 rounded px-2 py-1">
                        <p className="text-[10px] text-stone-600">{item.label}</p>
                        <p className={cn('font-semibold text-xs', item.color)}>{item.val}</p>
                      </div>
                    ))}
                  </div>
                )}
                {latestRecoveryRun.metadata?.skipped && (
                  <p className="text-stone-500 text-[11px]">ℹ Skipped: {latestRecoveryRun.metadata.reason}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-stone-600">No recovery runs yet</p>
            )}
          </div>
        </div>

        {/* System-Paused Feeds Summary */}
        {pausedFeeds.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-stone-500" />
              <span className="text-sm font-semibold text-stone-400">System-Paused Feeds ({pausedFeeds.length})</span>
            </div>

            {/* Escalated — needs human attention */}
            {escalatedFeeds.length > 0 && (
              <div className="rounded-lg border border-red-800 bg-red-950/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {escalatedFeeds.length} escalated — recovery exhausted, needs manual review
                </p>
                {escalatedFeeds.slice(0, 5).map(f => (
                  <div key={f.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-stone-300 font-medium truncate">{f.name}</span>
                    <span className="text-red-400/70 flex-shrink-0 text-[11px] truncate max-w-[200px]">{f.escalation_reason?.slice(0, 60)}</span>
                  </div>
                ))}
                {escalatedFeeds.length > 5 && <p className="text-xs text-stone-600">+{escalatedFeeds.length - 5} more</p>}
              </div>
            )}

            {/* Retryable now */}
            {retryableFeeds.length > 0 && (
              <div className="rounded-lg border border-amber-800/50 bg-amber-950/10 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {retryableFeeds.length} past cooldown — eligible for next recovery run
                </p>
                {retryableFeeds.slice(0, 4).map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-stone-300 truncate">{f.name}</span>
                    <span className="text-stone-600 flex-shrink-0">{f.consecutive_errors || 0} failures</span>
                  </div>
                ))}
                {retryableFeeds.length > 4 && <p className="text-xs text-stone-600">+{retryableFeeds.length - 4} more</p>}
              </div>
            )}

            {/* In cooldown */}
            {cooldownFeeds.length > 0 && (
              <div className="rounded-lg border border-stone-800 bg-stone-950/30 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-stone-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {cooldownFeeds.length} in cooldown
                </p>
                {cooldownFeeds.slice(0, 4).map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-stone-400 truncate">{f.name}</span>
                    <span className="text-stone-600 flex-shrink-0">
                      retry {f.retry_after_at ? formatDistanceToNow(new Date(f.retry_after_at), { addSuffix: true }) : '—'}
                    </span>
                  </div>
                ))}
                {cooldownFeeds.length > 4 && <p className="text-xs text-stone-600">+{cooldownFeeds.length - 4} more</p>}
              </div>
            )}
          </div>
        )}

        {pausedFeeds.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            No system-paused feeds — all sources healthy
          </div>
        )}
      </CardContent>
    </Card>
  );
}