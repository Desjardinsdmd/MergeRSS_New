import React from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

// Keys are read by the backend (generateDigests, fetchFeeds, notifyUser).
// A missing key means ON. Keep these names in sync with the functions.
//   emailNotifications  master switch for operational email
//   digestReminders     digest skipped two scheduled times in a row
//   feedErrors          feed auto-paused after repeated failures
export const NOTIFICATION_PREF_KEYS = ['emailNotifications', 'digestReminders', 'feedErrors'];

function SwitchRow({ label, description, checked, onChange, disabled }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-stone-200 text-sm">{label}</p>
        {description && <p className="text-xs text-stone-500">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          aria-hidden="true"
          className={`meta min-w-[22px] text-right transition-colors ${checked && !disabled ? 'text-emerald-400' : 'text-stone-600'}`}
        >
          {checked && !disabled ? 'On' : 'Off'}
        </span>
        <Switch
          checked={checked && !disabled}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-label={`${label}: ${checked && !disabled ? 'on' : 'off'}`}
          className={checked && !disabled ? 'data-[state=checked]:bg-[hsl(var(--primary))]' : ''}
        />
      </div>
    </div>
  );
}

export default function NotificationPreferences({ prefs, onChange }) {
  const get = (key) => prefs?.[key] ?? true;
  const set = (key, val) => onChange({ ...(prefs || {}), [key]: val });
  const masterOn = get('emailNotifications');

  return (
    <section className="panel p-6" aria-labelledby="notifications-heading">
      <div className="mb-5 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
        <h2 id="notifications-heading" className="font-display text-lg font-semibold text-stone-100">Notifications</h2>
      </div>
      <div className="space-y-4">
        <SwitchRow
          label="Email alerts"
          description="Service emails about problems with your briefings and sources. Briefing emails themselves are set per briefing."
          checked={masterOn}
          onChange={v => set('emailNotifications', v)}
        />
        <Separator className="bg-white/[0.06]" />
        <SwitchRow
          label="Briefing problem alerts"
          description="Email me when a briefing is skipped two scheduled times in a row, with the reason and how to fix it"
          checked={get('digestReminders')}
          disabled={!masterOn}
          onChange={v => set('digestReminders', v)}
        />
        <Separator className="bg-white/[0.06]" />
        <SwitchRow
          label="Source paused alerts"
          description="Email me when one of my sources keeps failing and is paused automatically"
          checked={get('feedErrors')}
          disabled={!masterOn}
          onChange={v => set('feedErrors', v)}
        />
      </div>
    </section>
  );
}
