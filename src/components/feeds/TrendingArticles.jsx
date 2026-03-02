import React, { useMemo } from 'react';
import { TrendingUp, ExternalLink, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
    <div className="bg-stone-900 border border-stone-800">
      <div className="flex flex-row items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-stone-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Trending Now
          </span>
        </div>
      </div>
      <div className="p-0">
        <div className="divide-y divide-stone-800">
          {trending.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 p-4 hover:bg-stone-800/50 transition group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-stone-200 mb-1 line-clamp-1">{item.title}</p>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <Clock className="w-3 h-3" />
                  {item.published_date && new Date(item.published_date).toLocaleDateString()}
                  {item.category && (
                    <Badge className="bg-stone-800 text-stone-400 px-1.5 py-0.5 text-xs">{item.category}</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5 text-stone-600 group-hover:text-amber-400 transition-colors" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}