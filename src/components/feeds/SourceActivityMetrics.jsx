import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle } from 'lucide-react';

export default function SourceActivityMetrics({ health, feed }) {
  if (!health) return null;

  const { articles_last_24h, articles_last_7d, inactivity_duration_days, last_article_timestamp } = health;

  // Determine activity message
  let activityMessage = '';
  if (inactivity_duration_days > 14) {
    activityMessage = `No updates in ${inactivity_duration_days} days`;
  } else if (articles_last_24h > 0) {
    activityMessage = `+${articles_last_24h} article${articles_last_24h !== 1 ? 's' : ''} today`;
  } else if (articles_last_7d > 0) {
    activityMessage = `+${articles_last_7d} this week`;
  } else {
    activityMessage = 'No recent activity';
  }

  return (
    <div className="flex items-center gap-2 text-xs text-stone-400">
      {inactivity_duration_days > 7 && (
        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
      )}
      <span>{activityMessage}</span>
      {last_article_timestamp && (
        <span className="text-stone-600">
          • {formatDistanceToNow(new Date(last_article_timestamp), { addSuffix: true })}
        </span>
      )}
    </div>
  );
}