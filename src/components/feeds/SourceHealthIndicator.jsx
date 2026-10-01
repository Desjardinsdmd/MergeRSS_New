import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SourceHealthIndicator({ feed }) {
  const getHealthStatus = () => {
    if (feed.status === 'error') {
      return { status: 'issue', label: 'Error', icon: AlertCircle, color: 'text-red-300', bg: 'bg-red-400/10 border-red-400/25' };
    }
    
    if (feed.consecutive_errors > 2) {
      return { status: 'warning', label: 'Failing', icon: AlertTriangle, color: 'text-red-300', bg: 'bg-red-400/10 border-red-400/25' };
    }

    if (feed.validation_confidence && feed.validation_confidence < 70) {
      return { status: 'warning', label: 'Low confidence', icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-400/25' };
    }

    // Check if no updates in a while (assume >7 days is stale)
    if (feed.last_fetched) {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(feed.last_fetched)) / (1000 * 60 * 60 * 24));
      if (daysSinceUpdate > 7) {
        return { status: 'warning', label: 'Stale', icon: Clock, color: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-400/25' };
      }
    }

    return { status: 'healthy', label: 'Healthy', icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-400/25' };
  };

  const getActivityLabel = () => {
    if (!feed.last_fetched) return 'Never fetched';
    
    const hoursSince = Math.floor((Date.now() - new Date(feed.last_fetched)) / (1000 * 60 * 60));
    if (hoursSince < 1) return 'Just now';
    if (hoursSince < 24) return `${hoursSince}h ago`;
    
    const daysSince = Math.floor(hoursSince / 24);
    if (daysSince < 30) return `${daysSince}d ago`;
    
    const monthsSince = Math.floor(daysSince / 30);
    return `${monthsSince}mo ago`;
  };

  const health = getHealthStatus();
  const Icon = health.icon;
  const activity = getActivityLabel();

  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider', health.bg)}>
        <Icon className={cn('w-3.5 h-3.5', health.color)} />
        <span className={health.color}>{health.label}</span>
      </div>
      <span className="font-mono text-[11px] text-stone-500">{activity}</span>
    </div>
  );
}