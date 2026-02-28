import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, RefreshCw, Rss, Plus, Check } from 'lucide-react';
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
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (feed) => {
    setAdding(feed.id);
    try {
      await base44.entities.Feed.create({
        name: feed.name,
        url: feed.url,
        category: feed.category || 'Other',
        tags: feed.tags || [],
        status: 'active',
        sourced_from_directory: true,
        directory_feed_id: feed.id,
      });
      setAdded(prev => new Set([...prev, feed.id]));
    } finally {
      setAdding(null);
    }
  };

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-indigo-400" />
        </div>
        <h3 className="font-semibold text-slate-700 mb-1">Personalized feed recommendations</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto mb-6">
          AI will analyze your current subscriptions and suggest feeds you'd likely enjoy.
        </p>
        <Button onClick={load} className="bg-indigo-600 hover:bg-indigo-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Get Recommendations
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">{summary || 'Personalized based on your current subscriptions'}</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 rounded-lg border-slate-200 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Analyzing your interests...</p>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No recommendations available. Add more feeds to improve suggestions.</div>
      ) : (
        <div className="grid gap-3">
          {recommendations.map((feed) => (
            <div key={feed.id} className="bg-white border border-slate-100 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all flex items-start gap-4">
              <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Rss className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900 text-sm truncate">{feed.name}</h3>
                  {feed.category && (
                    <Badge className={`text-xs border-0 flex-shrink-0 ${categoryColors[feed.category] || categoryColors.Other}`}>
                      {feed.category}
                    </Badge>
                  )}
                </div>
                {feed.reason && (
                  <p className="text-xs text-indigo-600 font-medium mb-1">✦ {feed.reason}</p>
                )}
                {feed.description && (
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{feed.description}</p>
                )}
                {feed.added_count > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{feed.added_count} subscribers</p>
                )}
              </div>
              <Button
                size="sm"
                variant={added.has(feed.id) ? 'outline' : 'default'}
                onClick={() => !added.has(feed.id) && handleAdd(feed)}
                disabled={adding === feed.id || added.has(feed.id)}
                className={`flex-shrink-0 rounded-lg text-xs ${added.has(feed.id) ? 'border-emerald-200 text-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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