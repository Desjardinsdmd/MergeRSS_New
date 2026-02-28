import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Loader2, RefreshCw, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const categoryColors = {
  CRE: 'bg-orange-100 text-orange-700',
  Markets: 'bg-blue-100 text-blue-700',
  Tech: 'bg-purple-100 text-purple-700',
  News: 'bg-slate-100 text-slate-700',
  Finance: 'bg-green-100 text-green-700',
  Crypto: 'bg-yellow-100 text-yellow-700',
  AI: 'bg-indigo-100 text-indigo-700',
  Other: 'bg-gray-100 text-gray-700',
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
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-8 h-8 text-indigo-400" />
        </div>
        <h3 className="font-semibold text-slate-700 mb-1">Discover trending topics</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto mb-6">
          AI will analyze the last 48 hours of your feeds and surface what's trending right now.
        </p>
        <Button onClick={load} className="bg-indigo-600 hover:bg-indigo-700">
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
          <p className="text-sm text-slate-500">{summary || `Analyzed ${articleCount} articles from the last 48 hours`}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 rounded-lg border-slate-200 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Analyzing your feeds for trends...</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No trending topics found. Try again after your feeds have refreshed.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic, idx) => (
            <div key={idx} className="bg-white border border-slate-100 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-slate-900 text-sm leading-snug">{topic.name}</h3>
                <Badge className={`text-xs border-0 flex-shrink-0 ${categoryColors[topic.category] || categoryColors.Other}`}>
                  {topic.category}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">{topic.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(topic.keywords || []).map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-full text-slate-500">
                      <Tag className="w-2.5 h-2.5" />{kw}
                    </span>
                  ))}
                </div>
                {topic.article_count > 0 && (
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-2">~{topic.article_count} articles</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}