import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Activity,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Rss,
  FileText,
  Slack,
  MessageCircle,
  AlertTriangle,
  Wand2,
  Ban,
  Bell,
  ShieldAlert,
  Info,
  Settings,
  Save
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';
import RepairJobPanel from '@/components/admin/RepairJobPanel';
import FeedEngineStatus from '@/components/admin/FeedEngineStatus';
import StoryClustersPanel from '@/components/admin/StoryClustersPanel';
import SourceAuthorityPanel from '@/components/admin/SourceAuthorityPanel';
import TrendScorePanel from '@/components/admin/TrendScorePanel';
import PipelineStatusPanel from '@/components/admin/PipelineStatusPanel';

const jobTypeIcons = {
  feed_fetch: Rss,
  digest_generation: FileText,
  slack_delivery: Slack,
  discord_delivery: MessageCircle,
};

// Semantic chips (BRAND.md): ok emerald, warning amber, error red, info sky.
const CHIP = 'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit';
const TONE = {
  ok: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  error: 'border-red-400/25 bg-red-400/10 text-red-300',
  info: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  brand: 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#C4A5FD]',
  neutral: 'border-white/10 bg-white/[0.03] text-stone-400',
};
const FIELD = 'rounded-xl border-white/10 bg-stone-800 text-stone-200';

const statusColors = {
  running: cn(CHIP, TONE.info),
  completed: cn(CHIP, TONE.ok),
  failed: cn(CHIP, TONE.error),
  scheduled: cn(CHIP, TONE.neutral),
};

