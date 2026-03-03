import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Sparkles, Loader2, Search, Rss, RefreshCw, ChevronRight,
  Lightbulb, AlertCircle, TrendingUp, Star, Info, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FeedSuggestionCard from '@/components/feeds/FeedSuggestionCard';
import TrendingTopics from '@/components/feeds/TrendingTopics';
import RecommendedFeeds from '@/components/feeds/RecommendedFeeds';

const EXAMPLE_QUERIES = [
  'Canadian commercial real estate news',
  'AI startup funding and product launches',
  'Crypto market analysis and Bitcoin price',
  'US macroeconomics and Federal Reserve updates',
  'Tech layoffs and Silicon Valley news',
  'Global multifamily housing market trends',
];

function AICuratorOnboarding() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('aiCuratorOnboardingDismissed') === '1';
  });
  if (dismissed) return null;
  return (
    <div className="mb-6 p-4 border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 flex items-start gap-3 relative">
      <Info className="w-4 h-4 text-[hsl(var(--primary))] mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-1">How AI Curator works</p>
        <p className="text-xs text-stone-400 leading-relaxed">
          Type any topic (e.g., "crypto market news" or "Canadian CRE") and the AI will search the web for the best RSS feeds, 
          validate each one is live, and let you add them to your library in one click. No feed URL hunting required.
        </p>
      </div>
      <button
        onClick={() => { setDismissed(true); localStorage.setItem('aiCuratorOnboardingDismissed', '1'); }}
        className="p-1 text-stone-600 hover:text-stone-300 transition flex-shrink-0"
        aria-label="Dismiss tip"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function FeedCurator() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedFeeds, setAddedFeeds] = useState(new Set());
  const [addingFeed, setAddingFeed] = useState(null);
  const [existingCategories, setExistingCategories] = useState([]);

  useEffect(() => {
    loadExistingCategories();
    // Restore saved search state
    const saved = localStorage.getItem('feedCuratorState');
    if (saved) {
      try {
        const { query: savedQuery, suggestions: savedSuggestions, summary: savedSummary } = JSON.parse(saved);
        setQuery(savedQuery || '');
        setSuggestions(savedSuggestions || []);
        setSummary(savedSummary || '');
      } catch (e) {}
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('feedCuratorState', JSON.stringify({
      query,
      suggestions,
      summary
    }));
  }, [query, suggestions, summary]);

  const loadExistingCategories = async () => {
    try {
      const user = await base44.auth.me();
      const feeds = await base44.entities.Feed.filter({ created_by: user?.email });
      const cats = [...new Set(feeds.map(f => f.category).filter(Boolean))];
      setExistingCategories(cats);
    } catch (e) {}
  };

  const handleSearch = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    setLoading(true);
    setError('');
    setSuggestions([]);
    setSummary('');

    try {
      const response = await base44.functions.invoke('suggestFeeds', {
        query: q.trim(),
        existingCategories,
      });

      const data = response.data;
      if (data?.feeds?.length > 0) {
        setSuggestions(data.feeds);
        setSummary(data.summary || '');
      } else {
        setError('No feeds found for this query. Try a different search term.');
      }
    } catch (e) {
      setError('Failed to fetch suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFeed = async (feed) => {
    setAddingFeed(feed.url);
    try {
      await base44.entities.Feed.create({
        name: feed.name,
        url: feed.url,
        category: feed.category || 'Other',
        tags: feed.tags || [],
        status: 'active',
      });
      setAddedFeeds(prev => new Set([...prev, feed.url]));
    } catch (e) {
      console.error('Failed to add feed:', e);
    } finally {
      setAddingFeed(null);
    }
  };

  const handleAddAll = async () => {
    const unadded = suggestions.filter(f => !addedFeeds.has(f.url));
    for (const feed of unadded) {
      await handleAddFeed(feed);
    }
  };

  const [userFeeds, setUserFeeds] = useState(null);

  useEffect(() => {
    const loadUserFeeds = async () => {
      try {
        const user = await base44.auth.me();
        const feeds = await base44.entities.Feed.filter({ created_by: user?.email });
        setUserFeeds(feeds.length);
      } catch (e) {}
    };
    loadUserFeeds();
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[hsl(var(--primary))] rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-stone-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-100 tracking-tight">AI Curator</h1>
            <p className="text-sm text-stone-500">Discover feeds, spot trends, and get personalized recommendations</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="discover" className="mb-6">
        <TabsList className="bg-stone-800 rounded-xl p-1">
          <TabsTrigger value="discover" className="rounded-lg text-sm gap-2"><Search className="w-3.5 h-3.5" />Discover Feeds</TabsTrigger>
          <TabsTrigger value="trending" className="rounded-lg text-sm gap-2"><TrendingUp className="w-3.5 h-3.5" />Trending Topics</TabsTrigger>
          <TabsTrigger value="recommended" className="rounded-lg text-sm gap-2"><Star className="w-3.5 h-3.5" />For You</TabsTrigger>
        </TabsList>

        <TabsContent value="trending" className="mt-6">
          <TrendingTopics />
        </TabsContent>

        <TabsContent value="recommended" className="mt-6">
          <RecommendedFeeds />
        </TabsContent>

        <TabsContent value="discover" className="mt-6">
          <AICuratorOnboarding />
          {/* Search */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 mb-6 shadow-sm">
            <label className="block text-sm font-semibold text-stone-200 mb-2">
              What topics are you interested in?
            </label>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Canadian real estate, AI startup news, crypto market..."
                className="flex-1 h-11 rounded-xl border-stone-700 bg-stone-800 text-stone-100 placeholder-stone-600 focus-visible:ring-[hsl(var(--primary))]"
              />
              <Button
                onClick={() => handleSearch()}
                disabled={!query.trim() || loading}
                className="h-11 px-5 bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-xl font-medium"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Search className="w-4 h-4 mr-1.5" /> Search</>
                )}
              </Button>
            </div>
            <div className="mt-4">
              <p className="text-xs text-stone-500 mb-2 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> Try one of these
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setQuery(q); handleSearch(q); }}
                    className="text-xs px-3 py-1.5 border border-stone-700 rounded-full text-stone-400 hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] hover:bg-stone-800 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            {existingCategories.length > 0 && suggestions.length === 0 && (
              <div className="mt-4 pt-4 border-t border-stone-800">
                <p className="text-xs text-stone-500 mb-2">Or discover more in your existing categories</p>
                <div className="flex flex-wrap gap-2">
                  {existingCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setQuery(`More ${cat} feeds`); handleSearch(`More ${cat} RSS feeds and news sources`); }}
                      className="text-xs px-3 py-1.5 border border-[hsl(var(--primary))]/50 rounded-full text-[hsl(var(--primary))] bg-stone-800 hover:bg-stone-700 transition"
                    >
                      More {cat} feeds
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 bg-stone-800 rounded-2xl flex items-center justify-center mb-4">
                <Loader2 className="w-6 h-6 text-[hsl(var(--primary))] animate-spin" />
              </div>
              <p className="text-stone-200 font-medium">Searching and testing relevant feeds...</p>
              <p className="text-stone-500 text-sm mt-1">AI is scanning the web and validating RSS sources</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-stone-100">{suggestions.length} feeds found</h2>
                  {summary && <p className="text-sm text-stone-500 mt-0.5">{summary}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleSearch()} className="text-xs rounded-lg border-stone-700 text-stone-400 hover:bg-stone-800 gap-1.5">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                  {suggestions.some(f => !addedFeeds.has(f.url)) && (
                    <Button size="sm" onClick={handleAddAll} className="text-xs rounded-lg bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 gap-1.5 font-semibold">
                      <Rss className="w-3 h-3" />
                      Add All ({suggestions.filter(f => !addedFeeds.has(f.url)).length})
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-3">
                {suggestions.map((feed, idx) => (
                  <FeedSuggestionCard
                    key={idx}
                    feed={feed}
                    onAdd={handleAddFeed}
                    added={addedFeeds.has(feed.url)}
                    adding={addingFeed === feed.url}
                  />
                ))}
              </div>
              {addedFeeds.size > 0 && (
                <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                    <Rss className="w-4 h-4" />
                    {addedFeeds.size} feed{addedFeeds.size > 1 ? 's' : ''} added to your library
                  </div>
                  <a href="/Feeds" className="text-xs text-emerald-700 flex items-center gap-1 hover:text-emerald-800 font-medium">
                    View in Feeds <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {!loading && suggestions.length === 0 && !error && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-stone-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[hsl(var(--primary))]" />
              </div>
              <h3 className="font-semibold text-stone-200 mb-1">
                {userFeeds === 0 ? 'Get started with AI Curator' : 'Discover new feeds'}
              </h3>
              <p className="text-stone-500 text-sm max-w-xs mx-auto">
                {userFeeds === 0 
                  ? 'Use AI Curator to find and add RSS feeds based on topics you care about. Try searching for "Canadian real estate" or "AI news" above.'
                  : 'Search for any topic and our AI will find the best RSS sources for you'
                }
              </p>
              {userFeeds === 0 && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <p className="text-xs text-stone-600">Popular starting topics:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLE_QUERIES.slice(0, 3).map((q) => (
                      <button
                        key={q}
                        onClick={() => { setQuery(q); handleSearch(q); }}
                        className="text-xs px-4 py-2 border border-[hsl(var(--primary))]/30 rounded-lg text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 hover:bg-[hsl(var(--primary))]/10 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}