import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const WIDGETS = [
  { id: 'dailySnapshot', label: 'Daily snapshot', enabled: true },
  { id: 'trendingArticles', label: 'Trending stories', enabled: true },
  { id: 'digestActions', label: 'Your briefings', enabled: true },
  { id: 'feedHealth', label: 'Source health', enabled: true },
  { id: 'deliveryHistory', label: 'Recent briefings', enabled: true },
  { id: 'quickLinks', label: 'Quick links', enabled: true },
];

export default function WidgetCustomizer({ user, onSave }) {
  const [open, setOpen] = useState(false);
  const [widgets, setWidgets] = useState(() => {
    const saved = user?.dashboard_layout?.widgets || {};
    return WIDGETS.map(w => ({ ...w, enabled: saved[w.id] !== false }));
  });

  const handleToggle = (id) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const handleSave = async () => {
    const widgetMap = {};
    widgets.forEach(w => { widgetMap[w.id] = w.enabled; });
    await base44.auth.updateMe({ 
      dashboard_layout: { widgets: widgetMap }
    });
    setOpen(false);
    if (onSave) onSave();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-stone-500 hover:text-stone-300 transition"
        title="Customize Today"
        aria-label="Customize Today"
      >
        <Settings className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Settings className="w-4 h-4" />
              Customize Today
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {widgets.map(w => (
              <button
                key={w.id}
                onClick={() => handleToggle(w.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition',
                  w.enabled
                    ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'
                    : 'border-white/[0.06] hover:bg-white/[0.03]'
                )}
              >
                <div className={cn(
                  'flex-shrink-0 w-4 h-4 rounded-[5px] border flex items-center justify-center transition',
                  w.enabled 
                    ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                    : 'border-stone-700'
                )}>
                  {w.enabled && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className={w.enabled ? 'text-stone-100' : 'text-stone-500'}>{w.label}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
            <button type="button" className="btn-brand" onClick={handleSave}>Save</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}