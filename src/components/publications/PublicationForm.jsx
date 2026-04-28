import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

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
        credentials_ref: publication.credentials_ref || '',
      });
      if (publication.credentials_ref) {
        try { setCreds(JSON.parse(publication.credentials_ref)); } catch {}
      }
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
    const credStr = creds.api_key ? JSON.stringify(creds) : '';
    const { schedule_crons, ...rest } = form;
    const data = { ...rest, schedule_cron: schedule_crons.join(','), credentials_ref: credStr };
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
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-stone-400">Publication Name *</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. CRE Daily Signal" className="bg-stone-800 border-stone-700 text-stone-100" />
        </div>
        <div>
          <Label className="text-stone-400">Channel</Label>
          <Select value={form.channel_type} onValueChange={v => setForm({ ...form, channel_type: v })}>
            <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-100">
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
        <Label className="text-stone-400">Scoring Lens *</Label>
        <Select value={form.lens_id} onValueChange={v => setForm({ ...form, lens_id: v })}>
          <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-100">
            <SelectValue placeholder="Select a lens..." />
          </SelectTrigger>
          <SelectContent>
            {lensList.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!lensList.length && <p className="text-xs text-stone-600 mt-1">Create a lens first in Settings → Lenses</p>}
      </div>

      <div>
        <Label className="text-stone-400">Voice Prompt</Label>
        <Textarea value={form.voice_prompt} onChange={e => setForm({ ...form, voice_prompt: e.target.value })}
          rows={6} className="bg-stone-800 border-stone-700 text-stone-100 font-mono text-sm" />
        <p className="text-xs text-stone-600 mt-1">Defines the writing style for generated drafts.</p>
      </div>

      <div>
        <Label className="text-stone-400">Schedule Times (select multiple)</Label>
        <p className="text-xs text-stone-600 mb-2">Each selected slot generates a fresh draft run per day.</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {SCHEDULE_SLOTS.map(slot => {
            const isChecked = form.schedule_crons.includes(slot.cron);
            return (
              <label key={slot.cron} className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors text-sm ${isChecked ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600'}`}>
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...form.schedule_crons, slot.cron]
                      : form.schedule_crons.filter(c => c !== slot.cron);
                    setForm({ ...form, schedule_crons: next });
                  }}
                  className="border-stone-600"
                />
                <span>{slot.label}</span>
              </label>
            );
          })}
        </div>
        {form.schedule_crons.length > 0 && (
          <p className="text-xs text-stone-500 mt-2">
            {form.schedule_crons.length} run{form.schedule_crons.length > 1 ? 's' : ''} per day selected
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-stone-400">Status</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-100">
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

      <div>
        <Label className="text-stone-400">Candidates Per Run</Label>
        <Input type="number" min={1} max={10} value={form.candidates_per_run}
          onChange={e => setForm({ ...form, candidates_per_run: parseInt(e.target.value) || 3 })}
          className="bg-stone-800 border-stone-700 text-stone-100 w-24" />
      </div>

      {/* X Credentials */}
      {form.channel_type === 'x' && (
        <div className="border border-stone-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-stone-300">X API Credentials</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
              {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-stone-600">Your credentials are stored with the publication record. Get them from developer.x.com.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-stone-500 text-xs">API Key</Label>
              <Input type={showSecrets ? 'text' : 'password'} value={creds.api_key}
                onChange={e => setCreds({ ...creds, api_key: e.target.value })}
                className="bg-stone-800 border-stone-700 text-stone-100 text-sm" />
            </div>
            <div>
              <Label className="text-stone-500 text-xs">API Secret</Label>
              <Input type={showSecrets ? 'text' : 'password'} value={creds.api_secret}
                onChange={e => setCreds({ ...creds, api_secret: e.target.value })}
                className="bg-stone-800 border-stone-700 text-stone-100 text-sm" />
            </div>
            <div>
              <Label className="text-stone-500 text-xs">Access Token</Label>
              <Input type={showSecrets ? 'text' : 'password'} value={creds.access_token}
                onChange={e => setCreds({ ...creds, access_token: e.target.value })}
                className="bg-stone-800 border-stone-700 text-stone-100 text-sm" />
            </div>
            <div>
              <Label className="text-stone-500 text-xs">Access Token Secret</Label>
              <Input type={showSecrets ? 'text' : 'password'} value={creds.access_token_secret}
                onChange={e => setCreds({ ...creds, access_token_secret: e.target.value })}
                className="bg-stone-800 border-stone-700 text-stone-100 text-sm" />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Switch checked={form.auto_post} onCheckedChange={v => setForm({ ...form, auto_post: v })} />
        <div>
          <Label className="text-stone-300">Auto-post without review</Label>
          <p className="text-xs text-stone-600">Not recommended. Drafts will post automatically after generation.</p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          {publication?.id ? 'Update Publication' : 'Create Publication'}
        </Button>
      </div>
    </div>
  );
}