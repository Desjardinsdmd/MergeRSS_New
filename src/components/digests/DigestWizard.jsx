import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Crown, Globe, ChevronRight, ChevronLeft, Check, FileText, Clock, Send, Rss } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { saveDigestViaApi } from '@/components/feeds/sourceApi';

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STEPS = [
  { id: 'basics', label: 'Basics', icon: FileText },
  { id: 'content', label: 'Content', icon: Rss },
  { id: 'schedule', label: 'Schedule', icon: Clock },
  { id: 'delivery', label: 'Delivery', icon: Send },
];

const DEFAULT_FORM = {
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
  slack_channel_id: '',
  discord_webhook_url: '',
  status: 'active',
  is_public: false,
  public_description: '',
};

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, idx) => {
        const stepIdx = STEPS.findIndex(s => s.id === currentStep);
        const isCompleted = idx < stepIdx;
        const isActive = step.id === currentStep;
        const Icon = step.icon;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center border transition-all",
                isCompleted ? "bg-[hsl(var(--primary))] border-[hsl(var(--primary))]" : isActive ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.14)]" : "border-white/[0.07] bg-white/[0.03]"
              )}>
                {isCompleted
                  ? <Check className="w-4 h-4 text-white" />
                  : <Icon className={cn("w-4 h-4", isActive ? "text-[hsl(var(--primary))]" : "text-stone-600")} />
                }
              </div>
              <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em] hidden sm:block", isActive ? "text-[hsl(var(--primary))]" : isCompleted ? "text-stone-400" : "text-stone-600")}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn("flex-1 h-px mx-2 mt-[-12px]", idx < stepIdx ? "bg-[hsl(var(--primary))]" : "bg-white/[0.07]")} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepBasics({ formData, setFormData }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-stone-100 mb-1">Name your briefing</h2>
        <p className="text-sm text-stone-500">Give it a descriptive name so you can identify it easily.</p>
      </div>
      <div>
        <Label htmlFor="name" className="text-stone-300">Briefing name <span className="text-[hsl(var(--primary))]">*</span></Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Morning Tech Roundup"
          className="mt-1.5"
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="description" className="text-stone-300">Description <span className="text-stone-600 font-normal">(optional)</span></Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="What's this briefing about?"
          rows={3}
          className="mt-1.5"
        />
      </div>
      <div>
        <Label className="micro-label">Output length</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {[
            { value: 'short', label: 'Short', desc: 'Bullet points' },
            { value: 'medium', label: 'Medium', desc: 'Balanced' },
            { value: 'long', label: 'Long', desc: 'Detailed' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormData({ ...formData, output_length: opt.value })}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                formData.output_length === opt.value
                  ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.12)]"
                  : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]"
              )}
            >
              <p className={cn("text-sm font-semibold", formData.output_length === opt.value ? "text-stone-100" : "text-stone-300")}>{opt.label}</p>
              <p className="text-xs text-stone-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepContent({ formData, setFormData, feeds }) {
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
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-stone-100 mb-1">Choose your content</h2>
        <p className="text-sm text-stone-500">Select categories or specific sources to include.</p>
      </div>

      <div>
        <Label className="micro-label mb-2 block">Categories</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              aria-pressed={formData.categories.includes(cat)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-all",
                formData.categories.includes(cat)
                  ? "border-[hsl(var(--brand)/0.35)] bg-[hsl(var(--brand)/0.16)] text-[#C4A5FD]"
                  : "border-white/10 text-stone-400 hover:bg-white/[0.04] hover:text-stone-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        {formData.categories.length === 0 && (
          <p className="text-xs text-stone-500 mt-2">With no category selected, every category is included.</p>
        )}
      </div>

      {feeds.length > 0 && (
        <div>
          <Label className="micro-label mb-2 block">Specific sources <span className="normal-case tracking-normal text-stone-600">(optional)</span></Label>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.06] max-h-48 overflow-y-auto">
            {feeds.map((feed) => (
              <label key={feed.id} className="flex items-center gap-3 px-3 py-2.5 mb-0 hover:bg-white/[0.04] cursor-pointer">
                <Checkbox
                  checked={formData.feed_ids.includes(feed.id)}
                  onCheckedChange={() => toggleFeed(feed.id)}
                />
                <span className="text-sm text-stone-300 flex-1 min-w-0 truncate">{feed.name}</span>
                {feed.category && <span className="chip-brand shrink-0 ml-1">{feed.category}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepSchedule({ formData, setFormData }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-stone-100 mb-1">Set the schedule</h2>
        <p className="text-sm text-stone-500">How often should this briefing be generated?</p>
      </div>

      <div>
        <Label className="micro-label mb-2 block">Frequency</Label>
        <div className="grid grid-cols-3 gap-3">
          {['daily', 'weekly', 'monthly'].map(freq => (
            <button
              key={freq}
              type="button"
              onClick={() => setFormData({ ...formData, frequency: freq })}
              className={cn(
                "p-3 rounded-xl border text-center text-sm capitalize transition-all",
                formData.frequency === freq
                  ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.12)] text-stone-100 font-semibold"
                  : "border-white/[0.07] bg-white/[0.02] text-stone-400 hover:border-white/[0.14]"
              )}
            >
              {freq}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="digest-time" className="micro-label">What time to send</Label>
          <Input
            id="digest-time"
            type="time"
            value={formData.schedule_time}
            onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
            className="mt-1.5 font-mono"
            aria-label="Select time for briefing delivery"
          />
          <p className="text-xs text-stone-500 mt-1.5">The briefing is generated and sent at this time</p>
        </div>
        <div>
          <Label htmlFor="digest-tz" className="micro-label">Your timezone</Label>
          <Select value={formData.timezone} onValueChange={(v) => setFormData({ ...formData, timezone: v })}>
            <SelectTrigger id="digest-tz" className="mt-1.5" aria-label="Select timezone for briefing scheduling">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(TIMEZONES.includes(formData.timezone) || !formData.timezone ? TIMEZONES : [formData.timezone, ...TIMEZONES]).map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-stone-500 mt-1.5">Briefings run at the scheduled time in this timezone</p>
        </div>
      </div>

      {formData.frequency === 'weekly' && (
        <div>
          <Label className="micro-label">Day of week</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {DAYS.map((day, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setFormData({ ...formData, schedule_day_of_week: i })}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm transition-all",
                  formData.schedule_day_of_week === i
                    ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.12)] text-stone-100 font-semibold"
                    : "border-white/[0.07] text-stone-400 hover:border-white/[0.14]"
                )}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {formData.frequency === 'monthly' && (
        <div>
          <Label className="micro-label">Day of month</Label>
          <Select
            value={String(formData.schedule_day_of_month)}
            onValueChange={(v) => setFormData({ ...formData, schedule_day_of_month: Number(v) })}
          >
            <SelectTrigger className="mt-1.5">
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
    </div>
  );
}

function StepDelivery({ formData, setFormData, isPremium, slackIntegration, discordIntegration }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-stone-100 mb-1">Choose delivery channels</h2>
        <p className="text-sm text-stone-500">Where should your briefing be sent?</p>
      </div>

      <div className="space-y-3">
        {[
          { key: 'delivery_web', label: 'Inbox', desc: 'Read briefings in the app', premium: false },
          { key: 'delivery_email', label: 'Email', desc: 'Send to your account email', premium: false },
          { key: 'delivery_slack', label: 'Slack', desc: slackIntegration ? `Connected to ${slackIntegration.workspace_name || 'workspace'}` : 'Connect Slack in Integrations', premium: true },
          { key: 'delivery_discord', label: 'Discord', desc: 'Post to a Discord channel', premium: true },
        ].map(({ key, label, desc, premium }) => {
          const locked = premium && !isPremium;
          const checked = formData[key];
          return (
            <label
              key={key}
              className={cn(
                "flex items-center gap-4 p-4 mb-0 rounded-xl border transition-all",
                locked ? "opacity-50 cursor-not-allowed border-white/[0.07]" :
                checked ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.08)] cursor-pointer" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] cursor-pointer"
              )}
            >
              <Switch
                checked={checked}
                onCheckedChange={(v) => !locked && setFormData({ ...formData, [key]: v })}
                disabled={locked}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-stone-100">{label}</p>
                  {locked && <span className="chip-brand gap-1"><Crown className="w-3 h-3" aria-hidden="true" /> Premium</span>}
                </div>
                <p className="text-xs text-stone-500 mt-0.5">{desc}</p>
              </div>
            </label>
          );
        })}
      </div>

      {formData.delivery_discord && isPremium && !discordIntegration && (
        <div className="mt-2">
          <Label htmlFor="discord-webhook" className="text-stone-300">Discord webhook URL <span className="text-stone-500 font-normal">(required)</span></Label>
          <Input
            id="discord-webhook"
            type="url"
            placeholder="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN"
            value={formData.discord_webhook_url}
            onChange={(e) => setFormData({ ...formData, discord_webhook_url: e.target.value })}
            className="mt-1.5 font-mono text-sm"
            aria-label="Discord webhook URL for posting briefings"
            aria-describedby="discord-hint"
          />
          <p id="discord-hint" className="text-xs text-stone-500 mt-2">
            Create a webhook in your Discord server: Server Settings → Integrations → Webhooks → New Webhook. Copy the full URL here.
          </p>
        </div>
      )}

      <div className="panel-raised p-4 mt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-stone-100">Share to public directory</p>
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
            <div className="mt-3">
              <Label htmlFor="public-desc" className="text-stone-300 text-sm mb-1 block">Directory description <span className="font-mono text-stone-500 font-normal">(50 chars)</span></Label>
              <Input
                id="public-desc"
                value={formData.public_description}
                onChange={(e) => setFormData({ ...formData, public_description: e.target.value.slice(0, 50) })}
                placeholder="e.g., Daily tech news curated for developers"
                className="text-sm"
                maxLength={50}
                aria-label="Short description shown in public directory"
                aria-describedby="desc-hint"
              />
              <p id="desc-hint" className="text-xs text-stone-500 mt-1">
                <span className="font-mono">{formData.public_description.length}/50</span> characters. Shown to other users browsing the directory.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

export default function DigestWizard({ open, onOpenChange, onSuccess }) {
  const [step, setStep] = useState('basics');
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setStep('basics');
      setFormData({ ...DEFAULT_FORM, timezone: user?.timezone || browserTimezone() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // If the user record arrives after the wizard opened, adopt their saved timezone.
  useEffect(() => {
    if (open && user?.timezone && step === 'basics') {
      setFormData(prev => (prev.timezone === browserTimezone() ? { ...prev, timezone: user.timezone } : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.timezone]);

  const { data: feeds = [] } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date', 1000),
    enabled: !!user?.email,
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => base44.entities.Integration.list(),
  });

  const slackIntegration = integrations.find(i => i.type === 'slack' && i.status === 'connected');
  const discordIntegration = integrations.find(i => i.type === 'discord' && i.status === 'connected');
  const isPremium = user?.plan === 'premium';

  const stepIdx = STEPS.findIndex(s => s.id === step);
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  const canNext = () => {
    if (step === 'basics') return formData.name.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (!isLast) setStep(STEPS[stepIdx + 1].id);
  };

  const handleBack = () => {
    if (!isFirst) setStep(STEPS[stepIdx - 1].id);
  };

  const handleSubmit = async () => {
    setLoading(true);
    const data = {
      ...formData,
      delivery_slack: isPremium && formData.delivery_slack,
      delivery_discord: isPremium && formData.delivery_discord,
    };
    if (formData.delivery_discord && discordIntegration && !data.discord_webhook_url) {
      data.discord_webhook_url = discordIntegration.webhook_url;
    }
    const result = await saveDigestViaApi(data);
    if (!result.ok) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    result.warnings.forEach(w => toast.warning(w));
    base44.analytics.track({ eventName: 'digest_created', properties: { frequency: data.frequency } });
    setLoading(false);
    setStep('success');
    setTimeout(() => {
      onSuccess();
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-lg mx-auto p-0 gap-0 bg-stone-950 border-white/[0.08] rounded-2xl overflow-hidden flex flex-col [&_input]:rounded-xl [&_input]:bg-white/[0.04] [&_input]:text-stone-100 [&_input]:border-white/[0.08] [&_input]:placeholder:text-stone-500 [&_textarea]:rounded-xl [&_textarea]:bg-white/[0.04] [&_textarea]:text-stone-100 [&_textarea]:border-white/[0.08] [&_textarea]:placeholder:text-stone-500" style={{maxHeight: '90dvh'}}>
        <div className="flex flex-col overflow-hidden flex-1">
          <div className="px-4 sm:px-6 pt-5 pb-3 flex-shrink-0">
            <StepIndicator currentStep={step} />
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-2 min-h-0">
            {step === 'success' ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="font-display text-lg font-semibold text-stone-100">Briefing created</p>
                <p className="text-sm text-stone-400 text-center">Your briefing is saved and will run on schedule.</p>
              </div>
            ) : (
              <>
                {step === 'basics' && <StepBasics formData={formData} setFormData={setFormData} />}
                {step === 'content' && <StepContent formData={formData} setFormData={setFormData} feeds={feeds} />}
                {step === 'schedule' && <StepSchedule formData={formData} setFormData={setFormData} />}
                {step === 'delivery' && (
                  <StepDelivery
                    formData={formData}
                    setFormData={setFormData}
                    isPremium={isPremium}
                    slackIntegration={slackIntegration}
                    discordIntegration={discordIntegration}
                  />
                )}
              </>
            )}
          </div>

          {step !== 'success' && (
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-white/[0.06] flex-shrink-0 bg-stone-950">
              <Button
                type="button"
                variant="ghost"
                onClick={isFirst ? () => onOpenChange(false) : handleBack}
                className="rounded-xl text-stone-400 hover:text-stone-200"
              >
                {isFirst ? 'Cancel' : <><ChevronLeft className="w-4 h-4 mr-1" /> Back</>}
              </Button>

              {isLast ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn-brand px-6 disabled:opacity-60"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create briefing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canNext()}
                  className="btn-brand px-6 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}