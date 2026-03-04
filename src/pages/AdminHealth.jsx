import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Rss,
  FileText,
  Slack,
  MessageCircle,
  AlertTriangle,
  TrendingUp,
  Wand2,
  Ban
} from 'lucide-react';
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

const jobTypeIcons = {
  feed_fetch: Rss,
  digest_generation: FileText,
  slack_delivery: Slack,
  discord_delivery: MessageCircle,
};

const statusColors = {
  running: 'bg-blue-900/30 text-blue-400',
  completed: 'bg-green-900/30 text-green-400',
  failed: 'bg-red-900/30 text-red-400',
  scheduled: 'bg-amber-900/30 text-amber-400',
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
  });

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.list(),
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests'],
    queryFn: () => base44.entities.Digest.list(),
  });

  // Calculate stats
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  const runningJobs = jobs.filter(j => j.status === 'running').length;
  const activeFeeds = feeds.filter(f => f.status === 'active').length;
  const errorFeeds = feeds.filter(f => f.status === 'error').length;

  const stats = [
    {
      name: 'Active Feeds',
      value: activeFeeds,
      total: feeds.length,
      icon: Rss,
      color: 'text-[hsl(var(--primary))]',
      bg: 'bg-[hsl(var(--primary))]/20',
    },
    {
      name: 'Jobs Completed',
      value: completedJobs,
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-900/30',
    },
    {
      name: 'Jobs Failed',
      value: failedJobs,
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-900/30',
    },
    {
      name: 'Running Now',
      value: runningJobs,
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-900/30',
    },
  ];

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
    toast.success(feed.is_disabled ? 'Feed re-enabled' : 'Feed disabled');
  };

  // Redirect non-admins
  if (user && user.role !== 'admin') {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-red-900 mb-2">Access Denied</h2>
            <p className="text-red-700">You don't have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">System Health</h1>
          <p className="text-stone-500">
            Monitor job status and system performance
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.name} className="border-stone-800 bg-stone-900">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
                </div>
                <p className="text-2xl font-bold text-stone-100">{stat.value}</p>
                <p className="text-sm text-stone-500">{stat.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feed Status */}
      <Card className="border-stone-800 bg-stone-900 mb-6">
        <CardHeader>
          <CardTitle className="text-lg text-stone-200">Feed Status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Fetched</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-stone-500 py-8">
                      No feeds configured
                    </TableCell>
                  </TableRow>
                  ) : (
                  feeds.map((feed) => (
                    <TableRow key={feed.id}>
                      <TableCell className="font-medium text-stone-200">{feed.name}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          feed.status === 'active' ? 'bg-green-900/30 text-green-400' :
                          feed.status === 'error' ? 'bg-red-900/30 text-red-400' :
                          'bg-stone-800 text-stone-400'
                        )}>
                          {feed.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-stone-500">
                        {feed.last_fetched 
                          ? format(new Date(feed.last_fetched), 'MMM d, h:mm a')
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>{feed.item_count || 0}</TableCell>
                      <TableCell className="text-sm text-red-400 max-w-[200px] truncate">
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
      <Card className="border-stone-800 bg-stone-900 mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-stone-200">
              <Wand2 className="w-4 h-4 text-amber-400" />
              Generated Feeds
            </CardTitle>
            <Badge variant="secondary" className="bg-stone-800 text-stone-400">{generatedFeeds.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source URL</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Last Success</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generatedFeeds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-stone-500 py-8">No generated feeds yet</TableCell>
                  </TableRow>
                ) : generatedFeeds.map((feed) => (
                  <TableRow key={feed.id} className={feed.is_disabled ? 'opacity-50' : ''}>
                    <TableCell className="max-w-[220px] truncate text-sm text-stone-300">
                      <a href={feed.source_url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
                        {feed.source_url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        feed.method === 'direct_rss' || feed.method === 'discovered_rss'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-amber-900/30 text-amber-400'
                      }>
                        {feed.method || 'scraped'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-stone-500">{feed.created_by}</TableCell>
                    <TableCell className="text-sm text-stone-500">
                      {feed.last_success ? format(new Date(feed.last_success), 'MMM d, h:mm a') : '—'}
                    </TableCell>
                    <TableCell>
                      {(feed.error_count || 0) > 0
                        ? <Badge className="bg-red-900/30 text-red-400">{feed.error_count}</Badge>
                        : <span className="text-stone-600">0</span>
                      }
                    </TableCell>
                    <TableCell>
                      <Badge className={feed.is_disabled ? 'bg-stone-800 text-stone-500' : 'bg-green-900/30 text-green-400'}>
                        {feed.is_disabled ? 'Disabled' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => toggleFeedDisabled(feed)}
                        className={feed.is_disabled ? 'text-amber-400 hover:text-amber-300' : 'text-stone-600 hover:text-red-400'}
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
      <Card className="border-stone-800 bg-stone-900">
        <CardHeader>
          <CardTitle className="text-lg text-stone-200">Job History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Type</TableHead>
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
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-stone-600" />
                              <span className="capitalize">
                                {job.job_type?.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[job.status]}>
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-stone-500">
                           {job.started_at 
                             ? format(new Date(job.started_at), 'MMM d, h:mm:ss a')
                             : '-'
                           }
                          </TableCell>
                          <TableCell className="text-sm text-stone-500">
                           {job.completed_at 
                             ? format(new Date(job.completed_at), 'MMM d, h:mm:ss a')
                             : '-'
                           }
                          </TableCell>
                          <TableCell>{job.retry_count || 0}</TableCell>
                          <TableCell className="text-sm text-red-400 max-w-[200px] truncate">
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