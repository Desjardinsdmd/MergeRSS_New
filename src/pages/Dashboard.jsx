import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { 
  Rss, 
  FileText, 
  Bell, 
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ArticleSummarizeButton from '@/components/feeds/ArticleSummarizeButton';
import TrendingArticles from '@/components/feeds/TrendingArticles';
import RelatedArticles from '@/components/feeds/RelatedArticles';
import OnboardingTour from '@/components/OnboardingTour';
import SetupWalkthrough from '@/components/SetupWalkthrough';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [liveArticles, setLiveArticles] = useState([]);
  const [expandedArticles, setExpandedArticles] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [articleSummaries, setArticleSummaries] = useState({});

  const handleSummaryUpdate = (updatedItem) => {
    setArticleSummaries(prev => ({ ...prev, [updatedItem.id]: updatedItem.ai_summary }));
  };

  const mergeItem = (item) => ({
    ...item,
    ai_summary: articleSummaries[item.id] ?? item.ai_summary,
  });

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
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date', 10),
    enabled: !!user,
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests'],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }, '-created_date', 10),
    enabled: !!user,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => base44.entities.DigestDelivery.list('-created_date', 5),
    enabled: !!user,
  });

  const { data: feedItems = [] } = useQuery({
    queryKey: ['feedItems'],
    queryFn: () => base44.entities.FeedItem.list('-published_date', 10),
    enabled: !!user,
  });

  // Real-time subscription to new feed items
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = base44.entities.FeedItem.subscribe((event) => {
      if (event.type === 'create') {
        setLiveArticles(prev => {
          const updated = [event.data, ...prev];
          return updated.slice(0, 10);
        });
      }
    });

    return () => unsubscribe();
  }, [user]);

  const totalAdded = digests.reduce((sum, d) => sum + (d.added_count || 0), 0);

  const allArticles = liveArticles.length > 0 ? liveArticles : feedItems;
  const FEED_CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];
  const presentCategories = FEED_CATEGORIES.filter(cat => allArticles.some(i => i.category === cat));
  const categories = ['All', ...presentCategories];
  const filteredArticles = activeCategory === 'All' ? allArticles : allArticles.filter(i => i.category === activeCategory);

  const stats = [
    { 
      name: 'Active Feeds', 
      value: feeds.filter(f => f.status === 'active').length,
      total: feeds.length,
      icon: Rss,
      color: 'violet'
    },
    { 
      name: 'Digests', 
      value: digests.length,
      icon: FileText,
      color: 'indigo'
    },
    { 
      name: 'Items This Week', 
      value: feedItems.length,
      icon: TrendingUp,
      color: 'emerald'
    },
    { 
      name: 'Digest Adds', 
      value: totalAdded,
      icon: Users,
      color: 'amber'
    },
  ];

  const colorClasses = {
    violet: 'bg-indigo-50 text-indigo-600',
    indigo: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {showTour && (
        <OnboardingTour onComplete={(skipToWalkthrough) => {
          setShowTour(false);
          if (!skipToWalkthrough) setShowWalkthrough(true);
        }} />
      )}
      {showWalkthrough && <SetupWalkthrough onComplete={() => setShowWalkthrough(false)} />}
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-slate-600">
          Here's what's happening with your feeds
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.name} className="border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${colorClasses[stat.color]}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      {feeds.length === 0 && (
        <Card className="mb-8 border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Rss className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Add your first feed
            </h3>
            <p className="text-slate-600 mb-4 max-w-sm mx-auto">
              Start by adding RSS feeds to aggregate content from your favorite sources
            </p>
            <Link to={createPageUrl('Feeds')}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                <Plus className="w-4 h-4 mr-2" />
                Add Feed
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {expandedArticles && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col border-slate-100">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100">
              <CardTitle className="text-lg font-semibold">Latest Articles</CardTitle>
              <button 
                onClick={() => setExpandedArticles(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1">
              {(liveArticles.length > 0 ? liveArticles : feedItems).length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  No items yet. Add feeds to start aggregating content.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(liveArticles.length > 0 ? liveArticles : feedItems).map((item) => {
                    const merged = mergeItem(item);
                    return (
                      <div key={item.id} className="p-4 hover:bg-slate-50 transition">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <p className="font-medium text-slate-900 mb-1 line-clamp-2">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Clock className="w-3 h-3" />
                            {item.published_date && (
                              <>
                                {new Date(item.published_date).toLocaleDateString()} at {new Date(item.published_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </>
                            )}
                            {item.category && (
                              <Badge variant="secondary" className="text-xs">
                                {item.category}
                              </Badge>
                            )}
                          </div>
                        </a>
                        <ArticleSummarizeButton item={merged} onSummaryUpdate={handleSummaryUpdate} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Feed Items */}
        <Card className="border-slate-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Latest Articles</CardTitle>
            <button 
              onClick={() => setExpandedArticles(true)}
              className="text-sm text-violet-600 hover:underline flex items-center gap-1 bg-none border-none cursor-pointer"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </CardHeader>
          {categories.length > 1 && (
            <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <CardContent className="p-0">
            {filteredArticles.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No items yet. Add feeds to start aggregating content.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredArticles.slice(0, 5).map((item) => {
                  const merged = mergeItem(item);
                  return (
                    <div key={item.id} className="p-4 hover:bg-slate-50 transition">
                      <a 
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <p className="font-medium text-slate-900 mb-1 line-clamp-1">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {item.published_date && (
                            <>
                              {new Date(item.published_date).toLocaleDateString()} at {new Date(item.published_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </>
                          )}
                          {item.category && activeCategory === 'All' && (
                            <Badge variant="secondary" className="text-xs">
                              {item.category}
                            </Badge>
                          )}
                        </div>
                      </a>
                      <ArticleSummarizeButton item={merged} onSummaryUpdate={handleSummaryUpdate} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Deliveries */}
        <Card className="border-slate-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Digest History</CardTitle>
            <Link to={createPageUrl('Inbox')} className="text-sm text-violet-600 hover:underline flex items-center gap-1">
              View inbox <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {deliveries.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No deliveries yet. Create a digest to get started.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {deliveries.slice(0, 5).map((delivery) => (
                  <div key={delivery.id} className="p-4 flex items-center gap-3">
                    {delivery.status === 'sent' ? (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : delivery.status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm">
                        {delivery.delivery_type.charAt(0).toUpperCase() + delivery.delivery_type.slice(1)} Delivery
                      </p>
                      <p className="text-xs text-slate-500">
                        {delivery.sent_at 
                          ? new Date(delivery.sent_at).toLocaleString()
                          : 'Pending'
                        }
                      </p>
                    </div>
                    <Badge 
                      variant={delivery.status === 'sent' ? 'default' : 'secondary'}
                      className={delivery.status === 'sent' ? 'bg-green-100 text-green-700' : ''}
                    >
                      {delivery.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <Link to={createPageUrl('Feeds')}>
          <Card className="border-slate-100 hover:border-violet-200 hover:shadow-md transition cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-violet-50 rounded-lg">
                <Plus className="w-4 h-4 text-violet-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Add Feed</span>
            </CardContent>
          </Card>
        </Link>
        <Link to={createPageUrl('Digests')}>
          <Card className="border-slate-100 hover:border-violet-200 hover:shadow-md transition cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Create Digest</span>
            </CardContent>
          </Card>
        </Link>
        <Link to={createPageUrl('Integrations')}>
          <Card className="border-slate-100 hover:border-violet-200 hover:shadow-md transition cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Bell className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Connect Apps</span>
            </CardContent>
          </Card>
        </Link>
        <Link to={createPageUrl('Settings')}>
          <Card className="border-slate-100 hover:border-violet-200 hover:shadow-md transition cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Settings</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}