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

export default function BulkFeedActions({ selectedIds, feeds, onClose, onSuccess }) {
  const [action, setAction] = useState(null); // 'tag', 'category', 'directory'
  const [tagInput, setTagInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(false);

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
      toast.success(`Tag "${tagInput}" added to ${selectedIds.length} feed(s)`);
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
      toast.success(`${selectedIds.length} feed(s) moved to ${selectedCategory}`);
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
      const dirFeeds = await base44.entities.DirectoryFeed.list();
      const dirUrls = new Set(dirFeeds.map(f => f.url));
      
      let copied = 0;
      for (const feed of selectedFeeds) {
        if (!dirUrls.has(feed.url)) {
          await base44.entities.DirectoryFeed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category,
            tags: feed.tags || [],
            description: '',
            added_count: 0,
            upvotes: 0,
            downvotes: 0,
          });
          copied++;
        }
      }
      toast.success(`${copied} feed(s) copied to directory${copied < selectedIds.length ? ` (${selectedIds.length - copied} already existed)` : ''}`);
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
          <DialogTitle className="flex items-center gap-2">
            {action === 'tag' && <Tag className="w-5 h-5" />}
            {action === 'category' && <Folder className="w-5 h-5" />}
            {action === 'directory' && <Globe className="w-5 h-5" />}
            {action === 'tag' && 'Add Tag to Selected'}
            {action === 'category' && 'Change Category'}
            {action === 'directory' && 'Copy to Directory'}
          </DialogTitle>
          <DialogDescription>
            {action === 'tag' && `Add a tag to ${selectedIds.length} selected feed(s)`}
            {action === 'category' && `Change category for ${selectedIds.length} selected feed(s)`}
            {action === 'directory' && `Copy ${selectedIds.length} feed(s) to the public directory`}
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
            <p className="text-sm text-slate-600">
              These feeds will be added to the public directory so other users can discover and add them.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAction(null)}
            disabled={loading}
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
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {action === 'tag' && 'Add Tag'}
            {action === 'category' && 'Change Category'}
            {action === 'directory' && 'Copy to Directory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}