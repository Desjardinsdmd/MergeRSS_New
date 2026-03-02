import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function FeedHealthWidget({ feeds }) {
  const [refreshing, setRefreshing] = useState(false);
  const errorFeeds = feeds.filter(f => f.status === 'error');

  if (feeds.length === 0) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await base44.functions.invoke('fetchFeeds');
      const newItems = (res.data?.results || []).reduce((sum, r) => sum + (r.new_items || 0), 0);
      toast.success(`Feeds refreshed — ${newItems} new items`);
    } catch {
      toast.error('Failed to refresh feeds');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-stone-900 border border-stone-800">
      <div className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <span className="text-sm font-semibold text-stone-200 flex items-center gap-2">
          Feed Health
          {errorFeeds.length > 0 && (
            <span className="bg-red-900/50 text-red-400 text-xs px-1.5 py-0.5">{errorFeeds.length} error{errorFeeds.length > 1 ? 's' : ''}</span>
          )}
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs text-stone-500 hover:text-amber-400 transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="divide-y divide-stone-800 max-h-48 overflow-y-auto">
        {feeds.slice(0, 8).map(feed => (
          <div key={feed.id} className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {feed.status === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )}
              <span className="text-sm text-stone-400 truncate">{feed.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {feed.last_fetched && (
                <span className="text-xs text-stone-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {getRelativeTime(feed.last_fetched)}
                </span>
              )}
              {feed.status === 'error' && (
                <Link to={createPageUrl('Feeds')} className="text-xs text-red-400 hover:underline">Fix</Link>
              )}
            </div>
          </div>
        ))}
      </div>
      {feeds.length > 8 && (
        <div className="px-4 py-2 border-t border-stone-800">
          <Link to={createPageUrl('Feeds')} className="text-xs text-stone-500 hover:text-amber-400 transition-colors">
            View all {feeds.length} feeds →
          </Link>
        </div>
      )}
    </div>
  );
}

function getRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}