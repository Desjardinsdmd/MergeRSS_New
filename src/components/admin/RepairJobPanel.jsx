import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Wrench, PlayCircle, XCircle, RefreshCw, Download, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Clock, Loader2, Activity, Copy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHIP = 'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit';
const STATUS_COLORS = {
  idle: 'border-white/10 bg-white/[0.03] text-stone-400',
  running: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  completed: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  failed: 'border-red-400/25 bg-red-400/10 text-red-300',
  cancelled: 'border-white/10 bg-white/[0.03] text-stone-400',
};

const ACTION_COLORS = {
  repaired: 'text-emerald-400',
  quarantined: 'text-amber-400',
  failed: 'text-red-400',
  skipped: 'text-stone-500',
};

const CATEGORY_LABELS = {
  '404_gone': '404 / Gone',
  'blocked_antibot': 'Bot Protected',
  'paywall_login': 'Paywall / Login',
  'invalid_html': 'Invalid HTML',
  'no_articles_found': 'No Articles Found',
  'extraction_failed': 'Extraction Failed',
  'feed_validation_failed': 'Validation Failed',
  'timeout': 'Timeout',
  'network_error': 'Network Error',
  'unexpected_error': 'Unexpected Error',
  'none': '—',
};

function LogLine({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiag = log.diagnostics && Object.keys(log.diagnostics).length > 0;

  return (
    <div className={cn('border-b border-white/[0.05] py-2 px-3 text-xs font-mono last:border-b-0', expanded && 'bg-white/[0.03]')}>
      <div className="flex items-start gap-2">
        <span className="text-stone-500 flex-shrink-0 w-[72px]">
          {log.created_date ? format(new Date(log.created_date), 'HH:mm:ss') : '—'}
        </span>
        <span className={cn('font-semibold flex-shrink-0 w-[90px]', ACTION_COLORS[log.action])}>
          {(log.action || '').toUpperCase()}
        </span>
        <span className="text-stone-300 flex-1 min-w-0">
          <span className="text-stone-100">{log.feed_name}</span>
          {' · '}
          <span className="text-stone-500 break-all">{log.original_url}</span>
        </span>
        <span className={cn('flex-shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]',
          log.action === 'repaired' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' :
          log.action === 'quarantined' ? 'border-amber-400/25 bg-amber-400/10 text-amber-300' :
          'border-red-400/25 bg-red-400/10 text-red-300'
        )}>
          {CATEGORY_LABELS[log.failure_category] || log.failure_category}
        </span>
        {hasDiag && (
          <button onClick={() => setExpanded(v => !v)} className="text-stone-500 hover:text-stone-300 flex-shrink-0 ml-1">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      {log.message && (
        <div className="mt-0.5 ml-[166px] text-stone-500">{log.message}</div>
      )}
      {log.new_url && log.new_url !== log.original_url && (
        <div className="mt-0.5 ml-[166px] text-emerald-400/70">→ {log.new_url}</div>
      )}
      {expanded && hasDiag && (
        <pre className="mt-2 ml-[166px] text-[10px] text-stone-500 bg-black/30 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(log.diagnostics, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function RepairJobPanel({ errorFeedCount }) {
  const [activeJob, setActiveJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [jobHistory, setJobHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const logEndRef = useRef(null);
  const pollRef = useRef(null);

  // Load latest job on mount
  const loadLatestJob = useCallback(async () => {
    const jobs = await base44.entities.RepairJob.list('-created_date', 10);
    setJobHistory(jobs);
    if (jobs.length > 0) {
      setActiveJob(jobs[0]);
      if (jobs[0].status === 'running' || jobs[0].status === 'completed') {
        loadLogsForJob(jobs[0].id);
      }
    }
  }, []);

  const loadLogsForJob = async (jobId) => {
    const res = await base44.functions.invoke('getRepairJobLogs', { job_id: jobId, limit: 300 });
    if (res.data?.logs) setLogs(res.data.logs);
  };

  useEffect(() => {
    loadLatestJob();
  }, [loadLatestJob]);

  // Auto-scroll log to bottom when new entries appear
  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, showLogs]);

  // Polling while running (with rate limit protection)
  useEffect(() => {
    if (activeJob?.status !== 'running') {
      clearInterval(pollRef.current);
      return;
    }
    let lastPollTime = 0;
    const minPollInterval = 5000; // 5 seconds minimum between polls
    
    pollRef.current = setInterval(async () => {
      const now = Date.now();
      if (now - lastPollTime < minPollInterval) return; // Skip if too soon
      lastPollTime = now;
      
      try {
        const jobs = await base44.entities.RepairJob.filter({ id: activeJob.id });
        if (jobs.length) {
          setActiveJob(jobs[0]);
          if (jobs[0].status !== 'running') clearInterval(pollRef.current);
        }
        await loadLogsForJob(activeJob.id);
      } catch (e) {
        // Silently handle rate limit errors during polling
        console.error('Poll error:', e.message);
      }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [activeJob?.status, activeJob?.id]);

  const handleStart = async () => {
    setLoadingStart(true);
    try {
      const res = await base44.functions.invoke('startRepairJob', {});
      if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Repair job started. ${res.data.total_count} sources queued`);
        setLogs([]);
        await loadLatestJob();
      }
    } catch (e) {
      toast.error(`Failed to start: ${e.message}`);
    } finally {
      setLoadingStart(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    setLoadingCancel(true);
    try {
      await base44.functions.invoke('cancelRepairJob', { job_id: activeJob.id });
      toast.success('Cancellation requested');
      await loadLatestJob();
    } catch (e) {
      toast.error(`Cancel failed: ${e.message}`);
    } finally {
      setLoadingCancel(false);
    }
  };

  const handleRefresh = async () => {
    if (activeJob) await loadLogsForJob(activeJob.id);
    await loadLatestJob();
  };

  const copyDeletedList = () => {
    const quarantined = logs.filter(l => l.action === 'quarantined');
    const text = quarantined.map(l => `${l.feed_name} | ${l.original_url} | ${CATEGORY_LABELS[l.failure_category]}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Quarantined sources list copied');
  };

  const downloadReport = () => {
    if (!activeJob) return;
    const lines = [
      `Repair Job Report`,
      `================`,
      `Job ID: ${activeJob.id}`,
      `Status: ${activeJob.status}`,
      `Started: ${activeJob.started_at}`,
      `Completed: ${activeJob.completed_at || 'N/A'}`,
      ``,
      `Summary`,
      `-------`,
      `Total: ${activeJob.total_count}`,
      `Repaired: ${activeJob.repaired_count}`,
      `Quarantined: ${activeJob.quarantined_count}`,
      `Failed: ${activeJob.failed_count}`,
      ``,
      `Activity Log`,
      `------------`,
      ...logs.map(l => `[${l.created_date || ''}] ${(l.action || '').toUpperCase()} | ${l.feed_name} | ${l.original_url} | ${l.message || ''}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repair-job-${activeJob.id?.slice(-8) || 'report'}.txt`;
    a.click();
  };

  const progress = activeJob?.total_count > 0
    ? Math.round((activeJob.processed_count / activeJob.total_count) * 100)
    : 0;

  const isRunning = activeJob?.status === 'running';
  const isDone = activeJob?.status === 'completed' || activeJob?.status === 'failed' || activeJob?.status === 'cancelled';
  const summary = activeJob?.summary;

  const remaining = activeJob
    ? Math.max(0, (activeJob.total_count || 0) - (activeJob.processed_count || 0))
    : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <Wrench className="w-4 h-4 text-[#C4A5FD]" />
            Repair errored sources
            {errorFeedCount > 0 && (
              <Badge className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-red-400/25 bg-red-400/10 text-red-300 ml-1">{errorFeedCount} in error</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefresh} aria-label="Refresh repair job" className="rounded-xl text-stone-500 hover:bg-white/[0.05] hover:text-stone-200">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            {isRunning && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={loadingCancel}
                className="btn-ghost border-red-400/25 text-red-300 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"
              >
                {loadingCancel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Cancel job
              </button>
            )}
            <button
              type="button"
              onClick={handleStart}
              disabled={isRunning || loadingStart || errorFeedCount === 0}
              className="btn-brand py-1.5 disabled:opacity-50"
            >
              {loadingStart
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <PlayCircle className="w-3.5 h-3.5" />
              }
              {isRunning ? 'Running...' : 'Repair errored sources'}
            </button>
          </div>
        </div>
      </CardHeader>

      {!activeJob && !isRunning && (
        <CardContent>
          <p className="text-stone-500 text-sm">
            {errorFeedCount > 0
              ? `${errorFeedCount} sources are in error state. Launch a repair job to attempt RSS discovery for each. Sources that cannot be repaired are quarantined for review rather than deleted.`
              : 'No errored sources. System is clean.'}
          </p>
        </CardContent>
      )}

      {activeJob && (
        <CardContent className="space-y-4">
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn(CHIP, STATUS_COLORS[activeJob.status])}>
              {isRunning && <Activity className="w-3 h-3 mr-1 animate-pulse" />}
              {activeJob.status?.toUpperCase()}
            </Badge>
            {activeJob.started_at && (
              <span className="font-mono text-[11px] text-stone-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Started {formatDistanceToNow(new Date(activeJob.started_at), { addSuffix: true })}
              </span>
            )}
            {activeJob.last_heartbeat_at && isRunning && (
              <span className="font-mono text-[11px] text-stone-500">
                Last heartbeat {formatDistanceToNow(new Date(activeJob.last_heartbeat_at), { addSuffix: true })}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {activeJob.total_count > 0 && (
            <div>
              <div className="flex justify-between font-mono text-[11px] text-stone-500 mb-1">
                <span>{activeJob.processed_count || 0} / {activeJob.total_count} processed</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-white/[0.06] [&>div]:bg-[hsl(var(--brand))]" />
              {isRunning && remaining > 0 && (
                <p className="font-mono text-[11px] text-stone-500 mt-1">{remaining} remaining</p>
              )}
            </div>
          )}

          {/* Current feed */}
          {isRunning && activeJob.current_feed_name && (
            <div className="flex items-center gap-2 text-sm text-stone-400 panel-raised px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C4A5FD] flex-shrink-0" />
              Processing: <span className="text-stone-200">{activeJob.current_feed_name}</span>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: activeJob.total_count || 0, color: 'text-stone-300' },
              { label: 'Repaired', value: activeJob.repaired_count || 0, color: 'text-emerald-300', icon: CheckCircle2 },
              { label: 'Quarantined', value: activeJob.quarantined_count || 0, color: 'text-amber-300', icon: AlertTriangle },
              { label: 'Failed', value: activeJob.failed_count || 0, color: 'text-red-300', icon: XCircle },
            ].map(stat => (
              <div key={stat.label} className="panel-raised p-3 text-center">
                <div className={cn('font-display text-2xl font-semibold tabular-nums', stat.color)}>{stat.value}</div>
                <div className="micro-label mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Final summary */}
          {isDone && summary && (
            <div className="panel-raised p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-semibold text-stone-100">Final summary</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyDeletedList} className="rounded-xl text-stone-500 hover:bg-white/[0.05] hover:text-stone-200 text-xs">
                    <Copy className="w-3 h-3 mr-1" /> Copy quarantined
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadReport} className="rounded-xl text-stone-500 hover:bg-white/[0.05] hover:text-stone-200 text-xs">
                    <Download className="w-3 h-3 mr-1" /> Download report
                  </Button>
                </div>
              </div>
              {summary.failure_by_category && Object.keys(summary.failure_by_category).length > 0 && (
                <div>
                  <p className="micro-label mb-2">Failures by category</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.failure_by_category).map(([cat, count]) => (
                      <Badge key={cat} className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit normal-case border-white/10 bg-white/[0.03] text-stone-400">
                        {CATEGORY_LABELS[cat] || cat}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {summary.duration_seconds && (
                <p className="font-mono text-[11px] text-stone-500">Duration: {summary.duration_seconds}s</p>
              )}
            </div>
          )}

          {/* Activity log */}
          {logs.length > 0 && (
            <div>
              <button
                className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-300 mb-2"
                onClick={() => setShowLogs(v => !v)}
              >
                {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Activity log (<span className="font-mono">{logs.length}</span> entries)
              </button>
              {showLogs && (
                <div className="rounded-xl border border-white/[0.07] bg-black/30 overflow-y-auto max-h-80">
                  {logs.map((log, i) => <LogLine key={log.id || i} log={log} />)}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}

          {/* Job history */}
          {jobHistory.length > 1 && (
            <div>
              <button
                className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-300"
                onClick={() => setShowHistory(v => !v)}
              >
                {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Prior jobs ({jobHistory.length - 1} more)
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1">
                  {jobHistory.slice(1).map(j => (
                    <div key={j.id} className="flex items-center gap-3 font-mono text-[11px] text-stone-500 rounded-lg bg-white/[0.03] px-3 py-2">
                      <Badge className={cn(CHIP, STATUS_COLORS[j.status])}>{j.status}</Badge>
                      <span>{j.started_at ? format(new Date(j.started_at), 'MMM d, h:mm a') : '—'}</span>
                      <span>✓ {j.repaired_count || 0} repaired</span>
                      <span>⚠ {j.quarantined_count || 0} quarantined</span>
                      <button
                        className="ml-auto text-[#C4A5FD] hover:text-[#D9C7FE]"
                        onClick={async () => {
                          setActiveJob(j);
                          await loadLogsForJob(j.id);
                        }}
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}