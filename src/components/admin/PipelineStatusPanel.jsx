/**
 * PipelineStatusPanel — observability dashboard for all major backend pipelines.
 *
 * Shows: last run, last success, status, output counts, stale warnings.
 * Pipelines monitored: feed_fetch, feed_recovery, clustering, scoring, source_health
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
    Rss, GitMerge, TrendingUp, Activity, RefreshCw,
    CheckCircle2, AlertTriangle, Clock, XCircle, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const PIPELINES = [
    {
        key: 'feed_fetch',
        label: 'Feed Fetch',
        icon: Rss,
        functionName: 'fetchFeeds',
        description: 'Fetches all active RSS feeds',
        healthRules: (meta) => {
            if (!meta) return 'unknown';
            if (meta.feeds_ok > 0) return 'healthy';
            if (meta.feeds_attempted > 0) return 'degraded';
            return 'stale';
        },
        keyMetrics: (meta) => meta ? [
            { label: 'Feeds OK', value: meta.feeds_ok ?? '—' },
            { label: 'Errors', value: meta.feeds_error ?? '—' },
            { label: 'New Items', value: meta.new_items_total ?? '—' },
        ] : [],
    },
    {
        key: 'feed_recovery',
        label: 'Feed Recovery',
        icon: RefreshCw,
        functionName: 'recoverFeeds',
        description: 'Retries system-paused feeds',
        healthRules: (meta) => {
            if (!meta) return 'unknown';
            // Recovery with 0 eligible is healthy (nothing to do)
            if ((meta.total_paused_eligible ?? 0) === 0) return 'healthy';
            if (meta.recovered > 0 || meta.re_paused > 0) return 'healthy';
            return 'degraded';
        },
        keyMetrics: (meta) => meta ? [
            { label: 'Eligible', value: meta.total_paused_eligible ?? '—' },
            { label: 'Recovered', value: meta.recovered ?? '—' },
            { label: 'Escalated', value: meta.escalated ?? '—' },
        ] : [],
    },
    {
        key: 'clustering',
        label: 'Story Clustering',
        icon: GitMerge,
        functionName: 'clusterStories',
        description: 'Groups articles into story clusters',
        healthRules: (meta, ageMinutes) => {
            if (!meta) return 'unknown';
            if (ageMinutes > 120) return 'stale';
            if ((meta.total_items_processed ?? 0) > 0) return 'healthy';
            if ((meta.clusters_created ?? 0) + (meta.clusters_updated ?? 0) > 0) return 'healthy';
            return 'degraded';
        },
        keyMetrics: (meta) => meta ? [
            { label: 'Items Processed', value: meta.total_items_processed ?? '—' },
            { label: 'Clusters', value: meta.total_clusters ?? '—' },
            { label: 'Multi-article', value: meta.multi_article_clusters ?? '—' },
        ] : [],
    },
    {
        key: 'scoring',
        label: 'Trend Scoring',
        icon: TrendingUp,
        functionName: 'scoreClusters',
        description: 'Scores clusters by authority + velocity',
        healthRules: (meta, ageMinutes) => {
            if (!meta) return 'unknown';
            if (ageMinutes > 120) return 'stale';
            if ((meta.clusters_scored ?? 0) > 0) return 'healthy';
            // 0 scored is only OK if there were 0 clusters to score
            return 'degraded';
        },
        keyMetrics: (meta) => meta ? [
            { label: 'Scored', value: meta.clusters_scored ?? '—' },
            { label: 'Failed', value: meta.clusters_failed ?? '—' },
            { label: 'Domains Seeded', value: meta.domains_seeded ?? '—' },
        ] : [],
    },
    {
        key: 'source_health',
        label: 'Source Health',
        icon: Activity,
        functionName: 'computeSourceHealth',
        description: 'Evaluates per-feed health metrics',
        healthRules: (meta) => {
            if (!meta) return 'unknown';
            if ((meta.evaluated_count ?? 0) > 0) return 'healthy';
            return 'degraded';
        },
        keyMetrics: (meta) => meta ? [
            { label: 'Evaluated', value: meta.evaluated_count ?? '—' },
            { label: 'Healthy', value: meta.summary?.healthy ?? '—' },
            { label: 'Failing', value: meta.summary?.failing ?? '—' },
        ] : [],
    },
];

const STATUS_CONFIG = {
    healthy:  { color: 'bg-green-900/40 text-green-400 border-green-800',  icon: CheckCircle2, label: 'Healthy' },
    degraded: { color: 'bg-amber-900/40 text-amber-400 border-amber-800',  icon: AlertTriangle, label: 'Degraded' },
    stale:    { color: 'bg-orange-900/40 text-orange-400 border-orange-800', icon: Clock, label: 'Stale' },
    failed:   { color: 'bg-red-900/40 text-red-400 border-red-800',        icon: XCircle, label: 'Failed' },
    running:  { color: 'bg-blue-900/40 text-blue-400 border-blue-800',     icon: Loader2, label: 'Running' },
    unknown:  { color: 'bg-stone-800 text-stone-400 border-stone-700',     icon: Clock, label: 'No Data' },
};

function PipelineCard({ pipeline, jobs, onTrigger, triggering }) {
    // Find most recent completed job for this pipeline type
    const completedJobs = jobs
        .filter(j => j.job_type === pipeline.key && j.status === 'completed')
        .sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at));

    const latestJob = completedJobs[0];
    const runningJob = jobs.find(j => j.job_type === pipeline.key && j.status === 'running');
    const failedJob = jobs
        .filter(j => j.job_type === pipeline.key && j.status === 'failed')
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];

    const meta = latestJob?.metadata;
    const ageMinutes = latestJob
        ? (Date.now() - new Date(latestJob.completed_at || latestJob.started_at).getTime()) / 60000
        : Infinity;

    const healthStatus = runningJob
        ? 'running'
        : pipeline.healthRules(meta, ageMinutes);

    const statusCfg = STATUS_CONFIG[healthStatus] || STATUS_CONFIG.unknown;
    const StatusIcon = statusCfg.icon;
    const PipelineIcon = pipeline.icon;

    return (
        <Card className="border-stone-800 bg-stone-900">
            <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-stone-800">
                            <PipelineIcon className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-stone-200">{pipeline.label}</p>
                            <p className="text-xs text-stone-500">{pipeline.description}</p>
                        </div>
                    </div>
                    <Badge className={cn('text-xs border', statusCfg.color)}>
                        <StatusIcon className={cn('w-3 h-3 mr-1', healthStatus === 'running' && 'animate-spin')} />
                        {statusCfg.label}
                    </Badge>
                </div>

                {/* Last run */}
                <div className="text-xs text-stone-500 mb-3">
                    {runningJob ? (
                        <span className="text-blue-400">Running since {formatDistanceToNow(parseISO(runningJob.started_at))} ago</span>
                    ) : latestJob ? (
                        <span>Last run: {formatDistanceToNow(parseISO(latestJob.completed_at || latestJob.started_at), { addSuffix: true })}</span>
                    ) : (
                        <span className="text-stone-600">Never run</span>
                    )}
                    {failedJob && !runningJob && (
                        <span className="ml-2 text-red-400">• Last failure: {formatDistanceToNow(parseISO(failedJob.started_at), { addSuffix: true })}</span>
                    )}
                </div>

                {/* Key metrics */}
                {meta && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {pipeline.keyMetrics(meta).map(m => (
                            <div key={m.label} className="bg-stone-800/60 rounded-md p-2 text-center">
                                <p className="text-xs font-bold text-stone-200">{m.value}</p>
                                <p className="text-[10px] text-stone-500 truncate">{m.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Stale warning */}
                {healthStatus === 'stale' && (
                    <div className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-950/30 rounded-md px-2 py-1.5 mb-3">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Pipeline output is stale — last run was {Math.round(ageMinutes)} minutes ago
                    </div>
                )}

                {/* Degraded warning */}
                {healthStatus === 'degraded' && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/20 rounded-md px-2 py-1.5 mb-3">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Pipeline ran but produced no output — may indicate upstream data issue
                    </div>
                )}

                {/* Trigger button */}
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs"
                    disabled={triggering === pipeline.key || !!runningJob}
                    onClick={() => onTrigger(pipeline)}
                >
                    {triggering === pipeline.key
                        ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Triggering…</>
                        : <>Trigger Now</>
                    }
                </Button>
            </CardContent>
        </Card>
    );
}

export default function PipelineStatusPanel() {
    const [triggering, setTriggering] = React.useState(null);

    const { data: jobs = [], refetch } = useQuery({
        queryKey: ['pipeline-jobs'],
        queryFn: () => base44.entities.SystemHealth.list('-created_date', 200),
        refetchInterval: 30000,
    });

    const handleTrigger = async (pipeline) => {
        setTriggering(pipeline.key);
        try {
            await base44.functions.invoke(pipeline.functionName, {});
            toast.success(`${pipeline.label} triggered`);
            await refetch();
        } catch (e) {
            toast.error(`Failed to trigger ${pipeline.label}: ${e.message}`);
        } finally {
            setTriggering(null);
        }
    };

    // Overall system health
    const pipelineStatuses = PIPELINES.map(p => {
        const completedJobs = jobs
            .filter(j => j.job_type === p.key && j.status === 'completed')
            .sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at));
        const latestJob = completedJobs[0];
        const ageMinutes = latestJob
            ? (Date.now() - new Date(latestJob.completed_at || latestJob.started_at).getTime()) / 60000
            : Infinity;
        const runningJob = jobs.find(j => j.job_type === p.key && j.status === 'running');
        if (runningJob) return 'running';
        return p.healthRules(latestJob?.metadata, ageMinutes);
    });

    const unhealthy = pipelineStatuses.filter(s => ['stale', 'degraded', 'failed'].includes(s)).length;
    const allHealthy = unhealthy === 0 && pipelineStatuses.some(s => s === 'healthy');

    return (
        <Card className="border-stone-800 bg-stone-900/50 mb-6">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-stone-200">
                        <Activity className="w-4 h-4 text-amber-400" />
                        Pipeline Status
                    </CardTitle>
                    <div className="flex items-center gap-3">
                        {allHealthy && (
                            <span className="flex items-center gap-1.5 text-xs text-green-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                All pipelines healthy
                            </span>
                        )}
                        {unhealthy > 0 && (
                            <span className="flex items-center gap-1.5 text-xs text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {unhealthy} pipeline{unhealthy > 1 ? 's' : ''} need attention
                            </span>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => refetch()}>
                            <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {PIPELINES.map(pipeline => (
                        <PipelineCard
                            key={pipeline.key}
                            pipeline={pipeline}
                            jobs={jobs}
                            onTrigger={handleTrigger}
                            triggering={triggering}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}