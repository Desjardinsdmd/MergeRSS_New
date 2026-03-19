import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { Rss, FileText, TrendingUp, Plus, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OnboardingTour from '@/components/OnboardingTour';
import SetupWalkthrough from '@/components/SetupWalkthrough';
import StreakCounter from '@/components/dashboard/StreakCounter';
import IntelligenceDashboard from '@/components/feeds/IntelligenceDashboard';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
      if (!userData.onboarding_complete) {
        setShowTour(true);
      } else if (!userData.setup_walkthrough_complete) {
        setShowWalkthrough(true);
      }
    };
    loadUser();
  }, []);

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds', user?.email],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date', 500),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }, '-created_date', 200),
    enabled: !!user,
  });

  const digestIds = digests.map(d => d.id);

  const { data: unreadDeliveries = [] } = useQuery({
    queryKey: ['unread-deliveries', digestIds.join(',')],
    queryFn: () => base44.entities.DigestDelivery.filter(
      { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent', is_read: false },
      '-created_date',
      200
    ),
    enabled: !!user && digestIds.length > 0,
  });

  const errorFeeds = feeds.filter(f => f.status === 'error');

  const stats = [
    { name: 'Active Feeds', value: feeds.filter(f => f.status === 'active').length, icon: Rss, href: 'Feeds' },
    { name: 'Digests', value: digests.length, icon: FileText, href: 'Digests' },
    { name: 'Unread Digests', value: unreadDeliveries.length, icon: TrendingUp, href: 'Inbox' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {showTour && (
        <OnboardingTour onComplete={(skipToWalkthrough) => {
          setShowTour(false);
          if (!skipToWalkthrough) setShowWalkthrough(true);
        }} />
      )}
      {showWalkthrough && <SetupWalkthrough onComplete={() => setShowWalkthrough(false)} />}

      {/* Feed error banner */}
      {errorFeeds.length > 0 && (
        <div className="mb-6 flex items-center gap-3 p-3 bg-red-950/20 border border-red-900/40 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorFeeds.length} feed{errorFeeds.length > 1 ? 's are' : ' is'} experiencing errors.</span>
          <Link to={createPageUrl('Feeds')} className="ml-auto font-semibold hover:text-red-300 transition-colors">Fix →</Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-100 mb-1">
            {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })()}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-stone-500 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="mt-3">
            <StreakCounter user={user} />
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {stats.map((stat) => (
          <Link key={stat.name} to={createPageUrl(stat.href)}>
            <div className="bg-stone-900 border border-stone-800 hover:border-stone-700 transition cursor-pointer p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-stone-800">
                  <stat.icon className="w-4 h-4 text-[hsl(var(--primary))]" />
                </div>
                <ArrowRight className="w-4 h-4 text-stone-700" />
              </div>
              <p className="text-2xl font-bold text-stone-100">{stat.value}</p>
              <p className="text-xs text-stone-500">{stat.name}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {feeds.length === 0 && (
        <div className="mb-8 border border-stone-700 bg-stone-900/60 p-8 text-center">
          <div className="w-12 h-12 bg-stone-800 flex items-center justify-center mx-auto mb-4">
            <Rss className="w-6 h-6 text-[hsl(var(--primary))]" />
          </div>
          <h3 className="text-lg font-semibold text-stone-100 mb-2">Start your intelligence feed</h3>
          <p className="text-stone-500 mb-6 max-w-sm mx-auto text-sm">
            Add RSS feeds to immediately see AI-ranked articles, trending topics, and daily briefings.
          </p>
          <Link to={createPageUrl('Feeds')}>
            <Button className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-bold">
              <Plus className="w-4 h-4 mr-2" />
              Add Feeds
            </Button>
          </Link>
        </div>
      )}

      {/* Intelligence Dashboard */}
      {feeds.length > 0 && (
        <IntelligenceDashboard
          user={user}
          feeds={feeds}
          digests={digests}
          unreadDeliveries={unreadDeliveries}
        />
      )}
    </div>
  );
}