import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Rss, FileText, TrendingUp, Star, Loader2 } from 'lucide-react';

export default function AdminAnalytics() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: allFeeds = [] } = useQuery({
    queryKey: ['admin-all-feeds'],
    queryFn: () => base44.entities.Feed.list('-created_date', 500),
    enabled: isAdmin,
    staleTime: 0,
  });

  const { data: allDigests = [] } = useQuery({
    queryKey: ['admin-all-digests'],
    queryFn: () => base44.entities.Digest.list('-created_date', 500),
    enabled: isAdmin,
    staleTime: 0,
  });

  const { data: allDeliveries = [] } = useQuery({
    queryKey: ['admin-all-deliveries'],
    queryFn: () => base44.entities.DigestDelivery.list('-created_date', 500),
    enabled: isAdmin,
    staleTime: 0,
  });

  const { data: directoryFeeds = [] } = useQuery({
    queryKey: ['admin-dir-feeds'],
    queryFn: () => base44.entities.DirectoryFeed.list('-added_count', 200),
    enabled: isAdmin,
    staleTime: 0,
  });

  if (!user) return (
    <div className="p-6 lg:p-8 flex items-center justify-center min-h-64">
      <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
    </div>
  );
  if (user.role !== 'admin') {
    return (
      <div className="p-8 text-center text-stone-500">Access denied. Admin only.</div>
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
    { name: 'Total Feeds', value: allFeeds.length, icon: Rss, color: 'bg-amber-900/30 text-amber-400' },
    { name: 'Total Digests', value: allDigests.length, icon: FileText, color: 'bg-blue-900/30 text-blue-400' },
    { name: 'Digest Adds (all-time)', value: totalAdded, icon: Users, color: 'bg-green-900/30 text-green-400' },
    { name: 'Deliveries Sent', value: sentDeliveries, icon: TrendingUp, color: 'bg-emerald-900/30 text-emerald-400' },
    { name: 'Unread Deliveries', value: unreadDeliveries, icon: TrendingUp, color: 'bg-red-900/30 text-red-400' },
    { name: 'Unique Users', value: uniqueUsers, icon: Users, color: 'bg-sky-900/30 text-sky-400' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-100">Analytics</h1>
        <p className="text-stone-500 text-sm mt-1">Platform-wide usage statistics</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
         {stats.map(stat => (
           <Card key={stat.name} className="border-stone-800 bg-stone-900">
             <CardContent className="p-4">
               <div className={`p-2 rounded-lg w-fit mb-3 ${stat.color}`}>
                 <stat.icon className="w-4 h-4" />
               </div>
               <p className="text-2xl font-bold text-stone-100">{stat.value}</p>
               <p className="text-sm text-stone-500">{stat.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top digest adds */}
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-stone-200">
              <Star className="w-4 h-4 text-amber-400" />
              Top Digests by Adds
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {digestAdds.length === 0 ? (
              <p className="text-sm text-stone-600">No data yet</p>
            ) : (
              <div className="space-y-2">
                {digestAdds.map((d, i) => (
                  <div key={d.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-stone-500 w-4">{i + 1}</span>
                      <span className="text-sm text-stone-300 truncate">{d.name}</span>
                    </div>
                    <Badge className="bg-amber-900/30 text-amber-400 border-0 text-xs ml-2 flex-shrink-0">
                      {d.added_count} adds
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top directory feeds */}
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-stone-200">
              <Rss className="w-4 h-4 text-amber-400" />
              Top Directory Feeds by Subscribers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {topDirFeeds.length === 0 ? (
              <p className="text-sm text-stone-600">No data yet</p>
            ) : (
              <div className="space-y-2">
                {topDirFeeds.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-stone-500 w-4">{i + 1}</span>
                      <span className="text-sm text-stone-300 truncate">{f.name}</span>
                    </div>
                    <Badge className="bg-amber-900/30 text-amber-400 border-0 text-xs ml-2 flex-shrink-0">
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