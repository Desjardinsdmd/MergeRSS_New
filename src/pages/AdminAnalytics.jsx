import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';
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
    <div className="px-4 py-5 sm:p-6 lg:p-8 flex items-center justify-center min-h-64">
      <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
    </div>
  );
  if (user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-5 sm:p-6 lg:p-8">
        <div className="panel p-8 text-center text-sm text-stone-500">Access denied. Admin only.</div>
      </div>
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
    { name: 'Sources', value: allFeeds.length, icon: Rss },
    { name: 'Briefings', value: allDigests.length, icon: FileText },
    { name: 'Briefing adds (all-time)', value: totalAdded, icon: Users },
    { name: 'Deliveries sent', value: sentDeliveries, icon: TrendingUp, tone: 'text-emerald-300' },
    { name: 'Unread deliveries', value: unreadDeliveries, icon: TrendingUp },
    { name: 'Unique users', value: uniqueUsers, icon: Users },
  ];

  const rankList = (rows, renderValue) => (
    <ol className="divide-y divide-white/[0.06]">
      {rows.map((row, i) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`w-5 font-display text-sm font-semibold ${i === 0 ? 'text-[#C4A5FD]' : 'text-stone-500'}`}>{i + 1}</span>
            <span className="truncate text-sm text-stone-300">{row.name}</span>
          </div>
          <span className="chip-brand flex-shrink-0">{renderValue(row)}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader title="Analytics" subtitle="Platform-wide usage." />

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map(stat => (
          <div key={stat.name} className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <MicroLabel>{stat.name}</MicroLabel>
              <stat.icon className="h-4 w-4 text-stone-600" aria-hidden="true" />
            </div>
            <p className={`font-display text-3xl font-semibold tabular-nums ${stat.tone || 'text-stone-100'}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top briefing adds */}
        <section className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <Star className="h-4 w-4 text-[#C4A5FD]" aria-hidden="true" />
            Top briefings by adds
          </h2>
          {digestAdds.length === 0 ? (
            <p className="text-sm text-stone-500">No data yet</p>
          ) : rankList(digestAdds, d => `${d.added_count} adds`)}
        </section>

        {/* Top directory sources */}
        <section className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <Rss className="h-4 w-4 text-[#C4A5FD]" aria-hidden="true" />
            Top directory sources by subscribers
          </h2>
          {topDirFeeds.length === 0 ? (
            <p className="text-sm text-stone-500">No data yet</p>
          ) : rankList(topDirFeeds, f => `${f.added_count || 0} subs`)}
        </section>
      </div>
    </div>
  );
}
