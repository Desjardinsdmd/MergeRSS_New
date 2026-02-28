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
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [password, setPassword] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    timezone: 'America/New_York',
    emailNotifications: true,
    digestReminders: true,
  });

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
      setFormData({
        full_name: userData.full_name || '',
        email: userData.email || '',
        timezone: userData.timezone || 'America/New_York',
        emailNotifications: true,
        digestReminders: true,
      });
    };
    loadUser();
  }, []);

  const handleVerifyPassword = async () => {
    try {
      setLoading(true);
      await base44.auth.verifyPassword(password);
      setShowPasswordVerification(false);
      setPassword('');
      setEditingProfile(true);
      toast.success('Password verified');
    } catch (error) {
      toast.error('Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await base44.auth.updateMe({
        full_name: formData.full_name,
        email: formData.email,
        timezone: formData.timezone,
      });
      setUser({ ...user, full_name: formData.full_name, email: formData.email });
      setEditingProfile(false);
      toast.success('Profile updated');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const isPremium = user?.plan === 'premium';

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600">
          Manage your account and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <Card className="border-slate-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-slate-400" />
              Profile
            </CardTitle>
            {!editingProfile && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowPasswordVerification(true)}
              >
                Edit Profile
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editingProfile ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input 
                    value={formData.full_name} 
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input 
                    value={formData.email} 
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input value={user?.full_name || ''} disabled className="bg-slate-50" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={user?.email || ''} disabled className="bg-slate-50" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preferences Section */}
        <Card className="border-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="w-5 h-5 text-slate-400" />
              Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) => setFormData({ ...formData, timezone: v })}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                Used for scheduling digest deliveries
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Section */}
        <Card className="border-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="w-5 h-5 text-slate-400" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">Email Notifications</p>
                <p className="text-sm text-slate-500">Receive important updates via email</p>
              </div>
              <Switch
                checked={formData.emailNotifications}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, emailNotifications: checked })
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">Digest Reminders</p>
                <p className="text-sm text-slate-500">Get notified when digests are delivered</p>
              </div>
              <Switch
                checked={formData.digestReminders}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, digestReminders: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Subscription Section */}
        <Card className="border-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="w-5 h-5 text-slate-400" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${
                  isPremium ? 'bg-indigo-600' : 'bg-slate-100'
                }`}>
                  <Crown className={`w-5 h-5 ${isPremium ? 'text-white' : 'text-slate-400'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {isPremium ? 'Premium' : 'Free'} Plan
                    </p>
                    {isPremium && (
                      <Badge className="bg-indigo-100 text-indigo-700">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {isPremium 
                      ? 'Unlimited feeds, digests, and integrations'
                      : '5 feeds, 1 digest, web inbox only'
                    }
                  </p>
                </div>
              </div>
              
              {isPremium ? (
                <Button variant="outline">
                  Manage Billing
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Link to={createPageUrl('Pricing')}>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                    Upgrade
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="border-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PlayCircle className="w-5 h-5 text-slate-400" />
              Help & Onboarding
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Restart the tour</p>
              <p className="text-sm text-slate-500">Walk through the key features of MergeRSS again</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await base44.auth.updateMe({ onboarding_complete: false });
                toast.success('Tour reset — go to the Dashboard to restart it');
              }}
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
            >
              Cancel
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={loading || !editingProfile}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>

        {/* Password Verification Dialog */}
        {showPasswordVerification && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-sm mx-4">
              <CardHeader>
                <CardTitle>Verify Your Password</CardTitle>
                <CardDescription>Enter your password to edit your profile</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                    placeholder="Enter your password"
                    autoFocus
                  />
                </div>
              </CardContent>
              <div className="px-6 pb-6 flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowPasswordVerification(false);
                    setPassword('');
                  }}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleVerifyPassword}
                  disabled={loading || !password}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}