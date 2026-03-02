import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Rss, FileText, TrendingUp, Star } from 'lucide-react';

export default function AdminAnalytics() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: allFeeds = [] } = useQuery({
    queryKey: ['admin-all-feeds'],
    queryFn: () => base44.entities.Feed.list('-created_date', 500),
    enabled: user?.role === 'admin',
  });

  const { data: allDigests = [] } = useQuery({
    queryKey: ['admin-all-digests'],
    queryFn: () => base44.entities.Digest.list('-created_date', 500),
    enabled: user?.role === 'admin',
  });

  const { data: allDeliveries = [] } = useQuery({
    queryKey: ['admin-all-deliveries'],
    queryFn: () => base44.entities.DigestDelivery.list('-created_date', 500),
    enabled: user?.role === 'admin',
  });

  const { data: directoryFeeds = [] } = useQuery({
    queryKey: ['admin-dir-feeds'],
    queryFn: () => base44.entities.DirectoryFeed.list('-added_count', 200),
    enabled: user?.role === 'admin',
  });

  if (!user) return null;
  if (user.role !== 'admin') {
    return (
      <div className="p-8 text-center text-slate-500">Access denied. Admin only.</div>
    );
  }

  const totalAdded = allDigests.reduce((sum, d) => sum + (d.added_count || 0), 0);
  const unreadDeliveries = allDeliveries.filter(d => !d.is_read).length;
  const sentDeliveries = allDeliveries.filter(d => d.status === 'sent').length;

  // Digest adds by digest
  const digestAdds = allDigests
    .filter(d => d.added_count > 0)
    .sort((a, b) => (b.added_count || 0) - (a.added_count || 0))
    .slice(0, 10);

  // Top directory feeds
  const topDirFeeds = directoryFeeds.slice(0, 10);

  // Unique users (by created_by)
  const uniqueUsers = new Set([
    ...allFeeds.map(f => f.created_by),
    ...allDigests.map(d => d.created_by),
  ].filter(Boolean)).size;

  const stats = [
    { name: 'Total Feeds', value: allFeeds.length, icon: Rss, color: 'bg-indigo-50 text-indigo-600' },
    { name: 'Total Digests', value: allDigests.length, icon: FileText, color: 'bg-violet-50 text-violet-600' },
    { name: 'Digest Adds (all-time)', value: totalAdded, icon: Users, color: 'bg-amber-50 text-amber-600' },
    { name: 'Deliveries Sent', value: sentDeliveries, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600' },
    { name: 'Unread Deliveries', value: unreadDeliveries, icon: TrendingUp, color: 'bg-red-50 text-red-600' },
    { name: 'Unique Users', value: uniqueUsers, icon: Users, color: 'bg-sky-50 text-sky-600' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Platform-wide usage statistics</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map(stat => (
          <Card key={stat.name} className="border-slate-100">
            <CardContent className="p-4">
              <div className={`p-2 rounded-lg w-fit mb-3 ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top digest adds */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              Top Digests by Adds
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {digestAdds.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet</p>
            ) : (
              <div className="space-y-2">
                {digestAdds.map((d, i) => (
                  <div key={d.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                      <span className="text-sm text-slate-800 truncate">{d.name}</span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 border-0 text-xs ml-2 flex-shrink-0">
                      {d.added_count} adds
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top directory feeds */}
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Rss className="w-4 h-4 text-indigo-500" />
              Top Directory Feeds by Subscribers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topDirFeeds.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet</p>
            ) : (
              <div className="space-y-2">
                {topDirFeeds.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                      <span className="text-sm text-slate-800 truncate">{f.name}</span>
                    </div>
                    <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs ml-2 flex-shrink-0">
                      {f.added_count || 0} subs
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}