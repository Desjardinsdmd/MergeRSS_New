import React from 'react';
import { AlertCircle, TrendingDown, CheckCircle2, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SourceHealthBadge({ health, feed, compact = false }) {
  if (!health && !feed?.paused_by_system) return null;

  const baseClasses = 'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors';

  // System-paused overrides health state
  if (feed?.paused_by_system) {
    const Icon = PauseCircle;
    const config = { bg: 'bg-amber-400/10 border border-amber-400/25 text-amber-300', label: 'Paused by system' };
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
      bg: 'bg-emerald-400/10 border border-emerald-400/25 text-emerald-300',
      icon: CheckCircle2,
      label: 'Healthy'
    },
    degrading: {
      bg: 'bg-amber-400/10 border border-amber-400/25 text-amber-300',
      icon: TrendingDown,
      label: 'Degrading'
    },
    failing: {
      bg: 'bg-red-400/10 border border-red-400/25 text-red-300',
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
        <span className="ml-1 text-stone-400">{health.health_score}%</span>
      )}
    </div>
  );
}