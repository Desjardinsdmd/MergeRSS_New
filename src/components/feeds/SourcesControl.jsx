import React from 'react';
import { Activity, AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MicroLabel } from '@/components/brand/Brand';

export default function SourcesControl({ feeds }) {
  const activeSources = feeds.filter(f => f.status === 'active').length;
  const issueCount = feeds.filter(f => f.status === 'error' || f.consecutive_errors > 0).length;

  const metrics = [
    {
      name: 'Total sources',
      value: feeds.length,
      icon: Zap,
      iconColor: 'text-[hsl(var(--primary))]',
    },
    {
      name: 'Active',
      value: activeSources,
      icon: Activity,
      iconColor: 'text-stone-400',
    },
    {
      name: 'Healthy',
      value: feeds.length - issueCount,
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
    },
    {
      name: 'Needs attention',
      value: issueCount,
      icon: AlertCircle,
      iconColor: issueCount > 0 ? 'text-amber-400' : 'text-stone-500',
      valueColor: issueCount > 0 ? 'text-amber-300' : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.name} className="panel px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <MicroLabel>{metric.name}</MicroLabel>
              <Icon className={cn('h-4 w-4', metric.iconColor)} aria-hidden="true" />
            </div>
            <p className={cn('font-display text-2xl font-semibold tabular-nums text-stone-100', metric.valueColor)}>
              {metric.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
