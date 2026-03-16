import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  User, 
  Globe, 
  CreditCard, 
  Loader2,
  Crown,
  ExternalLink,
  PlayCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import DashboardLayoutSettings from '@/components/settings/DashboardLayoutSettings';
import NotificationPreferences from '@/components/settings/NotificationPreferences';
import ThemeSettings from '@/components/settings/ThemeSettings';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    timezone: 'America/New_York',
  });
  const [notifPrefs, setNotifPrefs] = useState({});
  const [dashboardLayout, setDashboardLayout] = useState({});
  const [accentColor, setAccentColor] = useState('amber');

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
      setFormData({
        full_name: userData.full_name || '',
        email: userData.email || '',
        timezone: userData.timezone || 'America/New_York',
      });
      setNotifPrefs(userData.notification_prefs || {});
      setDashboardLayout(userData.dashboard_layout || {});
      setAccentColor(userData.accent_color || 'amber');
    };
    loadUser();
  }, []);



  const handleSave = async () => {
    setLoading(true);
    try {
      await base44.auth.updateMe({
        full_name: formData.full_name,
        email: formData.email,
        timezone: formData.timezone,
        notification_prefs: notifPrefs,
        dashboard_layout: dashboardLayout,
        accent_color: accentColor,
      });
      setUser({ ...user, full_name: formData.full_name, email: formData.email });
      setEditingProfile(false);
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const isPremium = user?.plan === 'premium';

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-100">Settings</h1>
        <p className="text-stone-500">
          Manage your account and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg text-stone-100">
              <User className="w-5 h-5 text-[hsl(var(--primary))]" />
              Profile
            </CardTitle>
            {!editingProfile && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setEditingProfile(true)}
              >
                Edit Profile
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editingProfile ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-stone-400">Name</Label>
                  <Input 
                    value={formData.full_name} 
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Your full name"
                    className="bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-600"
                  />
                  </div>
                  <div>
                  <Label className="text-stone-400">Email</Label>
                  <Input 
                    value={formData.email} 
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                    className="bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-600"
                  />
                  </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                 <div>
                   <Label className="text-stone-400">Name</Label>
                   <Input value={user?.full_name || ''} disabled className="bg-stone-800 border-stone-700 text-stone-500" />
                 </div>
                 <div>
                   <Label className="text-stone-400">Email</Label>
                   <Input value={user?.email || ''} disabled className="bg-stone-800 border-stone-700 text-stone-500" />
                 </div>
               </div>
            )}
          </CardContent>
        </Card>

        {/* Preferences Section */}
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-stone-100">
              <Globe className="w-5 h-5 text-[hsl(var(--primary))]" />
              Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
               <Label htmlFor="settings-tz" className="text-stone-400 font-medium">Your timezone</Label>
               <Select
                 value={formData.timezone}
                 onValueChange={(v) => setFormData({ ...formData, timezone: v })}
               >
                 <SelectTrigger id="settings-tz" className="w-full sm:w-72 bg-stone-800 border-stone-700 text-stone-100 mt-1.5" aria-label="Select your timezone">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent className="bg-stone-800 border-stone-700">
                   {TIMEZONES.map((tz) => (
                     <SelectItem key={tz} value={tz} className="text-stone-100">{tz.replace('_', ' ')}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <p className="text-xs text-stone-500 mt-1.5">
                 Affects all digest delivery times and date-based features throughout the app
               </p>
             </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <ThemeSettings
          accentColor={accentColor}
          onAccentChange={setAccentColor}
          onAutoSave={async (value) => {
            try {
              // Determine if it's a theme change or accent color change
              const isThemeChange = ['dark', 'light', 'system', 'hc-dark'].includes(value);
              if (isThemeChange) {
                await base44.auth.updateMe({ theme: value });
              } else {
                await base44.auth.updateMe({ accent_color: value });
              }
            } catch (error) {
              toast.error('Failed to save');
            }
          }}
        />

        {/* Notifications */}
        <NotificationPreferences prefs={notifPrefs} onChange={setNotifPrefs} />

        {/* Dashboard Layout */}
        <DashboardLayoutSettings layout={dashboardLayout} onChange={setDashboardLayout} />

        {/* Subscription Section */}
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-stone-100">
              <CreditCard className="w-5 h-5 text-[hsl(var(--primary))]" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center ${
                  isPremium ? 'bg-amber-400' : 'bg-stone-800'
                }`}>
                  <Crown className={`w-5 h-5 ${isPremium ? 'text-stone-900' : 'text-stone-500'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-stone-100">
                      {isPremium ? 'Premium' : 'Free'} Plan
                    </p>
                    {isPremium && (
                      <Badge className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-stone-500">
                    {isPremium 
                      ? 'Unlimited feeds, digests, and integrations'
                      : '50 feeds, 5 digests, web & email delivery'
                    }
                  </p>
                </div>
              </div>
              
              {isPremium ? (
                <Button 
                  variant="outline"
                  onClick={async () => {
                    const { data } = await base44.functions.invoke('createPortalSession', { return_url: window.location.href });
                    if (data?.url) window.open(data.url, '_blank');
                  }}
                  className="border-stone-700 text-stone-300 hover:bg-stone-800 w-full sm:w-auto"
                >
                  Manage Billing
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Link to={createPageUrl('Pricing')} className="w-full sm:w-auto">
                  <Button className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold rounded-lg w-full sm:w-auto">
                    Upgrade
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-stone-100">
              <PlayCircle className="w-5 h-5 text-[hsl(var(--primary))]" />
              Help & Onboarding
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium text-stone-100">Restart the tour</p>
              <p className="text-sm text-stone-500">Walk through the key features of MergeRSS again</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await base44.auth.updateMe({ onboarding_complete: false });
                toast.success('Tour reset — go to the Dashboard to restart it');
              }}
              className="border-stone-700 text-stone-300 hover:bg-stone-800"
            >
              Restart Tour
            </Button>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          {editingProfile && (
            <Button
              variant="outline"
              onClick={() => setEditingProfile(false)}
              disabled={loading}
              className="border-stone-700 text-stone-300 hover:bg-stone-800"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold rounded-lg"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>


      </div>
    </div>
  );
}