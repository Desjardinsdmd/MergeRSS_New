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
import { Loader2, X, Plus, Globe, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function AddFeedDialog({ open, onOpenChange, onSuccess, editFeed = null, prefillUrl = '', prefillName = '' }) {
   const [loading, setLoading] = useState(false);
   const [success, setSuccess] = useState(false);
   const [errors, setErrors] = useState({});
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

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Feed name is required';
    if (!formData.url.trim()) errs.url = 'RSS URL is required';
    else if (!formData.url.startsWith('http')) errs.url = 'URL must start with http:// or https://';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    if (editFeed) {
      // If sharing a personal feed to public, create a DirectoryFeed
      if (formData.is_public && !editFeed.is_public) {
        await base44.entities.DirectoryFeed.create({
          name: formData.name,
          url: formData.url,
          category: formData.category,
          tags: formData.tags || [],
          description: formData.public_description,
          added_count: 0,
          upvotes: 0,
          downvotes: 0,
        });
      }
      await base44.entities.Feed.update(editFeed.id, { name: formData.name, url: formData.url, category: formData.category, tags: formData.tags });
      base44.analytics.track({ eventName: 'feed_edited', properties: { category: formData.category } });
    } else {
      await base44.entities.Feed.create({
        name: formData.name,
        url: formData.url,
        category: formData.category,
        tags: formData.tags || [],
        status: 'active',
        item_count: 0
      });
      base44.analytics.track({ eventName: 'feed_added', properties: { category: formData.category } });
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
          {success && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2.5 bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm font-medium rounded-none">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {editFeed ? 'Feed updated successfully!' : 'Feed added successfully!'}
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
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger id="category" aria-label="Select feed category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={`${cat}-option`} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={loading} className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-sm">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editFeed ? 'Save Changes' : 'Add Feed'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}