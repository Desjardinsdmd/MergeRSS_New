import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Plus, Globe, AlertCircle, CheckCircle2, ShieldAlert, WifiOff, Lock, FileX, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { addSourceViaApi } from '@/components/feeds/sourceApi';

const DEFAULT_CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function AddSourceDialog({ open, onOpenChange, onSuccess, editFeed = null, prefillUrl = '', prefillName = '', existingFeedCount = 0 }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [formData, setFormData] = useState({
    name: editFeed?.name || prefillName || '',
    url: editFeed?.url || prefillUrl || '',
    category: editFeed?.category || 'Other',
    tags: editFeed?.tags || [],
    is_public: editFeed?.is_public || false,
    public_description: editFeed?.public_description || '',
  });
  const [tagInput, setTagInput] = useState('');
  const [sourceStatus, setSourceStatus] = useState(null); // { phase, message, type }

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
    setSourceStatus(null);
    setErrors({});
    const cat = editFeed?.category;
    const isCustom = !!cat && !DEFAULT_CATEGORIES.includes(cat);
    setShowCustomCategory(isCustom);
    setCustomCategoryInput(isCustom ? cat : '');
  }, [editFeed, open]);

  const validate = () => {
    const errs = {};
    if (editFeed && !formData.name.trim()) errs.name = 'Source name is required';
    if (!formData.url.trim()) errs.url = 'URL is required';
    else if (!formData.url.trim().startsWith('http')) errs.url = 'URL must start with http:// or https://';
    if (showCustomCategory && !customCategoryInput.trim()) errs.category = 'Enter a category name';
    return errs;
  };

  const finishSuccess = (message) => {
    setLoading(false);
    setSuccess(true);
    setSourceStatus({ phase: 'success', message, type: 'success' });
    setTimeout(() => {
      setSuccess(false);
      setSourceStatus(null);
      onSuccess?.();
      onOpenChange(false);
      setFormData({ name: '', url: '', category: 'Other', tags: [], is_public: false, public_description: '' });
      setShowCustomCategory(false);
      setCustomCategoryInput('');
    }, 1200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);

    const category = showCustomCategory ? customCategoryInput.trim() : formData.category;
    const url = formData.url.trim();

    const showFailure = (result) => {
      const d = result.data || {};
      setSourceStatus({
        phase: 'error',
        message: result.error,
        guidance: d.guidance,
        isSocial: !!d.is_social,
        platform: d.social_platform,
        type: 'error',
      });
      setLoading(false);
    };

    try {
      if (editFeed) {
        // Edit mode: only ever update the existing record. Re-run discovery only when the URL changed.
        const urlChanged = url !== (editFeed.url || '').trim();
        if (urlChanged) {
          setSourceStatus({ phase: 'analyzing', message: 'Checking the new URL…', type: 'info' });
          const result = await addSourceViaApi({ feed_id: editFeed.id, url, category, tags: formData.tags || [] });
          if (!result.ok) return showFailure(result);
        } else {
          setSourceStatus({ phase: 'analyzing', message: 'Saving…', type: 'info' });
        }
        await base44.entities.Feed.update(editFeed.id, {
          name: formData.name.trim(),
          category,
          tags: formData.tags,
          ...(canShareToDirectory ? {
            is_public: !!formData.is_public,
            public_description: formData.public_description || '',
          } : {}),
        });
        finishSuccess('Changes saved');
        return;
      }

      setSourceStatus({ phase: 'analyzing', message: 'Analyzing source and fetching first articles…', type: 'info' });
      const result = await addSourceViaApi({
        url,
        name: formData.name.trim(),
        category,
        tags: formData.tags || [],
      });
      if (!result.ok) return showFailure(result);

      if (result.duplicate) {
        toast.info(`You already follow "${result.data.name || 'this source'}"`);
        finishSuccess('Already in your sources');
        return;
      }

      const ff = result.data.first_fetch;
      if (ff && ff.success === false) {
        toast.warning(`Source added, but the first fetch failed: ${ff.error || 'unknown error'}. It will retry automatically.`);
      } else if (ff && typeof ff.new_items === 'number') {
        toast.success(`"${result.data.name}" added with ${ff.new_items} article${ff.new_items === 1 ? '' : 's'}`);
      }
      finishSuccess('Source added!');

      base44.analytics.track({ eventName: 'source_added', properties: { category, sourceType: result.data.sourceType } });
    } catch (err) {
      setSourceStatus({
        phase: 'error',
        message: err.message || 'Failed to add source',
        type: 'error',
      });
      setLoading(false);
    }
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
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[hsl(var(--primary))]" />
            {editFeed ? 'Edit Source' : 'Add New Source'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {sourceStatus && (
            <div
              className={cn(
                'flex items-start gap-3 px-3 py-3 rounded-lg',
                sourceStatus.type === 'success'
                  ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300'
                  : sourceStatus.type === 'error'
                  ? 'bg-red-900/40 border border-red-700 text-red-300'
                  : 'bg-stone-800 border border-stone-700 text-stone-300'
              )}
            >
              {sourceStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : sourceStatus.type === 'error' ? (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{sourceStatus.message}</p>
                {sourceStatus.guidance && (
                  <p className="text-xs mt-1 opacity-90">{sourceStatus.guidance}</p>
                )}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="name">
              Source Name {editFeed ? <span className="text-[hsl(var(--primary))]">*</span> : <span className="text-stone-500 font-normal">(optional)</span>}
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder={editFeed ? 'e.g., TechCrunch, Bloomberg, My Blog' : 'Leave blank to use the feed\'s own title'}
              aria-required={editFeed ? 'true' : 'false'}
              aria-invalid={!!errors.name}
              className={cn(errors.name && 'border-red-500')}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="url">
              Website or Feed URL <span className="text-[hsl(var(--primary))]">*</span>
            </Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => {
                setFormData({ ...formData, url: e.target.value });
                setErrors((prev) => ({ ...prev, url: '' }));
                setSourceStatus(null);
              }}
              placeholder="https://example.com/blog"
              aria-required="true"
              aria-invalid={!!errors.url}
              className={cn(errors.url && 'border-red-500')}
            />
            {errors.url ? (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.url}
              </p>
            ) : (
              <p className="mt-1 text-xs text-stone-500">
                Paste a blog, website, or RSS feed URL. We'll automatically detect the best source.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={showCustomCategory ? '__custom__' : (DEFAULT_CATEGORIES.includes(formData.category) ? formData.category : '__custom__')}
              onValueChange={(value) => {
                if (value === '__custom__') {
                  setShowCustomCategory(true);
                } else {
                  setShowCustomCategory(false);
                  setCustomCategoryInput('');
                  setFormData({ ...formData, category: value });
                }
                setErrors((prev) => ({ ...prev, category: '' }));
              }}
            >
              <SelectTrigger id="category">
                <SelectValue>{showCustomCategory ? (customCategoryInput.trim() || 'Custom category…') : formData.category}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">+ Custom category…</SelectItem>
              </SelectContent>
            </Select>
            {showCustomCategory && (
              <div className="mt-2">
                <Input
                  id="custom-category"
                  value={customCategoryInput}
                  onChange={(e) => {
                    setCustomCategoryInput(e.target.value.slice(0, 40));
                    setErrors((prev) => ({ ...prev, category: '' }));
                  }}
                  placeholder="Type a category name"
                  aria-label="Custom category name"
                  aria-invalid={!!errors.category}
                  className={cn(errors.category && 'border-red-500')}
                  autoFocus
                />
                {errors.category && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.category}
                  </p>
                )}
              </div>
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
              />
              <Button type="button" variant="outline" onClick={addTag} aria-label="Add tag">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:opacity-70"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {editFeed && (
            <div className="border border-stone-800 rounded-lg p-4 space-y-3 bg-stone-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[hsl(var(--primary))]" />
                  <div>
                    <p className="text-sm font-medium text-stone-200">Share to Public Directory</p>
                    <p className="text-xs text-stone-500">Let others discover this source</p>
                  </div>
                </div>
                <Switch
                  checked={formData.is_public}
                  onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
                  disabled={!canShareToDirectory}
                  aria-label="Share to public directory"
                />
              </div>
              {canShareToDirectory && formData.is_public && (
                <Input
                  value={formData.public_description}
                  onChange={(e) => setFormData({ ...formData, public_description: e.target.value.slice(0, 280) })}
                  placeholder="Short description for the directory (optional)"
                  aria-label="Public directory description"
                />
              )}
              {!canShareToDirectory && (
                <p className="text-xs text-stone-500">Sources added from the directory can't be re-shared.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || success}
              className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editFeed ? 'Save Changes' : 'Add Source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}