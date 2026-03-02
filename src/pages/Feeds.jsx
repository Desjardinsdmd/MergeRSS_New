import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, Rss, Loader2, RefreshCw, Upload, Grid3x3, List, Trash2 } from 'lucide-react';
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
import FeedListView from '@/components/feeds/FeedListView';
import FeedCompactView from '@/components/feeds/FeedCompactView';
import BulkImportDialog from '@/components/feeds/BulkImportDialog';
import BulkFeedActions from '@/components/feeds/BulkFeedActions';

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
  const [viewMode, setViewMode] = useState('grid'); // grid, list, compact
  const [selectedFeeds, setSelectedFeeds] = useState([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [bulkActionOpen, setBulkActionOpen] = useState(null); // 'tag', 'category', 'directory'
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
    
    // Restore saved view mode preference
    const savedViewMode = localStorage.getItem('feedsViewMode');
    if (savedViewMode) {
      setViewMode(savedViewMode);
    }
  }, []);

  // Save view mode preference whenever it changes
  useEffect(() => {
    localStorage.setItem('feedsViewMode', viewMode);
  }, [viewMode]);

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date'),
    enabled: !!user,
  });

  const filteredFeeds = feeds.filter((feed) => {
    const matchesSearch = feed.name.toLowerCase().includes(search.toLowerCase()) ||
                          feed.url.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || feed.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleDelete = async () => {
    if (deleteConfirm) {
      // Prevent deletion of directory feeds
      if (deleteConfirm.is_public) {
        toast.error('Cannot delete feeds in the directory. Make them private first.');
        setDeleteConfirm(null);
        return;
      }
      await base44.entities.Feed.delete(deleteConfirm.id);
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      setDeleteConfirm(null);
      setSelectedFeeds([]);
      toast.success('Feed deleted');
    }
  };

  const handleBulkDelete = async () => {
    // Check if any selected feeds are in the directory
    const publicFeeds = feeds.filter(f => selectedFeeds.includes(f.id) && f.is_public);
    if (publicFeeds.length > 0) {
      toast.error(`Cannot delete ${publicFeeds.length} feed(s) in the directory. Make them private first.`);
      setDeleteConfirm(null);
      return;
    }
    setDeletingBulk(true);
    try {
      await Promise.all(selectedFeeds.map(id => base44.entities.Feed.delete(id)));
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      setSelectedFeeds([]);
      toast.success(`${selectedFeeds.length} feed(s) deleted`);
    } catch (err) {
      toast.error('Failed to delete feeds: ' + err.message);
    } finally {
      setDeletingBulk(false);
      setDeleteConfirm(null);
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
          <h1 className="text-2xl font-bold text-stone-100">Feeds</h1>
          <p className="text-stone-500">
            Manage your RSS feed sources
            {!isPremium && (
              <span className="text-sm text-stone-600 ml-2">
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
            className="bg-amber-400 hover:bg-amber-300 text-stone-900 rounded-lg disabled:opacity-60 font-bold"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Feed
          </Button>
        </div>
      </div>

      {/* Free plan limit banner */}
      {!isPremium && feeds.length >= maxFeeds && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3">
          <p className="text-sm text-stone-400 font-medium">
            You've reached the 5-feed limit on the Free plan. Upgrade to Premium for unlimited feeds.
          </p>
          <Link to={createPageUrl('Pricing')}>
            <Button size="sm" className="bg-amber-400 hover:bg-amber-300 text-stone-900 rounded-lg whitespace-nowrap font-bold">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Filters and View Options */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600" />
          <Input
            placeholder="Search feeds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-stone-900 border-stone-800 text-stone-200 placeholder-stone-600"
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
        <div className="flex gap-1 border border-stone-800 rounded-lg p-1 bg-stone-900">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="rounded"
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'compact' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('compact')}
            className="rounded"
          >
            <span className="text-xs font-semibold">≡</span>
          </Button>
        </div>
      </div>

      {/* Feed List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      ) : filteredFeeds.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rss className="w-6 h-6 text-stone-600" />
          </div>
          <h3 className="text-lg font-medium text-stone-100 mb-1">
            {feeds.length === 0 ? 'No feeds yet' : 'No feeds match your filters'}
          </h3>
          <p className="text-stone-500 mb-4">
            {feeds.length === 0 
              ? 'Add your first RSS feed to get started'
              : 'Try adjusting your search or filters'
            }
          </p>
          {feeds.length === 0 && (
            <Button onClick={() => setShowAddDialog(true)} className="bg-amber-400 hover:bg-amber-300 text-stone-900 rounded-lg font-bold">
              <Plus className="w-4 h-4 mr-2" />
              Add Feed
            </Button>
          )}
        </div>
      ) : (
        <>
          {selectedFeeds.length > 0 && (
            <div className="mb-6 flex items-center justify-between gap-4 bg-stone-900 border border-stone-800 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-stone-300">{selectedFeeds.length} feed(s) selected</span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionOpen('tag')}
                >
                  Add Tag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionOpen('category')}
                >
                  Change Category
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionOpen('directory')}
                >
                  Copy to Directory
                </Button>
                <Button
                  size="sm"
                  onClick={() => setDeleteConfirm({ id: 'bulk', name: '' })}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}
          {viewMode === 'grid' && (
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
          {viewMode === 'list' && (
            <FeedListView
              feeds={filteredFeeds}
              selectedIds={selectedFeeds}
              onSelectionChange={setSelectedFeeds}
              onEdit={(f) => { setEditFeed(f); setShowAddDialog(true); }}
              onDelete={(f) => setDeleteConfirm(f)}
              onToggleStatus={handleToggleStatus}
            />
          )}
          {viewMode === 'compact' && (
            <FeedCompactView
              feeds={filteredFeeds}
              selectedIds={selectedFeeds}
              onSelectionChange={setSelectedFeeds}
              onEdit={(f) => { setEditFeed(f); setShowAddDialog(true); }}
              onDelete={(f) => setDeleteConfirm(f)}
              onToggleStatus={handleToggleStatus}
            />
          )}
        </>
      )}

      {/* Bulk Import Dialog */}
      <BulkImportDialog
        open={showBulkImport}
        onOpenChange={setShowBulkImport}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['feeds'] });
          queryClient.invalidateQueries({ queryKey: ['digests'] });
        }}
      />

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

       {/* Bulk Actions */}
       {bulkActionOpen && (
         <BulkFeedActions
           selectedIds={selectedFeeds}
           feeds={feeds}
           action={bulkActionOpen}
           onClose={() => setBulkActionOpen(null)}
           onSuccess={() => {
             queryClient.invalidateQueries({ queryKey: ['feeds'] });
             setBulkActionOpen(null);
             setSelectedFeeds([]);
           }}
         />
       )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteConfirm.id === 'bulk' ? 'Delete Feeds' : 'Delete Feed'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConfirm.id === 'bulk'
                  ? `Are you sure you want to delete ${selectedFeeds.length} feed(s)? This will also remove all associated items.`
                  : `Are you sure you want to delete "${deleteConfirm.name}"? This will also remove all associated items.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteConfirm.id === 'bulk' ? handleBulkDelete : handleDelete}
                disabled={deletingBulk}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingBulk ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}