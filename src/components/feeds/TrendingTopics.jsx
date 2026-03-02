import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Loader2, RefreshCw, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const categoryColors = {
  CRE: 'bg-stone-800 text-amber-400',
  Markets: 'bg-stone-800 text-amber-400',
  Tech: 'bg-stone-800 text-amber-400',
  News: 'bg-stone-800 text-amber-400',
  Finance: 'bg-stone-800 text-amber-400',
  Crypto: 'bg-stone-800 text-amber-400',
  AI: 'bg-stone-800 text-amber-400',
  Other: 'bg-stone-800 text-amber-400',
};

export default function TrendingTopics() {
  const [topics, setTopics] = useState([]);
  const [summary, setSummary] = useState('');
  const [articleCount, setArticleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('trendingTopics', {});
      setTopics(res.data.topics || []);
      setSummary(res.data.summary || '');
      setArticleCount(res.data.article_count || 0);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-stone-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="font-semibold text-stone-200 mb-1">Discover trending topics</h3>
        <p className="text-stone-500 text-sm max-w-xs mx-auto mb-6">
          AI will analyze the last 48 hours of your feeds and surface what's trending right now.
        </p>
        <Button onClick={load} className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
          Analyze Trending Topics
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-stone-500">{summary || `Analyzed ${articleCount} articles from the last 48 hours`}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 rounded-lg border-stone-700 text-stone-400 hover:bg-stone-800 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-3" />
          <p className="text-stone-500 text-sm">Analyzing your feeds for trends...</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-12 text-stone-600">No trending topics found. Try again after your feeds have refreshed.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic, idx) => (
            <div key={idx} className="bg-stone-900 border border-stone-800 rounded-xl p-5 hover:border-stone-700 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-stone-200 text-sm leading-snug">{topic.name}</h3>
                <Badge className={`text-xs border-0 flex-shrink-0 ${categoryColors[topic.category] || categoryColors.Other}`}>
                  {topic.category}
                </Badge>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed mb-3">{topic.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(topic.keywords || []).map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-stone-800 border border-stone-700 rounded-full text-stone-400">
                      <Tag className="w-2.5 h-2.5" />{kw}
                    </span>
                  ))}
                </div>
                {topic.article_count > 0 && (
                  <span className="text-xs text-stone-600 flex-shrink-0 ml-2">~{topic.article_count} articles</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}