import React, { useMemo } from 'react';
import { TrendingUp, ExternalLink, Clock, Zap } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { getArticleImage, normalizeImageUrl } from '@/components/utils/imageUtils';
import { calculateReadTime, getFaviconUrl } from '@/components/utils/articleUtils';

/**
 * Trending = articles with the most keyword overlap with other articles
 * (a proxy for "what topics appear most frequently right now")
 */
function extractKeywords(text = '') {
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','has','have','had','that','this',
    'it','its','as','by','from','will','can','than','then','than','not',
    'he','she','they','we','you','i','up','out','about','into',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
}

function scoreTrending(items) {
  // Build a keyword frequency map across all items
  const freq = {};
  items.forEach(item => {
    const words = extractKeywords(`${item.title} ${item.description || ''}`);
    [...new Set(words)].forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  });

  // Score each item: sum of frequencies of its keywords
  return items.map(item => {
    const words = [...new Set(extractKeywords(`${item.title} ${item.description || ''}`))];
    const score = words.reduce((s, w) => s + (freq[w] > 1 ? freq[w] : 0), 0);
    return { ...item, _trendScore: score };
  })
  .sort((a, b) => b._trendScore - a._trendScore || new Date(b.published_date) - new Date(a.published_date));
}

export default function TrendingArticles({ articles }) {
  const trending = useMemo(() => scoreTrending(articles).slice(0, 5), [articles]);

  if (trending.length === 0) return null;

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex flex-row items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <TrendingUp className="w-4 h-4 text-sky-400" aria-hidden="true" />
            Trending now
          </span>
        </div>
      </div>
      <div className="p-0 flex-1">
        <div className="divide-y divide-white/[0.05]">
          {trending.map((item) => {
            const imageUrl = normalizeImageUrl(getArticleImage(item));
            const readTime = calculateReadTime(item.content || item.description);
            const faviconUrl = getFaviconUrl(item.url);
            return (
              <a
                key={item.id}
                href={safeUrl(item.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 p-4 transition-all duration-200 hover:bg-white/[0.03]"
              >
                {imageUrl && (
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.04]">
                    <img
                      src={imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => (e.target.style.display = 'none')}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="mb-1 line-clamp-1 text-sm font-semibold text-stone-100 transition-colors group-hover:text-[#C4A5FD]">{decodeHtml(item.title)}</p>
                  <div className="meta flex flex-wrap items-center gap-2">
                    {faviconUrl && (
                      <img src={faviconUrl} alt="publication" className="w-3 h-3 rounded" onError={(e) => (e.target.style.display = 'none')} />
                    )}
                    <Clock className="w-3 h-3" />
                    {item.published_date && new Date(item.published_date).toLocaleDateString()}
                    {readTime && (
                      <>
                        <Zap className="w-3 h-3" />
                        {readTime}m
                      </>
                    )}
                    {item.category && (
                      <span className="chip-brand normal-case tracking-normal">{item.category}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <ExternalLink className="w-3.5 h-3.5 text-stone-500 transition-colors group-hover:text-[#C4A5FD]" />
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}