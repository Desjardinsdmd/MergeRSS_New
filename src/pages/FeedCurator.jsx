import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Sparkles, Loader2, Search, Rss, RefreshCw, ChevronRight,
  Lightbulb, AlertCircle, TrendingUp, Star, Info, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FeedSuggestionCard from '@/components/feeds/FeedSuggestionCard';
import TrendingTopics from '@/components/feeds/TrendingTopics';
import RecommendedFeeds from '@/components/feeds/RecommendedFeeds';
import { toast } from 'sonner';
import { addSourceViaApi } from '@/components/feeds/sourceApi';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';

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
    <div className="panel-accent relative mb-6 flex items-start gap-3 p-4">
      <Info className="w-4 h-4 text-[hsl(var(--primary))] mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="mb-1 text-sm font-semibold text-stone-100">How AI Curator works</p>
        <p className="text-xs text-stone-400 leading-relaxed">
          Type any topic (e.g., "crypto market news" or "Canadian CRE") and the AI will search the web for the best RSS feeds, 
          validate each one is live, and let you add them to your sources in one click. No URL hunting required.
        </p>
      </div>
      <button
        onClick={() => { setDismissed(true); localStorage.setItem('aiCuratorOnboardingDismissed', '1'); }}
        className="flex-shrink-0 rounded-lg p-1 text-stone-500 transition hover:text-stone-300"
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
        setError('No sources found for this query. Try a different search term.');
      }
    } catch (e) {
      setError('Failed to fetch suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Adds go through addSource: URL discovery, plan limit, dedupe and the first fetch all apply.
  // (Moderation is only relevant when sharing to the directory, which this flow never does.)
  const addOne = async (feed) => {
    const result = await addSourceViaApi({
      url: feed.url,
      name: feed.name,
      category: feed.category || 'Other',
      tags: feed.tags || [],
    });
    if (result.ok) setAddedFeeds(prev => new Set([...prev, feed.url]));
    return result;
  };

  const handleAddFeed = async (feed) => {
    setAddingFeed(feed.url);
    try {
      const result = await addOne(feed);
      if (!result.ok) toast.error(`${feed.name}: ${result.error}`);
      else toast.success(result.duplicate ? `"${feed.name}" is already in your sources` : `"${feed.name}" added`);
    } finally {
      setAddingFeed(null);
    }
  };

  const handleAddAll = async () => {
    const unadded = suggestions.filter(f => !addedFeeds.has(f.url));
    let added = 0, dupes = 0, failed = 0;
    for (const feed of unadded) {
      setAddingFeed(feed.url);
      const result = await addOne(feed);
      if (!result.ok) {
        failed++;
        if (result.limitReached) {
          toast.error(result.error);
          break;
        }
      } else if (result.duplicate) dupes++;
      else added++;
    }
    setAddingFeed(null);
    const parts = [`${added} added`];
    if (dupes) parts.push(`${dupes} already in your sources`);
    if (failed) parts.push(`${failed} failed`);
    (failed && !added ? toast.error : toast.success)(parts.join(' · '));
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
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" aria-hidden="true" />Sources</span>}
        title="AI Curator"
        subtitle="Discover sources, spot trends, and get personalized recommendations"
      />

      <Tabs defaultValue="discover" className="mb-6">
        <TabsList className="rounded-xl p-1">
          <TabsTrigger value="discover" className="rounded-lg text-sm gap-2"><Search className="w-3.5 h-3.5" />Discover sources</TabsTrigger>
          <TabsTrigger value="trending" className="rounded-lg text-sm gap-2"><TrendingUp className="w-3.5 h-3.5" />Trending topics</TabsTrigger>
          <TabsTrigger value="recommended" className="rounded-lg text-sm gap-2"><Star className="w-3.5 h-3.5" />For you</TabsTrigger>
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
          <div className="panel mb-6 p-6">
            <label htmlFor="curator-query" className="mb-2 block text-sm font-semibold text-stone-100">
              What topics are you interested in?
            </label>
            <div className="flex gap-2">
              <Input
                id="curator-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Canadian real estate, AI startup news, crypto market..."
                className="h-11 flex-1 rounded-xl"
              />
              <Button
                onClick={() => handleSearch()}
                disabled={!query.trim() || loading}
                className="h-11 px-5 btn-brand rounded-xl font-medium"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Search className="w-4 h-4 mr-1.5" /> Search</>
                )}
              </Button>
            </div>
            <div className="mt-4">
              <MicroLabel className="mb-2 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" aria-hidden="true" /> Try one of these
              </MicroLabel>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setQuery(q); handleSearch(q); }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-stone-400 transition hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--primary)/0.08)] hover:text-[#C4A5FD]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            {existingCategories.length > 0 && suggestions.length === 0 && (
              <div className="mt-4 border-t border-white/[0.07] pt-4">
                <MicroLabel className="mb-2">Or discover more in your existing categories</MicroLabel>
                <div className="flex flex-wrap gap-2">
                  {existingCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setQuery(`More ${cat} sources`); handleSearch(`More ${cat} RSS feeds and news sources`); }}
                      className="rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-3 py-1.5 text-xs text-[#C4A5FD] transition hover:bg-[hsl(var(--primary)/0.2)]"
                    >
                      More {cat} sources
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)]">
                <Loader2 className="w-6 h-6 text-[hsl(var(--primary))] animate-spin" />
              </div>
              <p className="font-medium text-stone-100">Searching and testing relevant sources...</p>
              <p className="text-stone-500 text-sm mt-1">AI is scanning the web and validating RSS sources</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-300" role="alert">
              <AlertCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-stone-100"><span className="font-mono">{suggestions.length}</span> sources found</h2>
                  {summary && <p className="mt-0.5 text-sm text-stone-400">{summary}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleSearch()} className="btn-ghost h-auto gap-1.5 text-xs">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                  {suggestions.some(f => !addedFeeds.has(f.url)) && (
                    <Button size="sm" onClick={handleAddAll} className="btn-brand h-auto gap-1.5 text-xs">
                      <Rss className="w-3 h-3" />
                      Add all <span className="font-mono">{suggestions.filter(f => !addedFeeds.has(f.url)).length}</span>
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
                <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                    <Rss className="w-4 h-4" aria-hidden="true" />
                    {addedFeeds.size} source{addedFeeds.size > 1 ? 's' : ''} added
                  </div>
                  <a href="/Feeds" className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200">
                    View in Sources <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {!loading && suggestions.length === 0 && !error && (
            <div className="text-center py-16">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)]">
                <Sparkles className="w-8 h-8 text-[hsl(var(--primary))]" />
              </div>
              <h3 className="mb-1 font-display text-lg font-semibold text-stone-100">
                {userFeeds === 0 ? 'Get started with AI Curator' : 'Discover new sources'}
              </h3>
              <p className="mx-auto max-w-xs text-sm text-stone-400">
                {userFeeds === 0 
                  ? 'Use AI Curator to find and add RSS feeds based on topics you care about. Try searching for "Canadian real estate" or "AI news" above.'
                  : 'Search for any topic and our AI will find the best RSS sources for you'
                }
              </p>
              {userFeeds === 0 && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <MicroLabel>Popular starting topics</MicroLabel>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLE_QUERIES.slice(0, 3).map((q) => (
                      <button
                        key={q}
                        onClick={() => { setQuery(q); handleSearch(q); }}
                        className="btn-soft text-xs"
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