import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Crown, Globe, Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { saveDigestViaApi } from '@/components/feeds/sourceApi';
import { workspaceCall } from '@/components/feeds/workspaceApi';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];
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

// `team`: the caller's workspace when they are its owner/editor (enables "Share with team").
// `defaultShared`: start a NEW digest with sharing switched on.
export default function DigestDialog({ open, onOpenChange, onSuccess, editDigest = null, team = null, defaultShared = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shareWithTeam, setShareWithTeam] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    categories: [],
    tags: [],
    feed_ids: [],
    frequency: 'daily',
    schedule_time: '09:00',
    schedule_day_of_week: 1,
    schedule_day_of_month: 1,
    timezone: 'America/New_York',
    output_length: 'medium',
    delivery_web: true,
    delivery_email: false,
    delivery_slack: false,
    delivery_discord: false,
    delivery_teams: false,
    slack_channel_id: '',
    discord_webhook_url: '',
    status: 'active',
    is_public: false,
    public_description: '',
  });

  const defaultTimezone = () => {
    if (user?.timezone) return user.timezone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    } catch {
      return 'America/New_York';
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  useEffect(() => {
    setShareWithTeam(!!team && (editDigest ? editDigest.workspace_id === team.id : defaultShared));
    if (editDigest) {
      setFormData({
        name: editDigest.name || '',
        description: editDigest.description || '',
        categories: editDigest.categories || [],
        tags: editDigest.tags || [],
        feed_ids: editDigest.feed_ids || [],
        frequency: editDigest.frequency || 'daily',
        schedule_time: editDigest.schedule_time || '09:00',
        schedule_day_of_week: editDigest.schedule_day_of_week ?? 1,
        schedule_day_of_month: editDigest.schedule_day_of_month ?? 1,
        timezone: editDigest.timezone || 'America/New_York',
        output_length: editDigest.output_length || 'medium',
        delivery_web: editDigest.delivery_web ?? true,
        delivery_email: editDigest.delivery_email ?? false,
        delivery_slack: editDigest.delivery_slack ?? false,
        delivery_discord: editDigest.delivery_discord ?? false,
        delivery_teams: editDigest.delivery_teams ?? false,
        status: editDigest.status || 'active',
        slack_channel_id: editDigest.slack_channel_id || '',
        discord_webhook_url: editDigest.discord_webhook_url || '',
        is_public: editDigest.is_public ?? false,
        public_description: editDigest.public_description || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        categories: [],
        tags: [],
        feed_ids: [],
        frequency: 'daily',
        schedule_time: '09:00',
        schedule_day_of_week: 1,
        schedule_day_of_month: 1,
        timezone: defaultTimezone(),
        output_length: 'medium',
        delivery_web: true,
        delivery_email: false,
        delivery_slack: false,
        delivery_discord: false,
        delivery_teams: false,
        slack_channel_id: '',
        discord_webhook_url: '',
        status: 'active',
        is_public: false,
        public_description: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDigest, open, user?.timezone]);

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date', 1000),
    enabled: !!user?.email,
  });

  const { data: sharedFeedData } = useQuery({
    queryKey: ['shared-feeds', team?.id],
    queryFn: () => workspaceCall('list_shared_feeds'),
    enabled: !!team && shareWithTeam && open,
  });
  const pickableFeeds = shareWithTeam ? (sharedFeedData?.feeds || []) : feeds;

  const toggleShareWithTeam = (on) => {
    setShareWithTeam(on);
    // Personal and shared briefings draw from different source pools.
    setFormData(f => ({ ...f, feed_ids: [] }));
  };

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => base44.entities.Integration.list(),
  });

  const slackIntegration = integrations.find(i => i.type === 'slack' && i.status === 'connected');
  const discordIntegration = integrations.find(i => i.type === 'discord' && i.status === 'connected');
  const isPremium = user?.plan === 'premium';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const data = {
      ...formData,
      delivery_slack: isPremium && formData.delivery_slack,
      delivery_discord: isPremium && formData.delivery_discord,
      delivery_teams: isPremium && formData.delivery_teams,
    };

    // Auto-populate Discord webhook from integration if enabling Discord delivery
    if (formData.delivery_discord && discordIntegration && !data.discord_webhook_url) {
      data.discord_webhook_url = discordIntegration.webhook_url;
    }

    // Team sharing (server re-checks role and sources). Shared briefings use the team
    // channel, not personal Slack/Discord/Teams, and stay out of the public directory.
    if (team) {
      data.workspace_id = shareWithTeam ? team.id : '';
      if (shareWithTeam) {
        data.is_public = false;
        data.delivery_slack = false;
        data.delivery_discord = false;
        data.delivery_teams = false;
        data.discord_webhook_url = '';
        data.slack_channel_id = '';
      }
    }

    // Check content moderation if making public
    if (data.is_public) {
      try {
        const moderationResult = await base44.functions.invoke('moderateDirectoryContent', {
          name: data.name,
          description: data.description || '',
          tags: data.tags || []
        });
        if (!moderationResult.data.is_safe) {
          alert(`This briefing cannot be published to the directory: ${moderationResult.data.reason}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        alert('Failed to moderate content. Please try again.');
        setLoading(false);
        return;
      }
    }

    const result = await saveDigestViaApi(editDigest ? { id: editDigest.id, ...data } : data);
    if (!result.ok) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    result.warnings.forEach(w => toast.warning(w));
    base44.analytics.track({
      eventName: editDigest ? 'digest_edited' : 'digest_created',
      properties: { frequency: data.frequency, delivery_slack: data.delivery_slack, delivery_discord: data.delivery_discord, delivery_email: data.delivery_email },
    });
    toast.success(editDigest ? 'Briefing updated' : 'Briefing created');

    setLoading(false);
    onSuccess();
    onOpenChange(false);
  };

  const toggleCategory = (cat) => {
    const cats = formData.categories.includes(cat)
      ? formData.categories.filter(c => c !== cat)
      : [...formData.categories, cat];
    setFormData({ ...formData, categories: cats });
  };

  const toggleFeed = (feedId) => {
    const ids = formData.feed_ids.includes(feedId)
      ? formData.feed_ids.filter(id => id !== feedId)
      : [...formData.feed_ids, feedId];
    setFormData({ ...formData, feed_ids: ids });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{editDigest ? (shareWithTeam ? 'Edit shared briefing' : 'Edit briefing') : (shareWithTeam ? 'New shared briefing' : 'New briefing')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Briefing name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Morning Tech Roundup"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="A short description of this briefing"
                rows={2}
              />
            </div>
          </div>

          {team && (
            <div className="panel-raised p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-100">Share with {team.name}</p>
                  <p className="text-xs text-stone-500">Uses shared sources and goes to every team member</p>
                </div>
              </div>
              <Switch
                checked={shareWithTeam}
                onCheckedChange={toggleShareWithTeam}
                aria-label={`Share this briefing with ${team.name}`}
              />
            </div>
          )}

          {/* Content Selection */}
          <div className="space-y-4">
            <div>
              <Label className="micro-label mb-2 block">Categories to include</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    aria-pressed={formData.categories.includes(cat)}
                    className={cn(
                      "rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition",
                      formData.categories.includes(cat)
                        ? "border-[hsl(var(--brand)/0.35)] bg-[hsl(var(--brand)/0.16)] text-[#C4A5FD]"
                        : "border-white/10 text-stone-400 hover:bg-white/[0.04] hover:text-stone-200"
                    )}
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="micro-label mb-2 block">{shareWithTeam ? 'Shared sources (optional)' : 'Specific sources (optional)'}</Label>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-2 space-y-1">
                {pickableFeeds.map((feed) => (
                  <label
                    key={feed.id}
                    className="flex items-center gap-2 p-1.5 mb-0 rounded-lg hover:bg-white/[0.04] cursor-pointer"
                  >
                    <Checkbox
                      checked={formData.feed_ids.includes(feed.id)}
                      onCheckedChange={() => toggleFeed(feed.id)}
                    />
                    <span className="text-sm text-stone-200">{feed.name}</span>
                    {feed.category && <span className="chip-brand ml-auto">{feed.category}</span>}
                  </label>
                ))}
                {pickableFeeds.length === 0 && (
                  <p className="text-sm text-stone-500 p-2">
                    {shareWithTeam ? 'No sources are shared with the team yet. Share one from the Sources page.' : 'No sources available'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="micro-label">Frequency</Label>
              <Select
                value={formData.frequency}
                onValueChange={(v) => setFormData({ ...formData, frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="micro-label">Time</Label>
              <Input
                type="time"
                value={formData.schedule_time}
                onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
              />
            </div>

            {formData.frequency === 'weekly' && (
              <div className="col-span-2">
                <Label className="micro-label">Day of week</Label>
                <Select
                  value={String(formData.schedule_day_of_week)}
                  onValueChange={(v) => setFormData({ ...formData, schedule_day_of_week: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.frequency === 'monthly' && (
              <div className="col-span-2">
                <Label className="micro-label">Day of month</Label>
                <Select
                  value={String(formData.schedule_day_of_month)}
                  onValueChange={(v) => setFormData({ ...formData, schedule_day_of_month: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="micro-label">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) => setFormData({ ...formData, timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(TIMEZONES.includes(formData.timezone) || !formData.timezone ? TIMEZONES : [formData.timezone, ...TIMEZONES]).map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="micro-label">Output length</Label>
              <Select
                value={formData.output_length}
                onValueChange={(v) => setFormData({ ...formData, output_length: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short (bullet points)</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="long">Long (detailed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Delivery Options */}
          {shareWithTeam ? (
            <div className="panel-raised p-3 text-sm text-stone-400">
              <Label className="micro-label mb-1 block">Delivery</Label>
              Every team member gets this briefing in their inbox and by email (unless they turned email off).
              {team?.plan === 'team'
                ? ' It also posts once to the team channel set on the Team page.'
                : ' Upgrade the workspace to Team to also post it to a shared Slack, Discord or Teams channel.'}
            </div>
          ) : (
          <div>
            <Label className="micro-label mb-3 block">Delivery channels</Label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 mb-0 rounded-xl border border-white/[0.07] hover:bg-white/[0.03] cursor-pointer">
                <Checkbox
                  checked={formData.delivery_web}
                  onCheckedChange={(checked) => setFormData({ ...formData, delivery_web: checked })}
                />
                <div>
                  <p className="font-medium text-sm text-stone-100">Inbox</p>
                  <p className="text-xs text-stone-500">Read briefings in the app</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 mb-0 rounded-xl border border-white/[0.07] hover:bg-white/[0.03] cursor-pointer">
                <Checkbox
                  checked={formData.delivery_email}
                  onCheckedChange={(checked) => setFormData({ ...formData, delivery_email: checked })}
                />
                <div>
                  <p className="font-medium text-sm text-stone-100">Email</p>
                  <p className="text-xs text-stone-500">Send to your account email address</p>
                </div>
              </label>

              <label className={cn(
                "flex items-center gap-3 p-3 mb-0 rounded-xl border border-white/[0.07]",
                isPremium ? "hover:bg-white/[0.03] cursor-pointer" : "opacity-60 cursor-not-allowed"
              )}>
                <Checkbox
                  checked={formData.delivery_slack}
                  onCheckedChange={(checked) => isPremium && setFormData({ ...formData, delivery_slack: checked })}
                  disabled={!isPremium || !slackIntegration}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-stone-100">Slack</p>
                    {!isPremium && (
                      <span className="chip-brand gap-1">
                        <Crown className="w-3 h-3" aria-hidden="true" /> Premium
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">
                    {slackIntegration ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </label>

              <label className={cn(
                "flex items-center gap-3 p-3 mb-0 rounded-xl border border-white/[0.07]",
                isPremium ? "hover:bg-white/[0.03] cursor-pointer" : "opacity-60 cursor-not-allowed"
              )}>
                <Checkbox
                  checked={formData.delivery_discord}
                  onCheckedChange={(checked) => isPremium && setFormData({ ...formData, delivery_discord: checked })}
                  disabled={!isPremium}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-stone-100">Discord</p>
                    {!isPremium && (
                      <span className="chip-brand gap-1">
                        <Crown className="w-3 h-3" aria-hidden="true" /> Premium
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">Post to Discord channel</p>
                </div>
              </label>

              <label className={cn(
                "flex items-center gap-3 p-3 mb-0 rounded-xl border border-white/[0.07]",
                isPremium ? "hover:bg-white/[0.03] cursor-pointer" : "opacity-60 cursor-not-allowed"
              )}>
                <Checkbox
                  checked={formData.delivery_teams}
                  onCheckedChange={(checked) => isPremium && setFormData({ ...formData, delivery_teams: checked })}
                  disabled={!isPremium}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-stone-100">Microsoft Teams</p>
                    {!isPremium && (
                      <span className="chip-brand gap-1">
                        <Crown className="w-3 h-3" aria-hidden="true" /> Premium
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">Post to Teams channel via webhook</p>
                </div>
              </label>
              {formData.delivery_discord && isPremium && (
                <div className="ml-8 -mt-1 mb-3 space-y-2">
                  {discordIntegration && (
                    <label className="flex items-center gap-3 p-2.5 mb-0 rounded-xl border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.10)] cursor-pointer">
                      <input
                        type="radio"
                        name="discord_source"
                        checked={formData.discord_webhook_url === discordIntegration.webhook_url}
                        onChange={() => setFormData({ ...formData, discord_webhook_url: discordIntegration.webhook_url })}
                        className="accent-[#9B5CF6]"
                      />
                      <div>
                        <p className="text-xs font-medium text-stone-100">Use connected integration</p>
                        <p className="font-mono text-[11px] text-[#C4A5FD] truncate max-w-xs">{discordIntegration.webhook_url?.slice(0, 50)}…</p>
                      </div>
                    </label>
                  )}
                  <label className="flex items-center gap-3 p-2.5 mb-0 rounded-xl border border-white/[0.07] cursor-pointer">
                    <input
                      type="radio"
                      name="discord_source"
                      checked={!discordIntegration || formData.discord_webhook_url !== discordIntegration?.webhook_url}
                      onChange={() => setFormData({ ...formData, discord_webhook_url: '' })}
                      className="accent-[#9B5CF6]"
                    />
                    <p className="text-xs font-medium text-stone-300">Use a custom webhook URL</p>
                  </label>
                  {(!discordIntegration || formData.discord_webhook_url !== discordIntegration?.webhook_url) && (
                    <Input
                      placeholder="Paste your Discord webhook URL"
                      value={formData.discord_webhook_url}
                      onChange={(e) => setFormData({ ...formData, discord_webhook_url: e.target.value })}
                      className="text-sm font-mono rounded-xl"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Share to Directory */}
          {!shareWithTeam && (
          <div className="panel-raised p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-stone-100">Share to public directory</p>
                  <p className="text-xs text-stone-500">Let others discover and add this briefing</p>
                </div>
              </div>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
                aria-label="Share to public directory"
              />
            </div>
            {formData.is_public && (
              <div>
                <Label className="text-xs">Short description for the directory</Label>
                <Input
                  value={formData.public_description}
                  onChange={(e) => setFormData({ ...formData, public_description: e.target.value })}
                  placeholder="What makes this briefing valuable?"
                  className="mt-1 text-sm rounded-xl"
                />
              </div>
            )}
          </div>
          )}

          <DialogFooter>
            <button type="button" className="btn-ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-brand disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editDigest ? 'Save changes' : 'Create briefing'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}