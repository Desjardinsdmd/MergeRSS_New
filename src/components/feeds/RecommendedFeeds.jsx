import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, RefreshCw, Rss, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { addSourceViaApi } from '@/components/feeds/sourceApi';

export default function RecommendedFeeds() {
  const [recommendations, setRecommendations] = useState([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('recommendFeeds', {});
      setRecommendations(res.data.recommendations || []);
      setSummary(res.data.summary || '');
      setLoaded(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (feed) => {
    setAdding(feed.id);
    try {
      const result = await addSourceViaApi({
        url: feed.url,
        name: feed.name,
        category: feed.category || 'Other',
        tags: feed.tags || [],
        sourced_from_directory: true,
        directory_feed_id: feed.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAdded(prev => new Set([...prev, feed.id]));
      toast.success(result.duplicate ? `"${feed.name}" is already in your sources` : `"${feed.name}" added`);
    } finally {
      setAdding(null);
    }
  };

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)]">
          <Sparkles className="w-8 h-8 text-[hsl(var(--primary))]" />
        </div>
        <h3 className="mb-1 font-display text-lg font-semibold text-stone-100">Personalized source recommendations</h3>
        <p className="mx-auto mb-6 max-w-xs text-sm text-stone-400">
          AI will analyze your current sources and suggest others you'd likely want.
        </p>
        <Button onClick={load} className="btn-brand">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Get recommendations
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-stone-400">{summary || 'Personalized based on your current sources'}</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="btn-ghost gap-1.5 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[hsl(var(--primary))] animate-spin mb-3" />
          <p className="text-stone-500 text-sm">Analyzing your interests...</p>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="py-12 text-center text-stone-500">No recommendations available. Add more sources to improve suggestions.</div>
      ) : (
        <div className="grid gap-3">
          {recommendations.map((feed) => (
            <div key={feed.id} className="panel panel-hover flex items-start gap-4 p-5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.14)]">
                <Rss className="w-4 h-4 text-[hsl(var(--primary))]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="truncate text-[15px] font-semibold text-stone-100">{feed.name}</h3>
                  {feed.category && (
                    <span className="chip-brand flex-shrink-0">
                      {feed.category}
                    </span>
                  )}
                </div>
                {feed.reason && (
                  <p className="mb-1 text-xs font-medium text-[#C4A5FD]">✦ {feed.reason}</p>
                )}
                {feed.description && (
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-stone-400">{feed.description}</p>
                )}
                {feed.added_count > 0 && (
                  <p className="meta mt-1">{feed.added_count} subscribers</p>
                )}
              </div>
              <Button
                size="sm"
                variant={added.has(feed.id) ? 'outline' : 'default'}
                onClick={() => !added.has(feed.id) && handleAdd(feed)}
                disabled={adding === feed.id || added.has(feed.id)}
                className={`flex-shrink-0 rounded-xl text-xs ${added.has(feed.id) ? 'border-emerald-400/30 text-emerald-300' : 'btn-brand'}`}
              >
                {adding === feed.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : added.has(feed.id) ? (
                  <><Check className="w-3 h-3 mr-1" /> Added</>
                ) : (
                  <><Plus className="w-3 h-3 mr-1" /> Add</>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}