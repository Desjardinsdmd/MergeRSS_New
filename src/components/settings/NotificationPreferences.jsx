import React from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function NotificationPreferences({ prefs, onChange }) {
  const get = (key) => prefs?.[key] ?? true;
  const getCategory = (cat) => prefs?.categories?.[cat] ?? true;

  const set = (key, val) => onChange({ ...prefs, [key]: val });

  const setCategory = (cat, val) => onChange({
    ...prefs,
    categories: { ...prefs?.categories, [cat]: val },
  });

  return (
    <Card className="border-slate-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5 text-slate-400" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Global toggles */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900 text-sm">Email Notifications</p>
            <p className="text-xs text-slate-500">Receive important updates via email</p>
          </div>
          <Switch checked={get('emailNotifications')} onCheckedChange={v => set('emailNotifications', v)} />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900 text-sm">Digest Delivery Alerts</p>
            <p className="text-xs text-slate-500">Get notified when digests are delivered</p>
          </div>
          <Switch checked={get('digestReminders')} onCheckedChange={v => set('digestReminders', v)} />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900 text-sm">Feed Error Alerts</p>
            <p className="text-xs text-slate-500">Alert when a feed fails to fetch</p>
          </div>
          <Switch checked={get('feedErrors')} onCheckedChange={v => set('feedErrors', v)} />
        </div>

        <Separator />
        <div>
          <p className="font-medium text-slate-900 text-sm mb-1">Notify by Category</p>
          <p className="text-xs text-slate-500 mb-3">Only show inbox badges for categories you care about.</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-700">{cat}</span>
                <Switch
                  checked={getCategory(cat)}
                  onCheckedChange={v => setCategory(cat, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}