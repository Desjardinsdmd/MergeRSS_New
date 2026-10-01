import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Tag, Folder, Globe, Loader2 } from 'lucide-react';

const CATEGORIES = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function BulkFeedActions({ selectedIds, feeds, action: externalAction, onClose, onSuccess }) {
  const [action, setAction] = useState(externalAction); // 'tag', 'category', 'directory'
  const [tagInput, setTagInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    setAction(externalAction);
  }, [externalAction]);

  const selectedFeeds = feeds.filter(f => selectedIds.includes(f.id));

  const handleTag = async () => {
    if (!tagInput.trim()) {
      toast.error('Please enter a tag');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(selectedIds.map(id => {
        const feed = feeds.find(f => f.id === id);
        const newTags = [...(feed.tags || []), tagInput.trim()];
        return base44.entities.Feed.update(id, { tags: [...new Set(newTags)] });
      }));
      toast.success(`Tag "${tagInput}" added to ${selectedIds.length} source(s)`);
      onSuccess();
      setAction(null);
    } catch (err) {
      toast.error('Failed to add tags: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategory = async () => {
    if (!selectedCategory) {
      toast.error('Please select a category');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(selectedIds.map(id =>
        base44.entities.Feed.update(id, { category: selectedCategory })
      ));
      toast.success(`${selectedIds.length} source(s) moved to ${selectedCategory}`);
      onSuccess();
      setAction(null);
    } catch (err) {
      toast.error('Failed to change categories: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToDirectory = async () => {
    setLoading(true);
    try {
      // Sharing marks the user's own feeds public; publicDirectory lists them.
      // (DirectoryFeed is the admin-curated list and is admin-write only.)
      let copied = 0;
      for (const feed of selectedFeeds) {
        if (!feed.is_public) {
          await base44.entities.Feed.update(feed.id, { is_public: true });
          copied++;
        }
      }
      toast.success(`${copied} source(s) shared to the directory${copied < selectedIds.length ? ` (${selectedIds.length - copied} already shared)` : ''}`);
      onSuccess();
      setAction(null);
    } catch (err) {
      toast.error('Failed to copy to directory: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!action) return null;

  return (
    <Dialog open={!!action} onOpenChange={() => !loading && setAction(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            {action === 'tag' && <Tag className="w-5 h-5 text-[hsl(var(--primary))]" />}
            {action === 'category' && <Folder className="w-5 h-5 text-[hsl(var(--primary))]" />}
            {action === 'directory' && <Globe className="w-5 h-5 text-[hsl(var(--primary))]" />}
            {action === 'tag' && 'Add tag to selected'}
            {action === 'category' && 'Change category'}
            {action === 'directory' && 'Copy to directory'}
          </DialogTitle>
          <DialogDescription>
            {action === 'tag' && `Add a tag to ${selectedIds.length} selected source(s)`}
            {action === 'category' && `Change category for ${selectedIds.length} selected source(s)`}
            {action === 'directory' && `Copy ${selectedIds.length} source(s) to the public directory`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {action === 'tag' && (
            <div>
              <Label htmlFor="tag">Tag name</Label>
              <Input
                id="tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="e.g., breaking-news"
                onKeyPress={(e) => e.key === 'Enter' && handleTag()}
              />
            </div>
          )}

          {action === 'category' && (
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {action === 'directory' && (
            <p className="text-sm text-stone-400">
              These sources will be added to the public directory so other users can discover and add them.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAction(null)}
            disabled={loading}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={
              action === 'tag' ? handleTag :
              action === 'category' ? handleCategory :
              handleCopyToDirectory
            }
            disabled={loading}
            className="btn-brand"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {action === 'tag' && 'Add tag'}
            {action === 'category' && 'Change category'}
            {action === 'directory' && 'Copy to directory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}