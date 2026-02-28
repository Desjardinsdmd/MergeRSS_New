import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function FeedHealthWidget({ feeds }) {
  const errorFeeds = feeds.filter(f => f.status === 'error');
  const activeFeeds = feeds.filter(f => f.status === 'active');

  if (feeds.length === 0) return null;

  return (
    <Card className="border-slate-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          Feed Health
          {errorFeeds.length > 0 && (
            <Badge className="bg-red-100 text-red-700 text-xs">{errorFeeds.length} error{errorFeeds.length > 1 ? 's' : ''}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
          {feeds.slice(0, 8).map(feed => (
            <div key={feed.id} className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {feed.status === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                )}
                <span className="text-sm text-slate-700 truncate">{feed.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {feed.last_fetched && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {getRelativeTime(feed.last_fetched)}
                  </span>
                )}
                {feed.status === 'error' && (
                  <Link to={createPageUrl('Feeds')} className="text-xs text-red-600 hover:underline">Fix</Link>
                )}
              </div>
            </div>
          ))}
        </div>
        {feeds.length > 8 && (
          <div className="px-4 py-2 border-t border-slate-100">
            <Link to={createPageUrl('Feeds')} className="text-xs text-indigo-600 hover:underline">
              View all {feeds.length} feeds →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
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