export default function AdminHealth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => base44.entities.SystemHealth.list('-created_date', 50),
    enabled: user?.role === 'admin',
  });

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.list(),
    enabled: user?.role === 'admin',
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests'],
    queryFn: () => base44.entities.Digest.list(),
    enabled: user?.role === 'admin',
  });

  // Calculate stats
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  const runningJobs = jobs.filter(j => j.status === 'running').length;
  const activeFeeds = feeds.filter(f => f.status === 'active').length;
  const errorFeeds = feeds.filter(f => f.status === 'error').length;

  const stats = [
    {
      name: 'Active sources',
      value: activeFeeds,
      total: feeds.length,
      icon: Rss,
      color: 'text-stone-100',
    },
    {
      name: 'Jobs completed',
      value: completedJobs,
      icon: CheckCircle,
      color: 'text-emerald-300',
    },
    {
      name: 'Jobs failed',
      value: failedJobs,
      icon: XCircle,
      color: failedJobs > 0 ? 'text-red-300' : 'text-stone-100',
    },
    {
      name: 'Running now',
      value: runningJobs,
      icon: Activity,
      color: 'text-sky-300',
    },
  ];

  const [alertsLoading, setAlertsLoading] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState(null);

  // Alert settings
  const [alertSettingsId, setAlertSettingsId] = useState(null);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertFrequency, setAlertFrequency] = useState('24');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    base44.entities.AlertSettings.list('-created_date', 1).then(rows => {
      if (rows[0]) {
        setAlertSettingsId(rows[0].id);
        setAlertEmail(rows[0].destination_email || '');
        setAlertFrequency(String(rows[0].frequency_hours || 24));
      }
    }).catch(() => {});
  }, [user]);

  const saveAlertSettings = async () => {
    setSavingSettings(true);
    const data = { destination_email: alertEmail.trim(), frequency_hours: Number(alertFrequency) };
    if (alertSettingsId) {
      await base44.entities.AlertSettings.update(alertSettingsId, data);
    } else {
      const rec = await base44.entities.AlertSettings.create(data);
      setAlertSettingsId(rec.id);
    }
    setSavingSettings(false);
    toast.success('Alert settings saved');
  };

  const runAlertCheck = async () => {
    setAlertsLoading(true);
    const res = await base44.functions.invoke('systemAlerts', { dry_run: true });
    setLiveAlerts(res.data);
    setAlertsLoading(false);
  };

  const handleRefresh = () => {
    refetch();
    toast.success('Data refreshed');
  };

  const { data: generatedFeeds = [], refetch: refetchGeneratedFeeds } = useQuery({
    queryKey: ['generatedFeeds'],
    queryFn: () => base44.entities.GeneratedFeed.list('-created_date', 50),
    enabled: user?.role === 'admin',
  });

  const toggleFeedDisabled = async (feed) => {
    await base44.entities.GeneratedFeed.update(feed.id, { is_disabled: !feed.is_disabled });
    refetchGeneratedFeeds();
    toast.success(feed.is_disabled ? 'Source re-enabled' : 'Source disabled');
  };

  // Redirect non-admins
  if (user && user.role !== 'admin') {
    return (
      <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-stone-100 mb-2">Access denied</h2>
            <p className="text-stone-400">You don't have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="System health"
        subtitle="Job status, pipelines and source health."
        actions={
          <button type="button" onClick={handleRefresh} className="btn-ghost py-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        }
      />

      {/* Alert Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <Settings className="w-4 h-4 text-[#C4A5FD]" />
            Alert settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Destination email</Label>
              <Input
                value={alertEmail}
                onChange={e => setAlertEmail(e.target.value)}
                placeholder="Leave blank to email all admins"
                className={FIELD}
              />
            </div>
            <div>
              <Label className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Alert frequency</Label>
              <Select value={alertFrequency} onValueChange={setAlertFrequency}>
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Every hour</SelectItem>
                  <SelectItem value="6">Every 6 hours</SelectItem>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Every 24 hours</SelectItem>
                  <SelectItem value="48">Every 48 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button type="button" onClick={saveAlertSettings} disabled={savingSettings} className="btn-soft h-10 w-full sm:w-auto disabled:opacity-50">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save settings
            </button>
          </div>
          <p className="text-xs text-stone-500 mt-3">Alerts are sent when warning or critical thresholds are breached. Leave email blank to notify all admin accounts.</p>
        </CardContent>
      </Card>

      {/* Live Alerts Panel */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
              <Bell className="w-4 h-4 text-[#C4A5FD]" />
              Live alert check
            </CardTitle>
            <button type="button" onClick={runAlertCheck} className="btn-soft disabled:opacity-50" disabled={alertsLoading}>
              {alertsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
              Run check
            </button>
          </div>
        </CardHeader>
        {liveAlerts && (
          <CardContent>
            <div className="meta mb-4 flex items-center gap-4">
              <span>Checked at {format(new Date(liveAlerts.checked_at), 'h:mm:ss a')}</span>
              <span className="text-red-400 font-medium">{liveAlerts.critical} critical</span>
              <span className="text-amber-400 font-medium">{liveAlerts.warnings} warnings</span>
            </div>
            {liveAlerts.alert_count === 0 ? (
              <div className="flex items-center gap-2 text-emerald-300 text-sm">
                <CheckCircle className="w-4 h-4" />
                All checks passing. No active incidents.
              </div>
            ) : (
              <div className="space-y-3">
                {liveAlerts.alerts.map((alert) => (
                  <div key={alert.id} className={cn(
                    'rounded-xl border p-4',
                    alert.severity === 'critical'
                      ? 'border-red-400/25 bg-red-400/10'
                      : 'border-amber-400/25 bg-amber-400/10'
                  )}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={cn('w-4 h-4 mt-0.5 flex-shrink-0', alert.severity === 'critical' ? 'text-red-400' : 'text-amber-400')} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('font-semibold text-sm', alert.severity === 'critical' ? 'text-red-300' : 'text-amber-300')}>
                          {alert.title}
                        </p>
                        <pre className="text-xs text-stone-400 mt-1 whitespace-pre-wrap font-mono">{alert.detail}</pre>
                        <p className="text-xs text-stone-500 mt-2 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          {alert.action}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
        {!liveAlerts && !alertsLoading && (
          <CardContent>
            <p className="text-stone-500 text-sm">Click "Run check" to evaluate all alert thresholds. Automated checks run on the configured schedule and email admins on issues.</p>
          </CardContent>
        )}
      </Card>

      {/* Pipeline Status — observability for all major backend pipelines */}
      <PipelineStatusPanel />

      {/* Pipeline Status — real-time observability for all backend pipelines */}
      <PipelineStatusPanel />

      {/* Source Authority — domain tier management and overrides */}
      <SourceAuthorityPanel />

      {/* Trend Scores — authority-weighted cluster ranking inspection */}
      <TrendScorePanel />

      {/* Story Clusters — downstream dedup/clustering layer */}
      <StoryClustersPanel />

      {/* Feed Engine Status — execution lanes, lock state, paused feed visibility */}
      <FeedEngineStatus onRefresh={handleRefresh} />

      {/* Repair Errored Feeds Panel */}
      <RepairJobPanel errorFeedCount={errorFeeds} />

      {/* Alert banner for errored/paused feeds */}
      {(errorFeeds > 0 || feeds.filter(f => f.status === 'paused' && f.fetch_error).length > 0) && (
        <div className="mb-6 rounded-xl border border-red-400/25 bg-red-400/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-semibold text-sm">Source fetch errors detected</p>
            <p className="text-red-300/80 text-xs mt-0.5">
              <span className="font-mono">{errorFeeds}</span> source(s) are in error state.{' '}
              {feeds.filter(f => f.status === 'paused' && f.fetch_error).length > 0 &&
                `${feeds.filter(f => f.status === 'paused' && f.fetch_error).length} source(s) were auto-paused after repeated failures.`
              } The rest of the system continues to run normally. Review the source status table below.
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <MicroLabel>{stat.name}</MicroLabel>
              <stat.icon className="w-4 h-4 text-stone-600" aria-hidden="true" />
            </div>
            <p className={cn('font-display text-3xl font-semibold tabular-nums', stat.color)}>
              {stat.value}
              {stat.total != null && <span className="ml-1 font-mono text-sm font-normal text-stone-500">/ {stat.total}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Feed Status */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <CardTitle className="font-display text-lg font-semibold text-stone-100">Source status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last fetched</TableHead>
                  <TableHead>Stories</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-stone-500 py-8">
                      No sources configured
                    </TableCell>
                  </TableRow>
                  ) : (
                  feeds.map((feed) => (
                    <TableRow key={feed.id}>
                      <TableCell className="pl-6 font-medium text-stone-200">{feed.name}</TableCell>
                      <TableCell>
                        <Badge className={cn(CHIP,
                          feed.status === 'active' ? TONE.ok :
                          feed.status === 'error' ? TONE.error :
                          feed.status === 'paused' ? TONE.warn :
                          TONE.neutral
                        )}>
                          {feed.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-stone-500">
                        {feed.last_fetched 
                          ? format(new Date(feed.last_fetched), 'MMM d, h:mm a')
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell className="font-mono text-xs text-stone-300">{feed.item_count || 0}</TableCell>
                      <TableCell className="font-mono text-xs text-red-300 max-w-[200px] truncate">
                        {feed.fetch_error || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Generated Feeds Admin */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
              <Wand2 className="w-4 h-4 text-[#C4A5FD]" />
              Generated RSS feeds
            </CardTitle>
            <Badge variant="secondary" className={cn(CHIP, TONE.neutral)}>{generatedFeeds.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Source URL</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generatedFeeds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-stone-500 py-8">No generated RSS feeds yet</TableCell>
                  </TableRow>
                ) : generatedFeeds.map((feed) => (
                  <TableRow key={feed.id} className={feed.is_disabled ? 'opacity-50' : ''}>
                    <TableCell className="max-w-[220px] truncate pl-6 font-mono text-xs text-stone-300">
                      <a href={feed.source_url} target="_blank" rel="noopener noreferrer" className="text-[#C4A5FD] hover:underline">
                        {feed.source_url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(CHIP,
                        feed.method === 'direct_rss' || feed.method === 'discovered_rss'
                          ? TONE.ok
                          : TONE.neutral
                      )}>
                        {feed.method || 'scraped'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-stone-500">{feed.created_by}</TableCell>
                    <TableCell className="font-mono text-xs text-stone-500">
                      {feed.last_success ? format(new Date(feed.last_success), 'MMM d, h:mm a') : '—'}
                    </TableCell>
                    <TableCell>
                      {(feed.error_count || 0) > 0
                        ? <Badge className={cn(CHIP, TONE.error)}>{feed.error_count}</Badge>
                        : <span className="font-mono text-xs text-stone-600">0</span>
                      }
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(CHIP, feed.is_disabled ? TONE.neutral : TONE.ok)}>
                        {feed.is_disabled ? 'Disabled' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => toggleFeedDisabled(feed)}
                        className={cn('rounded-xl hover:bg-white/[0.05]', feed.is_disabled ? 'text-[#C4A5FD] hover:text-[#D9C7FE]' : 'text-stone-500 hover:text-red-300')}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1" />
                        {feed.is_disabled ? 'Enable' : 'Disable'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Job History */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="font-display text-lg font-semibold text-stone-100">Job history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Job type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-stone-500 py-8">
                        No jobs recorded yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobs.map((job) => {
                      const Icon = jobTypeIcons[job.job_type] || Activity;
                      return (
                        <TableRow key={job.id}>
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-2 text-stone-200">
                              <Icon className="w-4 h-4 text-stone-500" />
                              <span className="capitalize">
                                {job.job_type?.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[job.status] || cn(CHIP, TONE.neutral)}>
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-stone-500">
                           {job.started_at 
                             ? format(new Date(job.started_at), 'MMM d, h:mm:ss a')
                             : '-'
                           }
                          </TableCell>
                          <TableCell className="font-mono text-xs text-stone-500">
                           {job.completed_at 
                             ? format(new Date(job.completed_at), 'MMM d, h:mm:ss a')
                             : '-'
                           }
                          </TableCell>
                          <TableCell className="font-mono text-xs text-stone-300">{job.retry_count || 0}</TableCell>
                          <TableCell className="font-mono text-xs text-red-300 max-w-[200px] truncate">
                            {job.error_message || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}