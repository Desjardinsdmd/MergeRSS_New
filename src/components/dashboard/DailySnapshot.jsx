import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Clock, Zap } from 'lucide-react';
import { safeUrl, decodeHtml } from '@/components/utils/htmlUtils';
import { getArticleImage, normalizeImageUrl } from '@/components/utils/imageUtils';
import { calculateReadTime, getFaviconUrl } from '@/components/utils/articleUtils';

export default function DailySnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  const load = async (skipCache = false) => {
    setLoading(true);
    try {
      const cacheKey = 'dailySnapshot_v2_' + new Date().toDateString();
      if (!skipCache) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setSnapshot(parsed.snapshot);
          setLoading(false);
          return;
        }
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
    setActiveCategory('All');
    await load(true); // Force fresh call, skip cache
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="panel p-5 mb-6 text-stone-200 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 text-[hsl(var(--primary))]" />
        <p className="text-sm text-stone-400">Generating today's briefing...</p>
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
    <div className="panel p-5 mb-6 text-stone-200">
      {/* Category tabs */}
      {hasCategories && !collapsed && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setActiveCategory('All')}
            className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
              activeCategory === 'All'
                ? 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.16)] text-brand-light'
                : 'border-white/[0.07] text-stone-400 hover:text-stone-200'
                }`}
                >
                All
                </button>
                {availableCategories.map(cat => (
                <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
                activeCategory === cat
                ? 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.16)] text-brand-light'
                  : 'border-white/[0.07] text-stone-400 hover:text-stone-200'
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
          <span className="micro-label text-stone-300">
            {activeCategory === 'All' ? "Today's briefing" : `${activeCategory} briefing`}
          </span>
          {currentCount > 0 && (
            <span className="meta">{currentCount} stories</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="rounded-lg p-1.5 hover:bg-white/[0.05] transition text-stone-500 hover:text-stone-300">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="rounded-lg p-1.5 hover:bg-white/[0.05] transition text-stone-500 hover:text-stone-300">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <p className="text-sm leading-relaxed mt-3 text-stone-300">
            {currentBrief || 'No brief available for this category.'}
          </p>
          {currentRelated.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <p className="micro-label mb-2">Related stories</p>
              <div className="flex flex-col gap-2.5">
                {currentRelated.map((article, i) => {
                  const imageUrl = normalizeImageUrl(getArticleImage(article));
                  const readTime = calculateReadTime(article.content || article.description);
                  const faviconUrl = getFaviconUrl(article.url);
                  return (
                    <a
                      key={i}
                      href={safeUrl(article.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2.5 text-xs text-stone-500 hover:bg-white/[0.04] hover:text-stone-200 transition-all duration-200 group p-2 -mx-2 rounded-xl"
                    >
                      {imageUrl && (
                        <div className="flex-shrink-0 w-12 h-12 bg-stone-800 rounded-lg overflow-hidden border border-white/[0.07]">
                          <img
                            src={imageUrl}
                            alt={article.title}
                            className="w-full h-full object-cover"
                            onError={(e) => (e.target.style.display = 'none')}
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-200 line-clamp-2 group-hover:text-brand-light transition-colors mb-1">
                          {decodeHtml(article.title)}
                        </p>
                        <div className="meta flex items-center gap-1.5 flex-wrap">
                          {faviconUrl && (
                            <img src={faviconUrl} alt="publication" className="w-3 h-3 rounded" onError={(e) => (e.target.style.display = 'none')} />
                          )}
                          <Clock className="w-3 h-3" />
                          {article.published_date && new Date(article.published_date).toLocaleDateString()}
                          {readTime && (
                            <>
                              <Zap className="w-3 h-3" />
                              {readTime}m
                            </>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}