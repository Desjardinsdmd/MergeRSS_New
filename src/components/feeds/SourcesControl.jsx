import React from 'react';
import { Activity, AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SourcesControl({ feeds }) {
  const activeSources = feeds.filter(f => f.status === 'active').length;
  const issueCount = feeds.filter(f => f.status === 'error' || f.consecutive_errors > 0).length;
  
  // Count articles from last 24h
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const articlesLast24h = feeds.reduce((sum, f) => {
    // This would be calculated from FeedItems in practice; for now we show item_count as proxy
    return sum + (f.item_count || 0);
  }, 0);

  const metrics = [
    {
      name: 'Total Sources',
      value: feeds.length,
      icon: Zap,
      color: 'bg-stone-800 text-[hsl(var(--primary))]',
    },
    {
      name: 'Active',
      value: activeSources,
      icon: Activity,
      color: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50',
    },
    {
      name: 'Needs Attention',
      value: issueCount,
      icon: AlertCircle,
      color: issueCount > 0 ? 'bg-red-900/40 text-red-400 border border-red-700/50' : 'bg-stone-800 text-stone-500',
    },
    {
      name: 'Healthy',
      value: feeds.length - issueCount,
      icon: CheckCircle2,
      color: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.name}
            className={cn(
              'rounded-lg px-4 py-3 transition-all',
              metric.color
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold">{metric.value}</p>
            <p className="text-xs opacity-75 mt-1">{metric.name}</p>
          </div>
        );
      })}
    </div>
  );
}