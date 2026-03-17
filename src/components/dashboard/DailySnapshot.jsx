import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { safeUrl } from '@/components/utils/htmlUtils';

export default function DailySnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  const load = async () => {
    setLoading(true);
    try {
      const cacheKey = 'dailySnapshot_v2_' + new Date().toDateString();
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setSnapshot(parsed.snapshot);
        setLoading(false);
        return;
      }
      const res = await base44.functions.invoke('dailyDigestSnapshot', {});
      const data = res.data;
      localStorage.setItem(cacheKey, JSON.stringify(data));
      setSnapshot(data.snapshot);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    localStorage.removeItem('dailySnapshot_v2_' + new Date().toDateString());
    setActiveCategory('All');
    await load();
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="bg-stone-900 border border-stone-800 p-5 mb-6 text-stone-200 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 text-[hsl(var(--primary))]" />
        <p className="text-sm text-stone-400">Generating today's brief...</p>
      </div>
    );
  }

  if (!snapshot) return null;

  const categoryBriefs = snapshot.category_briefs || {};
  const availableCategories = Object.keys(categoryBriefs);
  const hasCategories = availableCategories.length > 0;

  const currentBrief = activeCategory === 'All'
    ? snapshot.brief
    : categoryBriefs[activeCategory]?.brief;

  const currentCount = activeCategory === 'All'
    ? snapshot.article_count
    : categoryBriefs[activeCategory]?.article_count;

  const currentRelated = activeCategory === 'All'
    ? (snapshot.related_articles || [])
    : (categoryBriefs[activeCategory]?.related_articles || []);

  return (
    <div className="bg-stone-900 border border-stone-800 p-5 mb-6 text-stone-200">
      {/* Category tabs */}
      {hasCategories && !collapsed && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setActiveCategory('All')}
            className={`text-xs px-3 py-1 font-medium transition-all ${
              activeCategory === 'All'
                ? 'bg-[hsl(var(--primary))] text-stone-900'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
                >
                All
                </button>
                {availableCategories.map(cat => (
                <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-3 py-1 font-medium transition-all ${
                activeCategory === cat
                ? 'bg-[hsl(var(--primary))] text-stone-900'
                  : 'bg-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 flex-shrink-0 text-[hsl(var(--primary))]" />
          <span className="text-sm font-semibold tracking-wide uppercase text-stone-300">
            {activeCategory === 'All' ? "Today's Brief" : `${activeCategory} Brief`}
          </span>
          {currentCount > 0 && (
            <span className="text-xs text-stone-600">{currentCount} articles</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="p-1.5 hover:bg-stone-800 transition text-stone-600 hover:text-stone-300">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 hover:bg-stone-800 transition text-stone-600 hover:text-stone-300">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <p className="text-sm leading-relaxed mt-3 text-stone-400">
            {currentBrief || 'No brief available for this category.'}
          </p>
          {currentRelated.length > 0 && (
            <div className="mt-4 pt-3 border-t border-stone-800">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-600 mb-2">Related Articles</p>
              <div className="flex flex-col gap-1.5">
                {currentRelated.map((article, i) => (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-1.5 text-xs text-stone-500 hover:text-stone-200 hover:underline transition-colors group"
                  >
                    <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-1">{article.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}