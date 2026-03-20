import React from 'react';
import { AlertCircle, TrendingDown, CheckCircle2, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SourceHealthBadge({ health, feed, compact = false }) {
  if (!health && !feed?.paused_by_system) return null;

  const baseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors';

  // System-paused overrides health state
  if (feed?.paused_by_system) {
    const Icon = PauseCircle;
    const config = { bg: 'bg-stone-500/15 border border-stone-500/30 text-stone-400', label: 'Paused by system' };
    if (compact) return <div className={cn(baseClasses, config.bg)} title={config.label}><Icon className="w-3 h-3" /></div>;
    return (
      <div className={cn(baseClasses, config.bg)} title={feed.paused_reason || 'Auto-paused due to repeated failures'}>
        <Icon className="w-3.5 h-3.5" />
        <span>{config.label}</span>
      </div>
    );
  }

  if (!health) return null;
  
  const stateConfig = {
    healthy: {
      bg: 'bg-green-500/15 border border-green-500/30 text-green-400',
      icon: CheckCircle2,
      label: 'Healthy'
    },
    degrading: {
      bg: 'bg-amber-500/15 border border-amber-500/30 text-amber-400',
      icon: TrendingDown,
      label: 'Degrading'
    },
    failing: {
      bg: 'bg-red-500/15 border border-red-500/30 text-red-400',
      icon: AlertCircle,
      label: 'Failing'
    }
  };

  const config = stateConfig[health.health_state] || stateConfig.healthy;
  const Icon = config.icon;

  if (compact) {
    return (
      <div className={cn(baseClasses, config.bg)} title={config.label}>
        <Icon className="w-3 h-3" />
      </div>
    );
  }

  return (
    <div className={cn(baseClasses, config.bg)}>
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
      {health.health_score !== undefined && (
        <span className="text-stone-400 ml-1">({health.health_score}%)</span>
      )}
    </div>
  );
}