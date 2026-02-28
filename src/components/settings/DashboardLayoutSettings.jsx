import React from 'react';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard } from 'lucide-react';

const DEFAULT_WIDGETS = [
  { id: 'dailySnapshot', label: 'AI Daily Snapshot', description: 'AI-generated summary of top stories' },
  { id: 'latestArticles', label: 'Latest Articles', description: 'Most recent items from your feeds' },
  { id: 'digestActions', label: 'Digest Quick Actions', description: 'Run digests on demand' },
  { id: 'deliveryHistory', label: 'Recent Deliveries', description: 'Latest digest deliveries' },
  { id: 'feedHealth', label: 'Feed Health', description: 'Status and last-fetch times' },
  { id: 'trendingArticles', label: 'Trending Articles', description: 'Most popular content across feeds' },
  { id: 'quickLinks', label: 'Quick Links', description: 'Shortcut buttons at the bottom' },
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
    <Card className="border-slate-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LayoutDashboard className="w-5 h-5 text-slate-400" />
          Dashboard Layout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-slate-500 mb-3">Choose which widgets appear on your dashboard.</p>
        {DEFAULT_WIDGETS.map(widget => (
          <div key={widget.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div>
              <p className="text-sm font-medium text-slate-800">{widget.label}</p>
              <p className="text-xs text-slate-500">{widget.description}</p>
            </div>
            <Switch
              checked={getWidget(widget.id)}
              onCheckedChange={() => toggle(widget.id)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}