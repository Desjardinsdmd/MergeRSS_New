import React from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

function SwitchRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-stone-200 text-sm">{label}</p>
        {description && <p className="text-xs text-stone-500">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-semibold w-6 ${checked ? 'text-emerald-400' : 'text-stone-600'}`}>
          {checked ? 'On' : 'Off'}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

export default function NotificationPreferences({ prefs, onChange }) {
  const get = (key) => prefs?.[key] ?? true;
  const getCategory = (cat) => prefs?.categories?.[cat] ?? true;

  const set = (key, val) => onChange({ ...prefs, [key]: val });

  const setCategory = (cat, val) => onChange({
    ...prefs,
    categories: { ...prefs?.categories, [cat]: val },
  });

  return (
    <Card className="border-stone-800 bg-stone-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-stone-200">
          <Bell className="w-5 h-5 text-amber-400" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SwitchRow
          label="Email Notifications"
          description="Receive important updates via email"
          checked={get('emailNotifications')}
          onChange={v => set('emailNotifications', v)}
        />
        <Separator />
        <SwitchRow
          label="Digest Delivery Alerts"
          description="Get notified when digests are delivered"
          checked={get('digestReminders')}
          onChange={v => set('digestReminders', v)}
        />
        <Separator />
        <SwitchRow
          label="Feed Error Alerts"
          description="Alert when a feed fails to fetch"
          checked={get('feedErrors')}
          onChange={v => set('feedErrors', v)}
        />

        <Separator />
        <div>
          <p className="font-medium text-stone-200 text-sm mb-1">Notify by Category</p>
          <p className="text-xs text-stone-500 mb-3">Only show inbox badges for categories you care about.</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between py-1.5 px-3 bg-stone-800 rounded-lg">
                <span className="text-sm text-stone-300">{cat}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold w-6 ${getCategory(cat) ? 'text-emerald-400' : 'text-stone-600'}`}>
                    {getCategory(cat) ? 'On' : 'Off'}
                  </span>
                  <Switch
                    checked={getCategory(cat)}
                    onCheckedChange={v => setCategory(cat, v)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}