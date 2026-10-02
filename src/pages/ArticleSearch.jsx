import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Clock, ExternalLink, Filter, CalendarRange, User, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ArticleSummarizeButton from '@/components/feeds/ArticleSummarizeButton';
import RelatedArticles from '@/components/feeds/RelatedArticles';
import { queryArticles } from '@/api/articles';
import { PageHeader } from '@/components/brand/Brand';
import StoryImage from '@/components/brand/StoryImage';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
import { cn } from '@/lib/utils';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];


export default function ArticleSearch() {
  const [user, setUser] = React.useState(null);
  const [keyword, setKeyword] = useState('');
  const [author, setAuthor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [articleSummaries, setArticleSummaries] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('newest');

  React.useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  // Debounce keyword into searchQuery (300ms) so the server is queried once typing pauses.
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(keyword.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [keyword]);

  const { data: allItems = [], isLoading, isFetching } = useQuery({
    queryKey: ['allFeedItems', searchQuery, author, selectedCategory, dateFrom, dateTo],
    queryFn: async () => {
      // Server-side scoped to the user's own feeds. (The old filter on created_by matched
      // nothing for regular users, because articles are written by the fetch job.)
      // The keyword is matched server-side (title / description / summary / content) across
      // the user's full history, not just the newest 500 items.
      const params = { sort: '-published_date', limit: 500 };
      if (searchQuery) params.q = searchQuery;
      if (selectedCategory) params.category = selectedCategory;
      if (author.trim()) params.author = author.trim();
      if (dateFrom) params.since = new Date(dateFrom).toISOString();
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        params.until = toEnd.toISOString();
      }
      return queryArticles(params);
    },
    enabled: !!user,
    staleTime: 0
  });

  const mergeItem = (item) => ({
    ...item,
    ai_summary: articleSummaries[item.id] ?? item.ai_summary
  });

  const handleSummaryUpdate = (updated) => {
    setArticleSummaries((prev) => ({ ...prev, [updated.id]: updated.ai_summary }));
    if (selectedArticle?.id === updated.id) setSelectedArticle(updated);
  };

  // Keyword filtering happens on the server; here we only sort the returned matches.
  const filtered = useMemo(() => {
    const kw = searchQuery.toLowerCase();
    const list = allItems;
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.published_date || 0) - new Date(a.published_date || 0);
      if (sortBy === 'oldest') return new Date(a.published_date || 0) - new Date(b.published_date || 0);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'relevance' && kw) {
        const scoreOf = item => {
          let s = 0;
          if (item.title?.toLowerCase().includes(kw)) s += 3;
          if (item.description?.toLowerCase().includes(kw)) s += 1;
          return s;
        };
        return scoreOf(b) - scoreOf(a);
      }
      return 0;
    });
  }, [allItems, searchQuery, sortBy]);

  const hasFilters = keyword || author || selectedCategory || dateFrom || dateTo;

  const clearAll = () => {
    setKeyword('');
    setAuthor('');
    setDateFrom('');
    setDateTo('');
    setSelectedCategory('');
  };

  const fmtDate = (d) => {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; }
  };

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Search" subtitle="Find stories across your sources" />

        {/* Search bar */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" aria-hidden="true" />
            <Input
              className="h-11 rounded-xl pl-10 text-stone-100"
              placeholder="Search by keyword, title, or content…"
              aria-label="Search stories"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)} />

            {keyword &&
              <button onClick={() => setKeyword('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                <X className="w-4 h-4" />
              </button>
            }
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={cn('btn-ghost h-11 px-4', showFilters && 'border-[hsl(var(--brand)/0.4)] text-stone-100')}>
            <Filter className="w-4 h-4" aria-hidden="true" />
            Filters
            {hasFilters && !keyword && <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] inline-block" aria-hidden="true" />}
          </button>
          {hasFilters &&
            <Button variant="ghost" onClick={clearAll} className="h-11 rounded-xl text-stone-400 hover:text-stone-100">
              Clear all
            </Button>
          }
        </div>

        {/* Expanded filters */}
        {showFilters &&
          <div className="panel mb-6 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Author */}
            <div>
              <label className="micro-label flex items-center gap-1 mb-1.5">
                <User className="w-3 h-3" /> Author
              </label>
              <div className="relative">
                <Input
                  placeholder="Filter by author…"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="rounded-xl text-sm text-stone-100" />

                {author &&
                  <button onClick={() => setAuthor('')} aria-label="Clear author" className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                }
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="micro-label mb-1.5 block">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full h-10 text-sm border border-white/10 rounded-xl px-3 bg-white/[0.04] text-stone-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]">

                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="micro-label flex items-center gap-1 mb-1.5">
                <CalendarRange className="w-3 h-3" /> From date
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl text-sm text-stone-100" />

            </div>

            {/* Date to */}
            <div>
              <label className="micro-label flex items-center gap-1 mb-1.5">
                <CalendarRange className="w-3 h-3" /> To date
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl text-sm text-stone-100" />

            </div>
          </div>
        }

        {/* Results count + Sort */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="font-mono text-xs text-stone-500">
            {isFetching && !isLoading
              ? <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</span>
              : hasFilters
              ? `${filtered.length} ${filtered.length !== 1 ? 'stories' : 'story'} found`
              : `${allItems.length} stories loaded`}
          </p>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-44 rounded-xl text-sm" aria-label="Sort stories">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
              <SelectItem value="relevance">Most relevant</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        <div className={selectedArticle ? "grid lg:grid-cols-2 gap-6" : "block"}>
          {/* List */}
          <div className={selectedArticle ? 'hidden lg:block' : 'w-full'}>
            {isLoading ?
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
              </div> :
              filtered.length === 0 ?
              <div className="panel text-center py-16 px-4">
                <div className="w-12 h-12 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 text-stone-500" />
                </div>
                <p className="font-display font-semibold text-stone-100">No stories found</p>
                <p className="text-sm text-stone-400 mt-1">Try different keywords or adjust your filters</p>
              </div> :

              <div className="space-y-2">
                {filtered.map((item) => {
                  const merged = mergeItem(item);
                  const isSelected = selectedArticle?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'panel panel-hover cursor-pointer p-4 sm:p-5',
                        isSelected && 'border-[hsl(var(--brand)/0.45)] bg-[hsl(var(--brand)/0.08)]'
                      )}
                      onClick={() => setSelectedArticle(isSelected ? null : merged)}>
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <p className={cn('font-display text-[15px] font-semibold leading-snug line-clamp-2 mb-2', isSelected ? 'text-brand-light' : 'text-stone-100')}>
                            {decodeHtml(item.title)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="meta flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {item.published_date ? fmtDate(item.published_date) : 'Unknown'}
                            </span>
                            {item.author &&
                              <span className="meta flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {item.author}
                              </span>
                            }
                            {item.category &&
                              <span className="chip-brand">{item.category}</span>
                            }
                          </div>
                          {item.ai_summary &&
                            <p className="text-sm leading-relaxed text-stone-400 line-clamp-2">
                              {item.ai_summary}
                            </p>
                          }
                        </div>
                        <StoryImage src={item.image_url} source={hostOf(item.url) || item.author} alt="" size="thumb" />
                      </div>
                    </div>);

                })}
              </div>
            }
          </div>

          {/* Story detail panel */}
          {selectedArticle ?
            <div className="lg:sticky lg:top-6 self-start">
              <button onClick={() => setSelectedArticle(null)} className="lg:hidden flex items-center gap-1 text-sm text-stone-400 hover:text-stone-100 mb-3">
                ← Back to results
              </button>
              <div className="panel">
                <div className="p-5 pb-4 border-b border-white/[0.06]">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-lg font-semibold text-stone-100 leading-snug">
                      {decodeHtml(selectedArticle.title)}
                    </h2>
                    <button onClick={() => setSelectedArticle(null)} aria-label="Close story" className="text-stone-500 hover:text-stone-300 flex-shrink-0 mt-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="meta flex flex-wrap items-center gap-2 mt-2">
                    <Clock className="w-3 h-3" />
                    {selectedArticle.published_date && new Date(selectedArticle.published_date).toLocaleString()}
                    {selectedArticle.author &&
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{selectedArticle.author}</span>
                    }
                    {selectedArticle.category &&
                      <span className="chip-brand normal-case tracking-normal">{selectedArticle.category}</span>
                    }
                  </div>
                </div>
                <div className="p-5">
                  {selectedArticle.image_url &&
                    <StoryImage src={selectedArticle.image_url} source={hostOf(selectedArticle.url)} alt="" size="lead" className="mb-4" />
                  }
                  {selectedArticle.description &&
                    <p className="text-sm text-stone-300 leading-relaxed mb-4">{decodeHtml(selectedArticle.description)}</p>
                  }
                  <a
                    href={safeUrl(selectedArticle.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-soft">

                    <ExternalLink className="w-3.5 h-3.5" />
                    Read full story
                  </a>
                  <div className="mt-4">
                    <ArticleSummarizeButton
                      item={mergeItem(selectedArticle)}
                      onSummaryUpdate={handleSummaryUpdate} />

                  </div>
                  <RelatedArticles currentItem={selectedArticle} allItems={allItems} />
                </div>
              </div>
            </div> : null
          }
        </div>
      </div>
    </div>);

}
