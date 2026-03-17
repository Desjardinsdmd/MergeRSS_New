import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Keyboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const categoryColors = {
  CRE: 'bg-blue-950 text-blue-400',
  Markets: 'bg-green-950 text-green-400',
  Tech: 'bg-purple-950 text-purple-400',
  News: 'bg-orange-950 text-orange-400',
  Finance: 'bg-emerald-950 text-emerald-400',
  Crypto: 'bg-yellow-950 text-yellow-400',
  AI: 'bg-pink-950 text-pink-400',
  Other: 'bg-stone-800 text-stone-300',
};
import ArticleSummarizeButton from '@/components/feeds/ArticleSummarizeButton';
import ArticleCard from '@/components/feeds/ArticleCard';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import TrendingArticles from '@/components/feeds/TrendingArticles';
import RelatedArticles from '@/components/feeds/RelatedArticles';
import OnboardingTour from '@/components/OnboardingTour';
import SetupWalkthrough from '@/components/SetupWalkthrough';
import DailySnapshot from '@/components/dashboard/DailySnapshot';
import StreakCounter from '@/components/dashboard/StreakCounter';
import BookmarkButton from '@/components/dashboard/BookmarkButton';
import FeedHealthWidget from '@/components/dashboard/FeedHealthWidget';
import DigestQuickActions from '@/components/dashboard/DigestQuickActions';
import DigestDeliveryHistory from '@/components/dashboard/DigestDeliveryHistory';
import ContextualTips from '@/components/dashboard/ContextualTips';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [liveArticles, setLiveArticles] = useState([]);
  const [expandedArticles, setExpandedArticles] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [articleSummaries, setArticleSummaries] = useState({});
  const [readItems, setReadItems] = useState(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleSummaryUpdate = (updatedItem) => {
    setArticleSummaries(prev => ({ ...prev, [updatedItem.id]: updatedItem.ai_summary }));
  };

  const mergeItem = (item) => ({
    ...item,
    ai_summary: articleSummaries[item.id] ?? item.ai_summary,
  });

  const [dashLayout, setDashLayout] = useState({});

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
      setDashLayout(userData.dashboard_layout || {});
      if (!userData.onboarding_complete) {
        setShowTour(true);
      } else if (!userData.setup_walkthrough_complete) {
        setShowWalkthrough(true);
      }
    };
    loadUser();
  }, []);

  const widget = (id) => dashLayout?.widgets?.[id] !== false;

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds', user?.email],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date', 500),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests'],
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

  const feedIds = feeds.map(f => f.id);

  const { data: feedItems = [] } = useQuery({
    queryKey: ['feedItems', feedIds.join(','), feeds.map(f=>f.category).join(',')],
    queryFn: async () => {
      if (!feedIds.length) return [];
      // Group feed IDs by category for balanced fetching
      const catMap = {};
      feeds.forEach(f => {
        if (!catMap[f.category]) catMap[f.category] = [];
        catMap[f.category].push(f.id);
      });
      const cats = Object.keys(catMap);
      const perCatLimit = Math.max(5, Math.ceil(50 / cats.length));
      const results = await Promise.all(
        cats.map(cat =>
          base44.entities.FeedItem.filter({ feed_id: { $in: catMap[cat] } }, '-published_date', perCatLimit)
        )
      );
      // Merge, dedupe, sort by date
      const seen = new Set();
      return results.flat()
        .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
        .sort((a, b) => new Date(b.published_date) - new Date(a.published_date));
    },
    enabled: !!user && feedIds.length > 0,
  });

  // Real-time subscription to new feed items
  useEffect(() => {
    if (!user || !feeds.length) return;
    const feedIdSet = new Set(feeds.map(f => f.id));
    const unsubscribe = base44.entities.FeedItem.subscribe((event) => {
      if (event.type === 'create' && feedIdSet.has(event.data?.feed_id)) {
        setLiveArticles(prev => [event.data, ...prev].slice(0, 50));
      }
    });
    return () => unsubscribe();
  }, [user, feeds]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!expandedArticles) return;
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => prev + 1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if ((e.key === 'o' || e.key === 'Enter') && focusedIndex >= 0) {
        const articles = filteredArticles;
        if (articles[focusedIndex]) setExpandedItem(mergeItem(articles[focusedIndex]));
      } else if (e.key === 'Escape') {
        if (expandedItem) setExpandedItem(null);
        else setExpandedArticles(false);
      } else if (e.key === '?') {
        setShowShortcuts(s => !s);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [expandedArticles, focusedIndex, expandedItem]);

  const markAsRead = async (item, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setReadItems(prev => new Set([...prev, item.id]));
    await base44.entities.FeedItem.update(item.id, { is_read: true });
    queryClient.invalidateQueries({ queryKey: ['feedItems'] });
  };

  const allArticles = liveArticles.length > 0 ? liveArticles : feedItems;
  const unreadCount = allArticles.filter(i => !i.is_read && !readItems.has(i.id)).length;

  const FEED_CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];
  const presentCategories = FEED_CATEGORIES.filter(cat => allArticles.some(i => i.category === cat));
  const unreadByCategory = {};
  presentCategories.forEach(cat => {
    unreadByCategory[cat] = allArticles.filter(i => i.category === cat && !i.is_read && !readItems.has(i.id)).length;
  });
  const categories = ['All', ...presentCategories];
  const filteredArticles = (activeCategory === 'All' ? allArticles : allArticles.filter(i => i.category === activeCategory))
    .filter(i => !readItems.has(i.id));

  const errorFeeds = feeds.filter(f => f.status === 'error');

  const stats = [
    { name: 'Active Feeds', value: feeds.length, icon: Rss, color: 'violet', href: 'Feeds' },
    { name: 'Digests', value: digests.length, icon: FileText, color: 'indigo', href: 'Digests' },
    { name: 'Unread Items', value: unreadDeliveries.length, icon: TrendingUp, color: 'emerald', href: 'Inbox' },
  ];

  const colorClasses = {
    violet: 'bg-stone-800 text-[hsl(var(--primary))]',
    indigo: 'bg-stone-800 text-[hsl(var(--primary))]',
    emerald: 'bg-stone-800 text-[hsl(var(--primary))]',
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

      {/* Feed error banner */}
      {errorFeeds.length > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-stone-900 border border-red-900 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorFeeds.length} feed{errorFeeds.length > 1 ? 's are' : ' is'} experiencing errors.</span>
          <Link to={createPageUrl('Feeds')} className="ml-auto font-medium underline text-[hsl(var(--primary))] hover:opacity-80 transition-opacity">Fix now →</Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100 mb-1">
          {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })()}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-stone-500 text-sm">Your daily briefing is ready</p>
        <div className="mt-3 flex items-center gap-2">
          <StreakCounter user={user} />
        </div>
      </div>

      {/* Hero: Trending Articles */}
      {feeds.length > 0 && allArticles.length >= 3 && widget('trendingArticles') && (
        <div className="mb-8 bg-gradient-to-br from-stone-800/50 to-stone-900 border border-stone-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-[hsl(var(--primary))]" />
            <h2 className="text-lg font-semibold text-stone-100">What's trending</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const trending = (() => {
                const freq = {};
                allArticles.forEach(item => {
                  const words = (item.title + ' ' + (item.description || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
                  [...new Set(words)].forEach(w => { freq[w] = (freq[w] || 0) + 1; });
                });
                return allArticles.map(item => {
                  const words = (item.title + ' ' + (item.description || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
                  const score = [...new Set(words)].reduce((s, w) => s + (freq[w] > 1 ? freq[w] : 0), 0);
                  return { ...item, _trendScore: score };
                }).sort((a, b) => b._trendScore - a._trendScore).slice(0, 3);
              })();
              return trending.map((item) => (
                <a
                  key={item.id}
                  href={safeUrl(item.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-stone-900/60 border border-stone-700/50 hover:border-stone-600 hover:bg-stone-800/60 transition p-4 group"
                >
                  <h3 className="font-semibold text-stone-100 text-sm line-clamp-2 mb-2 group-hover:text-[hsl(var(--primary))] transition-colors">
                    {decodeHtml(item.title)}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.published_date && new Date(item.published_date).toLocaleDateString()}
                    </div>
                    {item.category && <span className="bg-stone-800 text-stone-400 px-2 py-0.5">{item.category}</span>}
                  </div>
                </a>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Daily AI Snapshot */}
      {feeds.length > 0 && widget('dailySnapshot') && <DailySnapshot />}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.name} to={createPageUrl(stat.href)}>
            <div className="bg-stone-900 border border-stone-800 hover:border-stone-700 transition cursor-pointer p-3 sm:p-4">
             <div className="flex items-center justify-between mb-2 sm:mb-3">
               <div className={`p-1.5 sm:p-2 ${colorClasses[stat.color]}`}>
                 <stat.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
               </div>
               <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-700" />
             </div>
             <p className="text-xl sm:text-2xl font-bold text-stone-100">{stat.value}</p>
             <p className="text-xs sm:text-sm text-stone-500 truncate">{stat.name}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Contextual tips */}
      {feeds.length > 0 && (
        <ContextualTips
          feedCount={feeds.length}
          digestCount={digests.length}
          hasSlack={false}
        />
      )}

      {/* Empty state */}
      {feeds.length === 0 && (
        <div className="mb-8 border border-dashed border-stone-800 bg-stone-900/50 p-8 text-center">
          <div className="w-12 h-12 bg-stone-800 flex items-center justify-center mx-auto mb-4">
            <Rss className="w-6 h-6 text-[hsl(var(--primary))]" />
          </div>
          <h3 className="text-lg font-semibold text-stone-100 mb-2">Add your first feed</h3>
          <p className="text-stone-500 mb-4 max-w-sm mx-auto">
            Start by adding RSS feeds to aggregate content from your favorite sources
          </p>
          <Link to={createPageUrl('Feeds')}>
            <Button className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-bold transition-opacity">
              <Plus className="w-4 h-4 mr-2" />
              Add Feed
            </Button>
          </Link>
        </div>
      )}

      {/* Article modal */}
      {expandedArticles && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-stone-900 border border-stone-800">
            <div className="flex flex-row items-center justify-between p-4 pb-3 border-b border-stone-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                {expandedItem && (
                  <button onClick={() => setExpandedItem(null)} className="text-stone-500 hover:text-stone-200 text-sm mr-1">
                    ← Back
                  </button>
                )}
                <span className="text-base font-semibold text-stone-100">
                  {expandedItem ? 'Article' : 'Latest Articles'}
                </span>
                {!expandedItem && unreadCount > 0 && (
                  <span className="bg-[hsl(var(--primary))] text-stone-900 text-xs font-bold px-2 py-0.5">{unreadCount} unread</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowShortcuts(s => !s)} title="Keyboard shortcuts (?)" className="text-stone-600 hover:text-stone-300 p-1">
                  <Keyboard className="w-4 h-4" />
                </button>
                <button onClick={() => { setExpandedArticles(false); setExpandedItem(null); }} className="text-stone-600 hover:text-stone-200">✕</button>
              </div>
            </div>
            {showShortcuts && (
              <div className="px-4 py-2 bg-stone-950 border-b border-stone-800 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
                <span><kbd className="bg-stone-800 border border-stone-700 px-1">j/↓</kbd> next</span>
                <span><kbd className="bg-stone-800 border border-stone-700 px-1">k/↑</kbd> prev</span>
                <span><kbd className="bg-stone-800 border border-stone-700 px-1">o/↵</kbd> open</span>
                <span><kbd className="bg-stone-800 border border-stone-700 px-1">Esc</kbd> back/close</span>
              </div>
            )}
            <div className="p-0 overflow-y-auto flex-1">
              {expandedItem ? (
                <div className="p-5">
                  <a href={safeUrl(expandedItem.url)} target="_blank" rel="noopener noreferrer" className="group">
                    <h2 className="text-base font-semibold text-stone-100 group-hover:text-[hsl(var(--primary))] transition-colors mb-2 leading-snug">
                      {expandedItem.title}
                    </h2>
                  </a>
                  <div className="flex items-center gap-2 text-xs text-stone-500 mb-3">
                    <Clock className="w-3 h-3" />
                    {expandedItem.published_date && new Date(expandedItem.published_date).toLocaleString()}
                    {expandedItem.category && <span className="bg-stone-800 text-stone-400 px-2 py-0.5 text-xs">{expandedItem.category}</span>}
                    {expandedItem.author && <span>by {expandedItem.author}</span>}
                  </div>
                  {expandedItem.description && (
                    <p className="text-sm text-stone-400 leading-relaxed mb-3">{decodeHtml(expandedItem.description)}</p>
                  )}
                  <ArticleSummarizeButton item={mergeItem(expandedItem)} onSummaryUpdate={(updated) => { handleSummaryUpdate(updated); setExpandedItem(updated); }} />
                  <RelatedArticles currentItem={expandedItem} allItems={allArticles} />
                </div>
              ) : (
                filteredArticles.length === 0 ? (
                  <div className="p-6 text-center text-stone-500">No unread items. All caught up! 🎉</div>
                ) : (
                  <div className="divide-y divide-stone-800">
                    {categories.length > 1 && (
                      <div className="p-3 flex gap-1.5 flex-wrap border-b border-stone-800">
                        {categories.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`text-xs px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                              activeCategory === cat ? categoryColors[cat] || 'bg-stone-800 text-stone-300' : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            {cat}
                            {cat !== 'All' && unreadByCategory[cat] > 0 && (
                              <span className={`text-xs px-1 ${activeCategory === cat ? 'bg-stone-900/30' : 'bg-stone-700 text-stone-300'}`}>
                                {unreadByCategory[cat]}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {filteredArticles.map((item, idx) => {
                       const merged = mergeItem(item);
                       const isFocused = idx === focusedIndex;
                       return (
                         <div
                           key={item.id}
                           className={isFocused ? 'bg-stone-800 ring-1 ring-inset ring-[hsl(var(--primary))]/30' : ''}
                           onClick={() => setExpandedItem(merged)}
                         >
                           <ArticleCard
                             item={merged}
                             onExpand={() => setExpandedItem(merged)}
                             onMarkAsRead={markAsRead}
                             onSummaryUpdate={handleSummaryUpdate}
                             showBookmark={true}
                           />
                         </div>
                       );
                     })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Latest Articles and Trending side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 auto-rows-max lg:auto-rows-fr">
        {/* Latest Articles */}
        <div className="flex flex-col">
          <div className="bg-stone-900 border border-stone-800 flex flex-col h-full">
            <div className="flex flex-row items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-stone-100">Latest Articles</span>
                {unreadCount > 0 && (
                  <span className="bg-[hsl(var(--primary))] text-stone-900 text-xs font-bold px-2 py-0.5">{unreadCount} unread</span>
                )}
              </div>
              <button onClick={() => setExpandedArticles(true)} className="text-sm text-stone-500 hover:text-[hsl(var(--primary))] flex items-center gap-1 cursor-pointer transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {categories.length > 1 && (
              <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`text-xs px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                      activeCategory === cat ? categoryColors[cat] || 'bg-stone-800 text-stone-300' : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {cat}
                    {cat !== 'All' && unreadByCategory[cat] > 0 && (
                      <span className={`text-xs px-1 ${activeCategory === cat ? 'bg-stone-900/30' : 'bg-stone-700 text-stone-300'}`}>
                        {unreadByCategory[cat]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="p-0 flex-1">
              {filteredArticles.length === 0 ? (
                <div className="p-6 text-center text-stone-500">
                  {allArticles.length === 0 ? 'No items yet. Add feeds to start aggregating content.' : 'All caught up! 🎉'}
                </div>
              ) : (
                <div className="divide-y divide-stone-800">
                  {filteredArticles.slice(0, 5).map((item) => {
                    const merged = mergeItem(item);
                    return (
                      <ArticleCard
                        key={item.id}
                        item={merged}
                        onExpand={() => setExpandedItem(merged)}
                        onMarkAsRead={markAsRead}
                        onSummaryUpdate={handleSummaryUpdate}
                        showBookmark={true}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trending Now */}
        {allArticles.length >= 3 && widget('trendingArticles') && (
          <div>
            <TrendingArticles articles={allArticles} />
          </div>
        )}
      </div>

      {/* Stacked widgets below */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {widget('digestActions') && <DigestQuickActions digests={digests} />}
          {widget('feedHealth') && <FeedHealthWidget feeds={feeds} />}
          {widget('deliveryHistory') && <DigestDeliveryHistory digests={digests} />}
        </div>
      </div>

      {/* Quick Links */}
      {widget('quickLinks') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {[
            { href: 'Feeds', icon: Rss, label: 'Manage Feeds' },
            { href: 'Digests', icon: FileText, label: 'Manage Digests' },
            { href: 'Inbox', icon: Bell, label: 'View Inbox' },
            { href: 'Integrations', icon: TrendingUp, label: 'Connect Apps' },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} to={createPageUrl(href)}>
              <div className="bg-stone-900 border border-stone-800 hover:border-stone-700 hover:bg-stone-800 transition cursor-pointer p-4 flex items-center gap-3 h-full">
                <div className="p-2 bg-stone-800"><Icon className="w-4 h-4 text-[hsl(var(--primary))]" /></div>
                <span className="text-sm font-medium text-stone-400">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}