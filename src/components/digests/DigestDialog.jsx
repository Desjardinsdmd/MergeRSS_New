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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Crown, Globe } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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

export default function DigestDialog({ open, onOpenChange, onSuccess, editDigest = null }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
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
    status: 'active',
    is_public: false,
    public_description: '',
  });

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  useEffect(() => {
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
        timezone: 'America/New_York',
        output_length: 'medium',
        delivery_web: true,
        delivery_email: false,
        delivery_slack: false,
        delivery_discord: false,
        status: 'active',
        is_public: false,
        public_description: '',
      });
    }
  }, [editDigest, open]);

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.list(),
  });

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
    };

    if (editDigest) {
      await base44.entities.Digest.update(editDigest.id, data);
    } else {
      await base44.entities.Digest.create(data);
    }

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
          <DialogTitle>{editDigest ? 'Edit Digest' : 'Create Digest'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Digest Name</Label>
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
                placeholder="Brief description of this digest"
                rows={2}
              />
            </div>
          </div>

          {/* Content Selection */}
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Categories to Include</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <Badge
                    key={cat}
                    variant={formData.categories.includes(cat) ? 'default' : 'outline'}
                    className={cn(
                      "cursor-pointer transition",
                      formData.categories.includes(cat) 
                        ? "bg-[#171a20] hover:bg-black" 
                        : "hover:bg-slate-100"
                    )}
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Specific Feeds (optional)</Label>
              <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                {feeds.map((feed) => (
                  <label
                    key={feed.id}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={formData.feed_ids.includes(feed.id)}
                      onCheckedChange={() => toggleFeed(feed.id)}
                    />
                    <span className="text-sm">{feed.name}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {feed.category}
                    </Badge>
                  </label>
                ))}
                {feeds.length === 0 && (
                  <p className="text-sm text-slate-500 p-2">No feeds available</p>
                )}
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Frequency</Label>
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
              <Label>Time</Label>
              <Input
                type="time"
                value={formData.schedule_time}
                onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
              />
            </div>

            {formData.frequency === 'weekly' && (
              <div className="col-span-2">
                <Label>Day of Week</Label>
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
                <Label>Day of Month</Label>
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
              <Label>Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) => setFormData({ ...formData, timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Output Length</Label>
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
          <div>
            <Label className="mb-3 block">Delivery Channels</Label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <Checkbox
                  checked={formData.delivery_web}
                  onCheckedChange={(checked) => setFormData({ ...formData, delivery_web: checked })}
                />
                <div>
                  <p className="font-medium text-sm">Web Inbox</p>
                  <p className="text-xs text-slate-500">View digests in the app</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <Checkbox
                  checked={formData.delivery_email}
                  onCheckedChange={(checked) => setFormData({ ...formData, delivery_email: checked })}
                />
                <div>
                  <p className="font-medium text-sm">Email</p>
                  <p className="text-xs text-slate-500">Send to your account email address</p>
                </div>
              </label>

              <label className={cn(
                "flex items-center gap-3 p-3 border rounded-lg",
                isPremium ? "hover:bg-slate-50 cursor-pointer" : "opacity-60 cursor-not-allowed"
              )}>
                <Checkbox
                  checked={formData.delivery_slack}
                  onCheckedChange={(checked) => isPremium && setFormData({ ...formData, delivery_slack: checked })}
                  disabled={!isPremium || !slackIntegration}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Slack</p>
                    {!isPremium && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Crown className="w-3 h-3" /> Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {slackIntegration ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </label>

              <label className={cn(
                "flex items-center gap-3 p-3 border rounded-lg",
                isPremium ? "hover:bg-slate-50 cursor-pointer" : "opacity-60 cursor-not-allowed"
              )}>
                <Checkbox
                  checked={formData.delivery_discord}
                  onCheckedChange={(checked) => isPremium && setFormData({ ...formData, delivery_discord: checked })}
                  disabled={!isPremium || !discordIntegration}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Discord</p>
                    {!isPremium && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Crown className="w-3 h-3" /> Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {discordIntegration ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Share to Directory */}
          <div className="border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Share to Public Directory</p>
                  <p className="text-xs text-slate-500">Let others discover and add this digest</p>
                </div>
              </div>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
              />
            </div>
            {formData.is_public && (
              <div>
                <Label className="text-xs">Short description for the directory</Label>
                <Input
                  value={formData.public_description}
                  onChange={(e) => setFormData({ ...formData, public_description: e.target.value })}
                  placeholder="What makes this digest valuable?"
                  className="mt-1 text-sm"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-[#171a20] hover:bg-black rounded-sm">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editDigest ? 'Save Changes' : 'Create Digest'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}