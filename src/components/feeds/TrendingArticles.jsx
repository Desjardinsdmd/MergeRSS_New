import React, { useMemo } from 'react';
import { TrendingUp, ExternalLink, Clock } from 'lucide-react';
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
    <Card className="border-slate-100 mt-6">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <TrendingUp className="w-5 h-5 text-rose-500" />
        <CardTitle className="text-lg font-semibold">Trending Now</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {trending.map((item, idx) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-4 hover:bg-slate-50 transition group"
            >
              <span className="text-2xl font-black text-slate-100 w-6 text-center leading-none flex-shrink-0 mt-0.5 group-hover:text-rose-200 transition-colors">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 line-clamp-1 group-hover:text-indigo-700 transition-colors">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {item.published_date
                    ? new Date(item.published_date).toLocaleDateString()
                    : 'Unknown date'}
                  {item.category && (
                    <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                  )}
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}