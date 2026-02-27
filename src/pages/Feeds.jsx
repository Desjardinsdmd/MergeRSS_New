import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, Rss, Loader2, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import AddFeedDialog from '@/components/feeds/AddFeedDialog';
import FeedCard from '@/components/feeds/FeedCard';
import BulkImportDialog from '@/components/feeds/BulkImportDialog';

const CATEGORIES = ['All', 'CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

export default function Feeds() {
  const [user, setUser] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editFeed, setEditFeed] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [fetching, setFetching] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.list('-created_date'),
  });

  const filteredFeeds = feeds.filter((feed) => {
    const matchesSearch = feed.name.toLowerCase().includes(search.toLowerCase()) ||
                          feed.url.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || feed.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleDelete = async () => {
    if (deleteConfirm) {
      await base44.entities.Feed.delete(deleteConfirm.id);
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      setDeleteConfirm(null);
      toast.success('Feed deleted');
    }
  };

  const handleToggleStatus = async (feed) => {
    const newStatus = feed.status === 'active' ? 'paused' : 'active';
    await base44.entities.Feed.update(feed.id, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['feeds'] });
    toast.success(`Feed ${newStatus === 'active' ? 'activated' : 'paused'}`);
  };

  const handleFetchFeeds = async () => {
    setFetching(true);
    const response = await base44.functions.invoke('fetchFeeds');
    queryClient.invalidateQueries({ queryKey: ['feeds'] });
    queryClient.invalidateQueries({ queryKey: ['feedItems'] });
    setFetching(false);
    const results = response.data?.results || [];
    const newItems = results.reduce((sum, r) => sum + (r.new_items || 0), 0);
    toast.success(`Feeds refreshed — ${newItems} new items found`);
  };

  const isPremium = user?.plan === 'premium';
  const maxFeeds = isPremium ? Infinity : 5;
  const canAddMore = feeds.length < maxFeeds;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Feeds</h1>
          <p className="text-slate-600">
            Manage your RSS feed sources
            {!isPremium && (
              <span className="text-sm text-slate-500 ml-2">
                ({feeds.length}/{maxFeeds} used)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleFetchFeeds}
            disabled={fetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${fetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowBulkImport(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button 
            onClick={() => canAddMore ? setShowAddDialog(true) : null}
            disabled={!canAddMore}
            title={!canAddMore ? 'Upgrade to Premium to add more feeds' : ''}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Feed
          </Button>
        </div>
      </div>

      {/* Free plan limit banner */}
      {!isPremium && feeds.length >= maxFeeds && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">
            You've reached the 5-feed limit on the Free plan. Upgrade to Premium for unlimited feeds.
          </p>
          <Link to={createPageUrl('Pricing')}>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 rounded-lg whitespace-nowrap">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search feeds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Feed List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : filteredFeeds.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rss className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">
            {feeds.length === 0 ? 'No feeds yet' : 'No feeds match your filters'}
          </h3>
          <p className="text-slate-500 mb-4">
            {feeds.length === 0 
              ? 'Add your first RSS feed to get started'
              : 'Try adjusting your search or filters'
            }
          </p>
          {feeds.length === 0 && (
            <Button onClick={() => setShowAddDialog(true)} className="bg-indigo-600 hover:bg-indigo-700 rounded-lg">
              <Plus className="w-4 h-4 mr-2" />
              Add Feed
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredFeeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              onEdit={(f) => { setEditFeed(f); setShowAddDialog(true); }}
              onDelete={(f) => setDeleteConfirm(f)}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <AddFeedDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setEditFeed(null);
        }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['feeds'] })}
        editFeed={editFeed}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feed</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This will also remove all associated items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}