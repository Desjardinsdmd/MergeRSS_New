import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Sparkles, Loader2, Search, Rss, RefreshCw, ChevronRight,
  Lightbulb, AlertCircle, TrendingUp, Star
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

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Curator</h1>
            <p className="text-sm text-slate-500">Discover feeds, spot trends, and get personalized recommendations</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="discover" className="mb-6">
        <TabsList className="bg-slate-100 rounded-xl p-1">
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
          {/* Search */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          What topics are you interested in?
        </label>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. Canadian real estate, AI startup news, crypto market..."
            className="flex-1 h-11 rounded-xl border-slate-200 focus-visible:ring-indigo-500"
          />
          <Button
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-medium"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Search className="w-4 h-4 mr-1.5" /> Search</>
            )}
          </Button>
        </div>

        {/* Example queries */}
        <div className="mt-4">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" /> Try one of these
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                  handleSearch(q);
                }}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-full text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Existing category suggestion */}
        {existingCategories.length > 0 && suggestions.length === 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-2">Or discover more in your existing categories</p>
            <div className="flex flex-wrap gap-2">
              {existingCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setQuery(`More ${cat} feeds`);
                    handleSearch(`More ${cat} RSS feeds and news sources`);
                  }}
                  className="text-xs px-3 py-1.5 border border-indigo-200 rounded-full text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition"
                >
                  More {cat} feeds
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
          <p className="text-slate-700 font-medium">Searching and testing relevant feeds...</p>
          <p className="text-slate-400 text-sm mt-1">AI is scanning the web and validating RSS sources</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && suggestions.length > 0 && (
        <div>
          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                {suggestions.length} feeds found
              </h2>
              {summary && (
                <p className="text-sm text-slate-500 mt-0.5">{summary}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSearch()}
                className="text-xs rounded-lg border-slate-200 gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
              {suggestions.some(f => !addedFeeds.has(f.url)) && (
                <Button
                  size="sm"
                  onClick={handleAddAll}
                  className="text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                >
                  <Rss className="w-3 h-3" />
                  Add All ({suggestions.filter(f => !addedFeeds.has(f.url)).length})
                </Button>
              )}
            </div>
          </div>

          {/* Feed cards */}
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

          {/* Added count summary */}
          {addedFeeds.size > 0 && (
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <Rss className="w-4 h-4" />
                {addedFeeds.size} feed{addedFeeds.size > 1 ? 's' : ''} added to your library
              </div>
              <a
                href="/Feeds"
                className="text-xs text-emerald-700 flex items-center gap-1 hover:text-emerald-800 font-medium"
              >
                View in Feeds <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && suggestions.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">Discover new feeds</h3>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Search for any topic and our AI will find the best RSS sources for you
          </p>
        </div>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}