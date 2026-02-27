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
import { Loader2, X, Plus, Globe } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function AddFeedDialog({ open, onOpenChange, onSuccess, editFeed = null }) {
   const [loading, setLoading] = useState(false);
   const [formData, setFormData] = useState({
     name: editFeed?.name || '',
     url: editFeed?.url || '',
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
        name: '',
        url: '',
        category: 'Other',
        tags: [],
        is_public: false,
        public_description: '',
      });
    }
    setTagInput('');
  }, [editFeed, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    } else {
      await base44.entities.Feed.create({
        name: formData.name,
        url: formData.url,
        category: formData.category,
        tags: formData.tags || [],
        status: 'active',
        item_count: 0
      });
    }

    setLoading(false);
    onSuccess();
    onOpenChange(false);
    setFormData({ name: '', url: '', category: 'Other', tags: [], is_public: false, public_description: '' });
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
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Feed Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., TechCrunch"
              required
            />
          </div>

          <div>
            <Label htmlFor="url">RSS URL</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/feed.xml"
              required
            />
          </div>

          <div>
            <Label>Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mb-2">
              <Input
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
                    <button type="button" onClick={() => removeTag(tag)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Share to Directory */}
          {editFeed && (
            <div className="border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Share to Public Directory</p>
                    <p className="text-xs text-slate-500">
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
            <Button type="submit" disabled={loading} className="bg-[#171a20] hover:bg-black rounded-sm">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editFeed ? 'Save Changes' : 'Add Feed'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}