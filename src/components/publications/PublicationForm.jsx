import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const LABEL = 'mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500';

const SCHEDULE_SLOTS = [
  { label: '6:00 AM ET', cron: '0 10 * * *' },
  { label: '7:00 AM ET', cron: '0 11 * * *' },
  { label: '8:00 AM ET', cron: '0 12 * * *' },
  { label: '9:00 AM ET', cron: '0 13 * * *' },
  { label: '10:00 AM ET', cron: '0 14 * * *' },
  { label: '11:00 AM ET', cron: '0 15 * * *' },
  { label: '12:00 PM ET', cron: '0 16 * * *' },
  { label: '1:00 PM ET', cron: '0 17 * * *' },
  { label: '2:00 PM ET', cron: '0 18 * * *' },
  { label: '3:00 PM ET', cron: '0 19 * * *' },
  { label: '4:00 PM ET', cron: '0 20 * * *' },
  { label: '5:00 PM ET', cron: '0 21 * * *' },
  { label: '6:00 PM ET', cron: '0 22 * * *' },
  { label: '7:00 PM ET', cron: '0 23 * * *' },
  { label: '8:00 PM ET', cron: '0 0 * * *' },
];

function parseCronList(cronStr) {
  if (!cronStr) return ['0 11 * * *'];
  return cronStr.split(',').map(s => s.trim()).filter(Boolean);
}

