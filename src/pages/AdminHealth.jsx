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
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  scheduled: 'bg-amber-100 text-amber-700',
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
      color: 'text-violet-600',
      bg: 'bg-violet-100',
    },
    {
      name: 'Jobs Completed',
      value: completedJobs,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      name: 'Jobs Failed',
      value: failedJobs,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-100',
    },
    {
      name: 'Running Now',
      value: runningJobs,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
  ];

  const handleRefresh = () => {
    refetch();
    toast.success('Data refreshed');
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
          <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
          <p className="text-slate-600">
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
          <Card key={stat.name} className="border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feed Status */}
      <Card className="border-slate-100 mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Feed Status</CardTitle>
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
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      No feeds configured
                    </TableCell>
                  </TableRow>
                ) : (
                  feeds.map((feed) => (
                    <TableRow key={feed.id}>
                      <TableCell className="font-medium">{feed.name}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          feed.status === 'active' ? 'bg-green-100 text-green-700' :
                          feed.status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'
                        )}>
                          {feed.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {feed.last_fetched 
                          ? format(new Date(feed.last_fetched), 'MMM d, h:mm a')
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>{feed.item_count || 0}</TableCell>
                      <TableCell className="text-sm text-red-600 max-w-[200px] truncate">
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

      {/* Job History */}
      <Card className="border-slate-100">
        <CardHeader>
          <CardTitle className="text-lg">Job History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
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
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">
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
                              <Icon className="w-4 h-4 text-slate-400" />
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
                          <TableCell className="text-sm text-slate-500">
                            {job.started_at 
                              ? format(new Date(job.started_at), 'MMM d, h:mm:ss a')
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {job.completed_at 
                              ? format(new Date(job.completed_at), 'MMM d, h:mm:ss a')
                              : '-'
                            }
                          </TableCell>
                          <TableCell>{job.retry_count || 0}</TableCell>
                          <TableCell className="text-sm text-red-600 max-w-[200px] truncate">
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