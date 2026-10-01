import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  User, 
  Globe, 
  CreditCard, 
  Loader2,
  Crown,
  ExternalLink,
  PlayCircle,
  Target,
  Plug,
  ChevronRight,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import DashboardLayoutSettings from '@/components/settings/DashboardLayoutSettings';
import NotificationPreferences from '@/components/settings/NotificationPreferences';
import ThemeSettings, { resolveAccent } from '@/components/settings/ThemeSettings';
import { PageHeader } from '@/components/brand/Brand';
import { useWorkspace } from '@/components/feeds/workspaceApi';

// IANA zone names only: briefings (Digest entities) default to User.timezone and the backend passes it
// straight to Intl.DateTimeFormat.
const FALLBACK_TIMEZONES = [
  'America/New_York',
  'America/Toronto',
  'America/Chicago',
  'America/Denver',
  'America/Edmonton',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Halifax',
  'America/St_Johns',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

function getTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const list = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(list) && list.length) return list;
    }
  } catch { /* older browsers */ }
  return FALLBACK_TIMEZONES;
}

function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch { return 'America/New_York'; }
}

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const TIMEZONES = getTimezones();
const INTEREST_PROFILE_MAX = 1500;

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    timezone: 'America/New_York',
  });
  const [notifPrefs, setNotifPrefs] = useState({});
  const [interestProfile, setInterestProfile] = useState('');
  const [interestField, setInterestField] = useState('');
  const [dashboardLayout, setDashboardLayout] = useState({});
  const [accentColor, setAccentColor] = useState('violet');

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
      setFormData({
        full_name: userData.full_name || '',
        email: userData.email || '',
        timezone: isValidTimezone(userData.timezone) ? userData.timezone : browserTimezone(),
      });
      setNotifPrefs(userData.notification_prefs || {});
      setInterestProfile(userData.interest_profile || '');
      setInterestField(userData.interest_field || '');
      setDashboardLayout(userData.dashboard_layout || {});
      setAccentColor(resolveAccent(userData.accent_color).id);
    };
    loadUser();
  }, []);



  const handleSave = async () => {
    setLoading(true);
    try {
      await base44.auth.updateMe({
        full_name: formData.full_name,
        email: formData.email,
        timezone: isValidTimezone(formData.timezone) ? formData.timezone : browserTimezone(),
        notification_prefs: notifPrefs,
        interest_profile: interestProfile.trim().slice(0, INTEREST_PROFILE_MAX),
        interest_field: interestField.trim().slice(0, 80),
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
  const { workspace, isOwner: isWorkspaceOwner } = useWorkspace();
  const isTeamOwner = !!workspace && isWorkspaceOwner && workspace.plan === 'team';
  const [portalBusy, setPortalBusy] = useState(null);

  // Opens the Stripe billing portal. Pass { workspace_id } for the Team plan (owner only, checked server-side).
  const openPortal = async (key, params = {}) => {
    setPortalBusy(key);
    try {
      const { data } = await base44.functions.invoke('createPortalSession', { ...params, return_url: window.location.href });
      if (data?.url) {
        // Same-tab redirect: a window.open after an await gets popup-blocked.
        window.location.href = data.url;
      } else {
        toast.error(data?.error || 'Could not open billing');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Could not open billing');
    } finally {
      setPortalBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <PageHeader title="Settings" subtitle="Manage your account and preferences" />

      <div className="space-y-5">
        {/* Profile */}
        <Section
          icon={User}
          title="Profile"
          id="profile"
          action={!editingProfile && (
            <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}>
              Edit profile
            </Button>
          )}
        >
          {editingProfile ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-name" className="micro-label">Name</label>
                <Input
                  id="settings-name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label htmlFor="settings-email" className="micro-label">Email</label>
                <Input
                  id="settings-email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-name-ro" className="micro-label">Name</label>
                <Input id="settings-name-ro" value={user?.full_name || ''} disabled className="text-stone-400" />
              </div>
              <div>
                <label htmlFor="settings-email-ro" className="micro-label">Email</label>
                <Input id="settings-email-ro" value={user?.email || ''} disabled className="font-mono text-[13px] text-stone-400" />
              </div>
            </div>
          )}
        </Section>

        {/* Preferences */}
        <Section icon={Globe} title="Preferences" id="preferences">
          <div>
            <label htmlFor="settings-tz" className="micro-label">Your timezone</label>
            <Select
              value={formData.timezone}
              onValueChange={(v) => setFormData({ ...formData, timezone: v })}
            >
              <SelectTrigger id="settings-tz" className="w-full sm:w-72" aria-label="Select your timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(TIMEZONES.includes(formData.timezone) ? TIMEZONES : [formData.timezone, ...TIMEZONES]).map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-stone-500">
              Default for briefing delivery times and dates throughout the app. A briefing with its own timezone keeps it.
            </p>
          </div>
        </Section>

        {/* Interest profile: enrichment scores story importance against this */}
        <Section
          icon={Target}
          title="What matters to you"
          id="interests"
          description="New stories from your sources are scored for importance against this description. Leave it blank for general newsworthiness."
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="settings-interest-field" className="micro-label">Your field</label>
              <Input
                id="settings-interest-field"
                value={interestField}
                maxLength={80}
                onChange={(e) => setInterestField(e.target.value)}
                placeholder="e.g. Multifamily development"
              />
            </div>
            <div>
              <label htmlFor="settings-interest-profile" className="micro-label">What you care about</label>
              <Textarea
                id="settings-interest-profile"
                value={interestProfile}
                maxLength={INTEREST_PROFILE_MAX}
                onChange={(e) => setInterestProfile(e.target.value)}
                rows={5}
                placeholder="e.g. I'm a Canadian multifamily developer in Ottawa. I care about CMHC financing, zoning changes, construction costs, rents and cap rates."
              />
              <p className="meta mt-1.5">
                {interestProfile.length}/{INTEREST_PROFILE_MAX} characters · applies to stories fetched after you save
              </p>
            </div>
          </div>
        </Section>

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

        {/* Today layout */}
        <DashboardLayoutSettings layout={dashboardLayout} onChange={setDashboardLayout} />

        {/* Subscription */}
        <Section icon={CreditCard} title="Subscription" id="subscription">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-3">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                isPremium ? 'logo-mark' : 'border border-white/10 bg-white/[0.04]'
              }`}>
                <Crown className={`h-5 w-5 ${isPremium ? 'text-white' : 'text-stone-500'}`} aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-stone-100">
                    {isPremium ? 'Premium' : 'Free'} plan
                  </p>
                  {isPremium && <span className="chip-brand">Active</span>}
                </div>
                <p className="text-sm text-stone-500">
                  {isPremium
                    ? 'Unlimited sources, briefings and integrations'
                    : '50 sources, 5 briefings, web and email delivery'
                  }
                </p>
              </div>
            </div>

            {isPremium ? (
              <Button
                variant="outline"
                onClick={() => openPortal('personal')}
                disabled={portalBusy === 'personal'}
                className="w-full sm:w-auto"
              >
                Manage billing
                {portalBusy === 'personal' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
              </Button>
            ) : (
              <Link to={createPageUrl('Pricing')} className="btn-brand w-full sm:w-auto">
                Upgrade
              </Link>
            )}
          </div>

          {isTeamOwner && (
            <div className="mt-4 flex flex-col gap-4 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-3">
                <div className="logo-mark h-10 w-10 flex-shrink-0 rounded-lg">
                  <Users className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-stone-100">Team plan</p>
                    {workspace.subscription_status === 'past_due' ? (
                      <span className="chip border border-amber-400/25 bg-amber-400/10 text-amber-300">Past due</span>
                    ) : (
                      <span className="chip-brand">Active</span>
                    )}
                  </div>
                  <p className="truncate text-sm text-stone-500">
                    {workspace.name} · you are the owner
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => openPortal('team', { workspace_id: workspace.id })}
                disabled={portalBusy === 'team'}
                className="w-full sm:w-auto"
              >
                Manage team billing
                {portalBusy === 'team' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          )}
        </Section>

        {/* Integrations (moved out of the sidebar) */}
        <Link to={createPageUrl('Integrations')} className="panel panel-hover flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Plug className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            <div>
              <p className="font-medium text-stone-100">Integrations</p>
              <p className="text-sm text-stone-500">Connect Slack, email, webhooks and other destinations</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-stone-500" aria-hidden="true" />
        </Link>

        {/* Help */}
        <Section icon={PlayCircle} title="Help and onboarding" id="help">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-stone-100">Run setup again</p>
              <p className="text-sm text-stone-500">Go back through the welcome setup: interests, sources and your first briefing</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await base44.auth.updateMe({ onboarding_complete: false });
                  navigate(createPageUrl('Welcome'));
                } catch (e) {
                  toast.error(e?.message || 'Could not restart setup');
                }
              }}
            >
              Run setup again
            </Button>
          </div>
        </Section>

        {/* Save */}
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
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Settings section: glass panel with display title, optional description and right-side action. */
function Section({ icon: Icon, title, id, description, action, children }) {
  const headingId = `settings-${id}-heading`;
  return (
    <section className="panel p-6" aria-labelledby={headingId}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            <h2 id={headingId} className="font-display text-lg font-semibold text-stone-100">{title}</h2>
          </div>
          {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
