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

const DEFAULT_CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function AddSourceDialog({ open, onOpenChange, onSuccess, editFeed = null, prefillUrl = '', prefillName = '', existingFeedCount = 0 }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
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
  }, [editFeed, open]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Source name is required';
    if (!formData.url.trim()) errs.url = 'URL is required';
    else if (!formData.url.startsWith('http')) errs.url = 'URL must start with http:// or https://';
    return errs;
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
    setSourceStatus({ phase: 'analyzing', message: 'Analyzing source…', type: 'info' });

    try {
      const response = await base44.functions.invoke('addSource', {
        url: formData.url.trim(),
        name: formData.name.trim(),
        category: formData.category,
        tags: formData.tags || [],
      });

      if (!response.data.success) {
        if (response.data.is_social) {
          setSourceStatus({
            phase: 'error',
            message: response.data.error,
            guidance: response.data.guidance,
            isSocial: true,
            platform: response.data.social_platform,
            type: 'error',
          });
        } else {
          setSourceStatus({
            phase: 'error',
            message: response.data.error,
            type: 'error',
          });
        }
        setLoading(false);
        return;
      }

      // Success: update or create feed record
      if (editFeed) {
        await base44.entities.Feed.update(editFeed.id, {
          name: formData.name,
          url: formData.url,
          category: formData.category,
          tags: formData.tags,
        });
      } else {
        // Feed already created by addSource, just refresh
      }

      setLoading(false);
      setSuccess(true);
      setSourceStatus({ phase: 'success', message: 'Source added!', type: 'success' });

      setTimeout(() => {
        setSuccess(false);
        setSourceStatus(null);
        onSuccess();
        onOpenChange(false);
        setFormData({ name: '', url: '', category: 'Other', tags: [], is_public: false, public_description: '' });
      }, 1200);

      base44.analytics.track({ eventName: 'source_added', properties: { category: formData.category, sourceType: response.data.sourceType } });
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
              Source Name <span className="text-[hsl(var(--primary))]">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="e.g., TechCrunch, Bloomberg, My Blog"
              aria-required="true"
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
              value={DEFAULT_CATEGORIES.includes(formData.category) ? formData.category : '__custom__'}
              onValueChange={(value) => {
                if (value !== '__custom__') setFormData({ ...formData, category: value });
              }}
            >
              <SelectTrigger id="category">
                <SelectValue>{formData.category}</SelectValue>
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
            {!DEFAULT_CATEGORIES.includes(formData.category) && formData.category && (
              <p className="mt-1 text-xs text-stone-400">
                Custom: <span className="text-[hsl(var(--primary))]">{formData.category}</span>
              </p>
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
              <Button type="button" variant="outline" onClick={addTag}>
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
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (sourceStatus?.type === 'error')}
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