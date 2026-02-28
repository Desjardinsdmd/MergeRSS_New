import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Clock, ExternalLink, Filter, CalendarRange, User, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ArticleSummarizeButton from '@/components/feeds/ArticleSummarizeButton';
import RelatedArticles from '@/components/feeds/RelatedArticles';

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

  React.useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['allFeedItems'],
    queryFn: () => base44.entities.FeedItem.list('-published_date', 200),
    enabled: !!user,
  });

  const mergeItem = (item) => ({
    ...item,
    ai_summary: articleSummaries[item.id] ?? item.ai_summary,
  });

  const handleSummaryUpdate = (updated) => {
    setArticleSummaries(prev => ({ ...prev, [updated.id]: updated.ai_summary }));
    if (selectedArticle?.id === updated.id) setSelectedArticle(updated);
  };

  const filtered = useMemo(() => {
    return allItems.filter(item => {
      const kw = keyword.trim().toLowerCase();
      if (kw) {
        const haystack = `${item.title} ${item.description || ''} ${item.content || ''}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      if (author.trim()) {
        if (!(item.author || '').toLowerCase().includes(author.trim().toLowerCase())) return false;
      }
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (dateFrom) {
        if (!item.published_date || new Date(item.published_date) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (!item.published_date || new Date(item.published_date) > toEnd) return false;
      }
      return true;
    });
  }, [allItems, keyword, author, selectedCategory, dateFrom, dateTo]);

  const hasFilters = keyword || author || selectedCategory || dateFrom || dateTo;

  const clearAll = () => {
    setKeyword('');
    setAuthor('');
    setDateFrom('');
    setDateTo('');
    setSelectedCategory('');
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Search Articles</h1>
        <p className="text-slate-600">Find content across all your feeds</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search by keyword, title, or content…"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          {keyword && (
            <button onClick={() => setKeyword('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(v => !v)}
          className={showFilters ? 'border-indigo-400 text-indigo-600' : ''}
        >
          <Filter className="w-4 h-4 mr-1.5" />
          Filters
          {hasFilters && !keyword && <span className="ml-1 w-2 h-2 rounded-full bg-indigo-600 inline-block" />}
        </Button>
        {hasFilters && (
          <Button variant="ghost" onClick={clearAll} className="text-slate-500">
            Clear all
          </Button>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <Card className="border-slate-100 mb-6">
          <CardContent className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Author */}
            <div>
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1 mb-1.5">
                <User className="w-3 h-3" /> Author
              </label>
              <div className="relative">
                <Input
                  placeholder="Filter by author…"
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  className="text-sm"
                />
                {author && (
                  <button onClick={() => setAuthor('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Category</label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1 mb-1.5">
                <CalendarRange className="w-3 h-3" /> From date
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1 mb-1.5">
                <CalendarRange className="w-3 h-3" /> To date
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-slate-500 mb-4">
          {hasFilters
            ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`
            : `${allItems.length} articles total`}
        </p>
      )}

      {/* Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* List */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No articles found</p>
              <p className="text-sm mt-1">Try different keywords or adjust your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => {
                const merged = mergeItem(item);
                const isSelected = selectedArticle?.id === item.id;
                return (
                  <Card
                    key={item.id}
                    className={`border transition cursor-pointer ${isSelected ? 'border-indigo-400 shadow-sm' : 'border-slate-100 hover:shadow-sm'}`}
                    onClick={() => setSelectedArticle(isSelected ? null : merged)}
                  >
                    <CardContent className="p-4">
                      <p className={`font-medium line-clamp-2 mb-1 text-sm ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>
                        {item.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.published_date ? new Date(item.published_date).toLocaleDateString() : 'Unknown'}
                        </span>
                        {item.author && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {item.author}
                          </span>
                        )}
                        {item.category && (
                          <Badge variant="secondary" className="text-xs py-0">{item.category}</Badge>
                        )}
                      </div>
                      {item.ai_summary && (
                        <p className="mt-2 text-xs text-indigo-600 line-clamp-2 bg-indigo-50 rounded px-2 py-1">
                          {item.ai_summary}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Article detail panel */}
        {selectedArticle ? (
          <div className="lg:sticky lg:top-6 self-start">
            <Card className="border-slate-100">
              <CardHeader className="pb-2 border-b border-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold text-slate-900 leading-snug">
                    {selectedArticle.title}
                  </CardTitle>
                  <button onClick={() => setSelectedArticle(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                  <Clock className="w-3 h-3" />
                  {selectedArticle.published_date && new Date(selectedArticle.published_date).toLocaleString()}
                  {selectedArticle.author && (
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{selectedArticle.author}</span>
                  )}
                  {selectedArticle.category && (
                    <Badge variant="secondary" className="text-xs">{selectedArticle.category}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {selectedArticle.description && (
                  <p className="text-sm text-slate-600 leading-relaxed mb-3">{selectedArticle.description}</p>
                )}
                <a
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Read full article
                </a>
                <div className="mt-3">
                  <ArticleSummarizeButton
                    item={mergeItem(selectedArticle)}
                    onSummaryUpdate={handleSummaryUpdate}
                  />
                </div>
                <RelatedArticles currentItem={selectedArticle} allItems={allItems} />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-center py-16 text-slate-400 text-sm">
            Click an article to view details
          </div>
        )}
      </div>
    </div>
  );
}