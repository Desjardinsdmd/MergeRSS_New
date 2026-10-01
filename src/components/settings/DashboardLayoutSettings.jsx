import React from 'react';
import { Switch } from '@/components/ui/switch';
import { LayoutDashboard } from 'lucide-react';

const DEFAULT_WIDGETS = [
  { id: 'dailySnapshot', label: 'AI daily snapshot', description: 'AI-generated summary of top stories' },
  { id: 'latestArticles', label: 'Latest stories', description: 'Most recent stories from your sources' },
  { id: 'digestActions', label: 'Briefing quick actions', description: 'Run briefings on demand' },
  { id: 'deliveryHistory', label: 'Recent deliveries', description: 'Latest briefing deliveries' },
  { id: 'feedHealth', label: 'Source health', description: 'Status and last-fetch times' },
  { id: 'trendingArticles', label: 'Trending stories', description: 'Most popular stories across your sources' },
  { id: 'quickLinks', label: 'Quick links', description: 'Shortcut buttons at the bottom' },
];

export default function DashboardLayoutSettings({ layout, onChange }) {
  const getWidget = (id) => layout?.widgets?.[id] ?? true;

  const toggle = (id) => {
    onChange({
      ...layout,
      widgets: {
        ...layout?.widgets,
        [id]: !getWidget(id),
      },
    });
  };

  return (
    <section className="panel p-6" aria-labelledby="today-layout-heading">
      <div className="mb-1 flex items-center gap-2">
        <LayoutDashboard className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
        <h2 id="today-layout-heading" className="font-display text-lg font-semibold text-stone-100">Today layout</h2>
      </div>
      <div className="space-y-1">
        <p className="mb-3 text-sm text-stone-500">Choose which widgets appear on Today.</p>
        {DEFAULT_WIDGETS.map(widget => (
          <div key={widget.id} className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-0">
            <div>
              <p className="text-sm font-medium text-stone-200">{widget.label}</p>
              <p className="text-xs text-stone-500">{widget.description}</p>
            </div>
            <Switch
              aria-label={widget.label}
              checked={getWidget(widget.id)}
              onCheckedChange={() => toggle(widget.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}