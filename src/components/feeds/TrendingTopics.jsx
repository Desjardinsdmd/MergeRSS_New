import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Loader2, RefreshCw, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)]">
          <TrendingUp className="w-8 h-8 text-[hsl(var(--primary))]" />
        </div>
        <h3 className="mb-1 font-display text-lg font-semibold text-stone-100">Discover trending topics</h3>
        <p className="mx-auto mb-6 max-w-xs text-sm text-stone-400">
          AI will analyze the last 48 hours of your sources and surface what's trending right now.
        </p>
        <Button onClick={load} className="btn-brand font-semibold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
          Analyze trending topics
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-stone-400">{summary || `Analyzed ${articleCount} stories from the last 48 hours`}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="btn-ghost gap-1.5 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[hsl(var(--primary))] animate-spin mb-3" />
          <p className="text-sm text-stone-500">Analyzing your sources for trends...</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="py-12 text-center text-stone-500">No trending topics found. Try again after your sources have refreshed.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic, idx) => (
            <div key={idx} className="panel panel-hover p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="font-sans text-[15px] font-semibold leading-snug tracking-normal text-stone-100">{topic.name}</h3>
                {topic.category && (
                  <span className="chip-brand flex-shrink-0">
                    {topic.category}
                  </span>
                )}
              </div>
              <p className="mb-3 text-[13px] leading-relaxed text-stone-400">{topic.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(topic.keywords || []).map((kw, i) => (
                    <span key={i} className="chip-neutral gap-1">
                      <Tag className="w-2.5 h-2.5" />{kw}
                    </span>
                  ))}
                </div>
                {topic.article_count > 0 && (
                  <span className="meta ml-2 flex-shrink-0">~{topic.article_count} stories</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}