function computeNextRun(crons) {
  const now = new Date();
  const candidates = crons.map(cron => {
    const parts = cron.split(' ');
    const minute = parseInt(parts[0]);
    const hour = parseInt(parts[1]);
    const next = new Date(now);
    next.setUTCHours(hour, minute, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  });
  candidates.sort((a, b) => a - b);
  return candidates[0].toISOString();
}

const DEFAULT_VOICE = `Write in a professional, concise voice. Be direct and signal-forward. 
Lead with the insight, not the headline. 
Avoid filler words and empty superlatives.
Include source attribution when relevant.`;

export default function PublicationForm({ publication, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    channel_type: 'x',
    lens_id: '',
    voice_prompt: DEFAULT_VOICE,
    post_format_config: { max_chars: 280, supports_threads: true, hashtag_policy: 'minimal', link_placement: 'end' },
    schedule_crons: ['0 11 * * *'],
    timezone: 'America/Toronto',
    auto_post: false,
    status: 'draft_only',
    candidates_per_run: 3,
    preferred_variant: 'wire',
    credentials_ref: '',
  });
  const [creds, setCreds] = useState({ api_key: '', api_secret: '', access_token: '', access_token_secret: '' });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: lenses = [] } = useQuery({
    queryKey: ['user-lenses-for-pub'],
    queryFn: () => base44.entities.CustomLens.filter({}, '-created_date', 50),
  });
  const lensList = Array.isArray(lenses) ? lenses : (lenses?.items || lenses?.data || []);

  useEffect(() => {
    if (publication) {
      setForm({
        name: publication.name || '',
        channel_type: publication.channel_type || 'x',
        lens_id: publication.lens_id || '',
        voice_prompt: publication.voice_prompt || DEFAULT_VOICE,
        post_format_config: publication.post_format_config || { max_chars: 280, supports_threads: true, hashtag_policy: 'minimal', link_placement: 'end' },
        schedule_crons: parseCronList(publication.schedule_cron),
        timezone: publication.timezone || 'America/Toronto',
        auto_post: publication.auto_post || false,
        status: publication.status || 'draft_only',
        candidates_per_run: publication.candidates_per_run || 3,
        preferred_variant: publication.preferred_variant || 'wire',
        credentials_ref: publication.credentials_ref || '',
      });
    }
  }, [publication]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.lens_id) {
      toast.error('Name and lens are required');
      return;
    }
    if (!form.schedule_crons.length) {
      toast.error('Select at least one schedule time');
      return;
    }
    setSaving(true);
    const { schedule_crons, ...rest } = form;
    const data = { ...rest, schedule_cron: schedule_crons.join(','), credentials_ref: '' };
    // Compute next_run_at from earliest upcoming slot
    data.next_run_at = computeNextRun(schedule_crons);
    if (publication?.id) {
      await base44.entities.Publication.update(publication.id, data);
    } else {
      await base44.entities.Publication.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="panel space-y-6 p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className={LABEL}>Publication Name *</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. CRE Daily Signal" className="rounded-xl border-white/10 bg-stone-800 text-stone-100" />
        </div>
        <div>
          <Label className={LABEL}>Channel</Label>
          <Select value={form.channel_type} onValueChange={v => setForm({ ...form, channel_type: v })}>
            <SelectTrigger className="rounded-xl border-white/10 bg-stone-800 text-stone-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="x">X (Twitter)</SelectItem>
              <SelectItem value="manual" disabled>Manual (coming soon)</SelectItem>
              <SelectItem value="linkedin" disabled>LinkedIn (coming soon)</SelectItem>
              <SelectItem value="newsletter" disabled>Newsletter (coming soon)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className={LABEL}>Scoring Lens *</Label>
        <Select value={form.lens_id} onValueChange={v => setForm({ ...form, lens_id: v })}>
          <SelectTrigger className="rounded-xl border-white/10 bg-stone-800 text-stone-100">
            <SelectValue placeholder="Select a lens..." />
          </SelectTrigger>
          <SelectContent>
            {lensList.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!lensList.length && <p className="text-xs text-stone-500 mt-1">Create a lens first in Settings → Lenses</p>}
      </div>

      <div>
        <Label className={LABEL}>Voice Prompt</Label>
        <Textarea value={form.voice_prompt} onChange={e => setForm({ ...form, voice_prompt: e.target.value })}
          rows={6} className="rounded-xl border-white/10 bg-stone-800 text-stone-100 font-mono text-[13px]" />
        <p className="text-xs text-stone-500 mt-1">Defines the writing style for generated drafts.</p>
      </div>

      <div>
        <Label className={LABEL}>Schedule Times (select multiple)</Label>
        <p className="text-xs text-stone-500 mb-2">At each selected time, suggested posts are drafted into the inbox for review. Approved posts go to X Drafts, where you post them to X manually.</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {SCHEDULE_SLOTS.map(slot => {
            const isChecked = form.schedule_crons.includes(slot.cron);
            return (
              <label key={slot.cron} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors font-mono text-xs ${isChecked ? 'bg-[hsl(var(--brand)/0.14)] border-[hsl(var(--brand)/0.35)] text-[#D9C7FE]' : 'bg-white/[0.03] border-white/10 text-stone-400 hover:border-white/20'}`}>
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...form.schedule_crons, slot.cron]
                      : form.schedule_crons.filter(c => c !== slot.cron);
                    setForm({ ...form, schedule_crons: next });
                  }}
                  className="border-stone-600 data-[state=checked]:border-[hsl(var(--brand))] data-[state=checked]:bg-[hsl(var(--brand))] data-[state=checked]:text-white"
                />
                <span className="mb-0">{slot.label}</span>
              </label>
            );
          })}
        </div>
        {form.schedule_crons.length > 0 && (
          <p className="text-xs text-stone-500 mt-2">
            <span className="font-mono">{form.schedule_crons.length}</span> run{form.schedule_crons.length > 1 ? 's' : ''} per day selected
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className={LABEL}>Status</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger className="rounded-xl border-white/10 bg-stone-800 text-stone-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft_only">Draft Only (safe default)</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className={LABEL}>Candidates Per Run</Label>
          <Input type="number" min={1} max={10} value={form.candidates_per_run}
            onChange={e => setForm({ ...form, candidates_per_run: parseInt(e.target.value) || 3 })}
            className="rounded-xl border-white/10 bg-stone-800 text-stone-100 w-24" />
        </div>
        <div>
          <Label className={LABEL}>Preferred Variant</Label>
          <Select value={form.preferred_variant} onValueChange={v => setForm({ ...form, preferred_variant: v })}>
            <SelectTrigger className="rounded-xl border-white/10 bg-stone-800 text-stone-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wire">Wire (single post, neutral)</SelectItem>
              <SelectItem value="thread">Thread (2-3 posts, explanatory)</SelectItem>
              <SelectItem value="take">Take (single post, opinionated)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-stone-500 mt-1">Preferred draft style for this publication.</p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost py-2" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-brand disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {publication?.id ? 'Update publication' : 'Create publication'}
        </button>
      </div>
    </div>
  );
}