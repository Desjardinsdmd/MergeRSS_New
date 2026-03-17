import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Plus, Globe, AlertCircle, CheckCircle2, ShieldAlert, WifiOff, Lock, FileX } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const DEFAULT_CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function AddFeedDialog({ open, onOpenChange, onSuccess, editFeed = null, prefillUrl = '', prefillName = '', existingFeedCount = 0 }) {
   const [loading, setLoading] = useState(false);
   const [success, setSuccess] = useState(false);
   const [fetchingItems, setFetchingItems] = useState(false);
   const [errors, setErrors] = useState({});
   const [customCategoryInput, setCustomCategoryInput] = useState('');
   const [formData, setFormData] = useState({
     name: editFeed?.name || prefillName || '',
     url: editFeed?.url || prefillUrl || '',
     category: editFeed?.category || 'Other',
     tags: editFeed?.tags || [],
     is_public: editFeed?.is_public || false,
     public_description: editFeed?.public_description || '',
   });
   const [tagInput, setTagInput] = useState('');

   const canShareToDirectory = editFeed && !editFeed.sourced_from_directory;

  useEffect(() => {
    if (editFeed) {
      setFormData({
        name: editFeed.name,
        url: editFeed.url,
        category: editFeed.category || 'Other',
        tags: editFeed.tags || [],
        is_public: editFeed.is_public || false,
        public_description: editFeed.public_description || '',
      });
    } else {
      setFormData({
        name: prefillName || '',
        url: prefillUrl || '',
        category: 'Other',
        tags: [],
        is_public: false,
        public_description: '',
      });
    }
    setTagInput('');
  }, [editFeed, open]);

  const [validatingRss, setValidatingRss] = useState(false);
  const [deadEndWarning, setDeadEndWarning] = useState(null); // { reason, category, details }

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Feed name is required';
    if (!formData.url.trim()) errs.url = 'RSS URL is required';
    else if (!formData.url.startsWith('http')) errs.url = 'URL must start with http:// or https://';
    return errs;
  };

  const DEAD_END_LABELS = {
    '404_gone': { icon: FileX, label: '404 – Page Not Found', detail: 'This URL returned a 404 or 410 error. The feed no longer exists at this address.' },
    'blocked_antibot': { icon: ShieldAlert, label: 'Bot Protection Detected', detail: 'This site is blocking automated access (Cloudflare, CAPTCHA, or similar). The feed cannot be fetched.' },
    'paywall_login': { icon: Lock, label: 'Paywall / Login Required', detail: 'This URL requires a login or paid subscription to access.' },
    'network_error': { icon: WifiOff, label: 'Network Error', detail: 'The URL could not be reached. It may be offline or the domain may not exist.' },
    'timeout': { icon: WifiOff, label: 'Connection Timed Out', detail: 'The server took too long to respond. It may be down or unreachable.' },
    'feed_validation_failed': { icon: AlertCircle, label: 'Invalid Feed Content', detail: 'This URL returned something that doesn\'t look like a valid RSS feed with articles.' },
    'no_articles_found': { icon: AlertCircle, label: 'No Articles Found', detail: 'This URL loaded but no articles or feed entries could be found.' },
  };

  const checkFeedHealth = async (url) => {
    // Use the same proxy to do a real check
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: controller.signal });
      clearTimeout(timeout);

      const httpStatus = res.status;
      if (!res.ok) {
        const cat = (httpStatus === 404 || httpStatus === 410 || (httpStatus >= 400 && httpStatus < 500)) ? '404_gone' : 'network_error';
        return { ok: false, category: cat, httpStatus };
      }

      const text = await res.text();
      const lc = text.toLowerCase().slice(0, 5000);

      // Bot block detection
      if (lc.includes('captcha') || lc.includes('cloudflare') || lc.includes('access denied') ||
          lc.includes('please enable javascript') || lc.includes('ddos-guard') || httpStatus === 403) {
        return { ok: false, category: 'blocked_antibot' };
      }

      // Paywall detection
      if ((lc.includes('subscribe') && lc.includes('paywall')) || lc.includes('login required') ||
          lc.includes('sign in to continue') || httpStatus === 401) {
        return { ok: false, category: 'paywall_login' };
      }

      // Is it RSS?
      const isRss = text.includes('<rss') || text.includes('<feed') || text.includes('<channel') || text.includes('<?xml');
      if (!isRss) {
        // Not RSS but page loaded — not a dead end, just not a feed URL
        return { ok: true, isRss: false };
      }

      // Validate feed has actual content
      const itemCount = (text.match(/<item[\s>]/g) || []).length + (text.match(/<entry[\s>]/g) || []).length;
      if (itemCount === 0) {
        return { ok: false, category: 'no_articles_found' };
      }

      return { ok: true, isRss: true, itemCount };
    } catch (e) {
      const msg = e.message?.toLowerCase() || '';
      if (msg.includes('abort') || msg.includes('timeout')) return { ok: false, category: 'timeout' };
      return { ok: false, category: 'network_error' };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});

    // Validate the feed URL health (only on new feeds, skip if user already acknowledged a dead-end)
    if (!editFeed && !deadEndWarning?.acknowledged) {
      setValidatingRss(true);
      const health = await checkFeedHealth(formData.url);
      setValidatingRss(false);

      if (!health.ok) {
        // Genuine dead end — show warning but allow user to add anyway
        setDeadEndWarning({ category: health.category, acknowledged: false });
        return;
      }

      if (!health.isRss) {
        setErrors({ url: 'This URL does not appear to be an RSS/Atom feed. Use the RSS Generator to create a feed from a website.' });
        return;
      }
    }

    // Clear any prior dead-end warning since user is proceeding
    setDeadEndWarning(null);

    setLoading(true);

    if (editFeed) {
      // If sharing a personal feed to public, create a DirectoryFeed with AI-enriched title/description
      if (formData.is_public && !editFeed.is_public) {
        let dirName = formData.name;
        let dirDescription = formData.public_description;

        // If name looks like a URL or is very short, use AI to generate a proper title/description
        const looksLikeUrl = dirName.includes('://') || dirName.startsWith('www.') || (dirName.length < 6 && !dirName.includes(' '));
        if (looksLikeUrl || !dirDescription) {
          try {
            const aiResult = await base44.integrations.Core.InvokeLLM({
              prompt: `Given this RSS feed URL: ${formData.url}\nAnd its current name: "${formData.name}"\n\nGenerate a clean, professional display name (max 50 chars) and a short description (1-2 sentences, max 120 chars) suitable for a public feed directory. The name should be a proper title, not a URL.`,
              response_json_schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            });
            if (aiResult?.name && !aiResult.name.includes('://')) dirName = aiResult.name;
            if (aiResult?.description && !dirDescription) dirDescription = aiResult.description;
          } catch {}
        }

        await base44.entities.DirectoryFeed.create({
          name: dirName,
          url: formData.url,
          category: formData.category,
          tags: formData.tags || [],
          description: dirDescription,
          added_count: 0,
          upvotes: 0,
          downvotes: 0,
        });
      }
      await base44.entities.Feed.update(editFeed.id, { name: formData.name, url: formData.url, category: formData.category, tags: formData.tags });
      base44.analytics.track({ eventName: 'feed_edited', properties: { category: formData.category } });
    } else {
      const newFeed = await base44.entities.Feed.create({
        name: formData.name,
        url: formData.url,
        category: formData.category,
        tags: formData.tags || [],
        status: 'active',
        item_count: 0
      });
      base44.analytics.track({ eventName: 'feed_added', properties: { category: formData.category } });

      // If this is the user's first feed, immediately fetch items so they see content right away
      if (existingFeedCount === 0 && newFeed?.id) {
        setLoading(false);
        setFetchingItems(true);
        base44.functions.invoke('fetchSingleFeed', { feed_id: newFeed.id }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 3000)); // give it 3s head start
        setFetchingItems(false);
      }
    }

    setLoading(false);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      onSuccess();
      onOpenChange(false);
      setFormData({ name: '', url: '', category: 'Other', tags: [], is_public: false, public_description: '' });
    }, 1200);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editFeed ? 'Edit Feed' : 'Add New Feed'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {fetchingItems && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2.5 bg-stone-800 border border-stone-700 text-stone-300 text-sm font-medium rounded-none">
              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" aria-hidden="true" />
              Fetching your first articles…
            </div>
          )}
          {success && !fetchingItems && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2.5 bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm font-medium rounded-none">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {editFeed ? 'Feed updated successfully!' : 'Feed added! Articles are loading.'}
            </div>
          )}

          <div>
            <Label htmlFor="name">Feed Name <span className="text-[hsl(var(--primary))]" aria-hidden="true">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors(prev => ({ ...prev, name: '' })); }}
              placeholder="e.g., TechCrunch"
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
              className={cn(errors.name && 'border-red-500 focus-visible:ring-red-500')}
            />
            {errors.name && <p id="name-error" role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="url">RSS URL <span className="text-[hsl(var(--primary))]" aria-hidden="true">*</span></Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => { setFormData({ ...formData, url: e.target.value }); setErrors(prev => ({ ...prev, url: '' })); }}
              placeholder="e.g., https://techcrunch.com/feed/"
              aria-required="true"
              aria-invalid={!!errors.url}
              aria-describedby={errors.url ? 'url-error' : 'url-hint'}
              className={cn(errors.url && 'border-red-500 focus-visible:ring-red-500')}
            />
            {errors.url
              ? <p id="url-error" role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.url}</p>
              : <p id="url-hint" className="mt-1 text-xs text-stone-500">Paste a direct RSS/Atom feed URL, e.g. <code className="text-stone-400">https://example.com/feed.xml</code></p>
            }
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={DEFAULT_CATEGORIES.includes(formData.category) ? formData.category : '__custom__'}
              onValueChange={(value) => {
                if (value !== '__custom__') setFormData({ ...formData, category: value });
              }}
            >
              <SelectTrigger id="category" aria-label="Select feed category">
                <SelectValue>{formData.category}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_CATEGORIES.map((cat) => (
                  <SelectItem key={`${cat}-option`} value={cat}>{cat}</SelectItem>
                ))}
                <SelectItem value="__custom__">+ Custom category…</SelectItem>
              </SelectContent>
            </Select>
            {(!DEFAULT_CATEGORIES.includes(formData.category) || formData.category === '') && (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="e.g. Healthcare, Energy…"
                  value={customCategoryInput}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (customCategoryInput.trim()) setFormData({ ...formData, category: customCategoryInput.trim() });
                    }
                  }}
                  className="text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { if (customCategoryInput.trim()) setFormData({ ...formData, category: customCategoryInput.trim() }); }}
                >
                  Set
                </Button>
              </div>
            )}
            {!DEFAULT_CATEGORIES.includes(formData.category) && formData.category && (
              <p className="mt-1 text-xs text-stone-400">Custom category: <span className="text-[hsl(var(--primary))]">{formData.category}</span></p>
            )}
          </div>

          <div>
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                aria-label="Add a new tag"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={addTag}
                aria-label="Add tag button"
                title="Add tag"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2" role="list" aria-label="Added tags">
                {formData.tags.map((tag) => (
                  <Badge key={`${tag}-badge`} variant="secondary" className="gap-1" role="listitem">
                    {tag}
                    <button 
                      type="button" 
                      onClick={() => removeTag(tag)}
                      className="hover:opacity-70 transition focus-visible:ring-1 focus-visible:ring-stone-400 rounded px-0.5"
                      aria-label={`Remove tag ${tag}`}
                      title={`Remove ${tag}`}
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Share to Directory */}
          {editFeed && (
            <div className="border border-stone-800 rounded-xl p-4 space-y-3 bg-stone-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[hsl(var(--primary))]" />
                  <div>
                    <p className="text-sm font-medium text-stone-200">Share to Public Directory</p>
                    <p className="text-xs text-stone-500">
                      {canShareToDirectory 
                        ? 'Let others discover and add this feed'
                        : 'Feeds from the directory cannot be re-shared'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.is_public}
                  onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
                  disabled={!canShareToDirectory}
                />
              </div>
              {formData.is_public && canShareToDirectory && (
                <div>
                  <Label className="text-xs">Short description for the directory</Label>
                  <Input
                    value={formData.public_description}
                    onChange={(e) => setFormData({ ...formData, public_description: e.target.value })}
                    placeholder="What makes this feed great?"
                    className="mt-1 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || validatingRss} className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-sm">
              {(loading || validatingRss) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {validatingRss ? 'Validating…' : editFeed ? 'Save Changes' : 'Add Feed'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}