import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  Search, Rss, FileText, ArrowUp, ArrowDown,
  Users, Globe, Plus, Loader2, CheckCircle2, Circle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { addSourceViaApi, saveDigestViaApi } from '@/components/feeds/sourceApi';

const CATEGORIES = ['All', 'CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

const categoryColors = {
  CRE: 'bg-stone-800 text-[hsl(var(--primary))]',
  Markets: 'bg-stone-800 text-[hsl(var(--primary))]',
  Tech: 'bg-stone-800 text-[hsl(var(--primary))]',
  News: 'bg-stone-800 text-[hsl(var(--primary))]',
  Finance: 'bg-stone-800 text-[hsl(var(--primary))]',
  Crypto: 'bg-stone-800 text-[hsl(var(--primary))]',
  AI: 'bg-stone-800 text-[hsl(var(--primary))]',
  Other: 'bg-stone-800 text-stone-400',
};

function VoteButtons({ item, itemType, user, onVote, voting }) {
  const myVote = item.my_vote || null;
  const score = (item.upvotes || 0) - (item.downvotes || 0);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={() => onVote(item, itemType, 'up')}
        disabled={!user || voting}
        aria-label={myVote === 'up' ? `Remove upvote for ${item.name}` : `Upvote ${item.name}`}
        aria-pressed={myVote === 'up'}
        className={cn(
          'p-1 rounded transition',
          myVote === 'up'
            ? 'text-[hsl(var(--primary))]'
            : 'text-stone-400 hover:text-[hsl(var(--primary))]',
          !user && 'opacity-40 cursor-not-allowed'
        )}
        title={user ? 'Upvote' : 'Sign in to vote'}
      >
        <ArrowUp className="w-4 h-4" />
      </button>
      <span aria-label={`Score ${score}`} className={cn(
        'text-xs font-bold leading-none',
        score > 0 ? 'text-[hsl(var(--primary))]' : score < 0 ? 'text-red-500' : 'text-stone-400'
      )}>
        {score}
      </span>
      <button
        type="button"
        onClick={() => onVote(item, itemType, 'down')}
        disabled={!user || voting}
        aria-label={myVote === 'down' ? `Remove downvote for ${item.name}` : `Downvote ${item.name}`}
        aria-pressed={myVote === 'down'}
        className={cn(
          'p-1 rounded transition',
          myVote === 'down'
            ? 'text-red-500'
            : 'text-stone-400 hover:text-red-400',
          !user && 'opacity-40 cursor-not-allowed'
        )}
        title={user ? 'Downvote' : 'Sign in to vote'}
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  );
}

function DirectoryCard({ item, itemType, user, onVote, votingKey, onAdd, addedItems, isSelected, onToggleSelect }) {
  const [adding, setAdding] = React.useState(false);
  const Icon = itemType === 'feed' ? Rss : FileText;
  const isAdded = item.added_by_me || addedItems?.includes(item.id);
  const isCreator = !!item.is_mine;

  const handleAddClick = async () => {
    setAdding(true);
    try {
      await onAdd(item, itemType);
    } finally {
      setAdding(false);
    }
  };
  
  return (
     <div className={cn("bg-stone-900 border rounded-xl p-4 flex gap-4 hover:shadow-sm transition", isSelected ? "border-amber-400 bg-stone-800" : "border-stone-800")}>
       <button
         type="button"
         onClick={() => onToggleSelect && onToggleSelect(item.id, itemType)}
         className="flex-shrink-0 mt-0.5 text-stone-600 hover:text-amber-400 transition"
         title={isSelected ? 'Deselect' : 'Select'}
         aria-label={`${isSelected ? 'Deselect' : 'Select'} ${item.name}`}
         aria-pressed={!!isSelected}
       >
         {isSelected ? <CheckCircle2 className="w-5 h-5 text-amber-400" /> : <Circle className="w-5 h-5" />}
       </button>
       <VoteButtons item={item} itemType={itemType} user={user} onVote={onVote} voting={votingKey === `${itemType}-${item.id}`} />

       <div className="flex-1 min-w-0">
         <div className="flex items-start justify-between gap-2">
           <div className="flex items-center gap-2 min-w-0">
             <div className="w-8 h-8 bg-stone-800 rounded-lg flex items-center justify-center flex-shrink-0">
               <Icon className="w-4 h-4 text-amber-400" />
             </div>
             <div className="min-w-0">
               <h3 className="font-semibold text-stone-100 text-sm leading-tight truncate">{item.name}</h3>
              {item.category && (
                <Badge className={cn('text-[10px] mt-0.5', categoryColors[item.category] || categoryColors.Other)}>
                  {item.category}
                </Badge>
              )}
            </div>
          </div>
          {isCreator ? (
            <Badge variant="outline" className="text-xs h-7 px-2.5 flex-shrink-0 border-stone-700 text-stone-400">
              Your {itemType}
            </Badge>
          ) : isAdded ? (
            <Badge variant="outline" className="text-xs h-7 px-2.5 flex-shrink-0 bg-emerald-900/30 text-emerald-400 border-emerald-700">
              ✓ Added
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={handleAddClick}
              disabled={!user || adding}
              className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold rounded-lg text-xs h-7 px-2.5 flex-shrink-0"
              title={user ? undefined : 'Sign in to add'}
              aria-label={`Add ${item.name} to your ${itemType === 'feed' ? 'sources' : 'digests'}`}
            >
              {adding ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Adding
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </>
              )}
            </Button>
          )}
        </div>

        {(item.public_description || item.description) && (
          <p className="text-xs text-stone-500 mt-2 line-clamp-2 leading-relaxed">
            {item.public_description || item.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-600">
          {item.frequency && (
            <span className="capitalize">{item.frequency}</span>
          )}
          {item.tags?.length > 0 && item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="bg-stone-800 px-1.5 py-0.5 rounded text-stone-500">#{tag}</span>
          ))}
          <span className="flex items-center gap-1 ml-auto">
            <Users className="w-3 h-3" />
            {item.added_count || 0} added
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Directory() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('top');
  const [addedItems, setAddedItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [bulkAdding, setBulkAdding] = useState(false);
  const [digestCreating, setDigestCreating] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.isAuthenticated()
      .then(async (auth) => {
        if (auth) setUser(await base44.auth.me());
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  // One call returns public feeds (user-shared + curated), digests, vote tallies, add counts,
  // and (when signed in) my_vote / added_by_me / is_mine per item.
  const { data: directory = { feeds: [], digests: [] } } = useQuery({
    queryKey: ['public-directory', user?.email || 'anon'],
    queryFn: async () => {
      const res = await base44.functions.invoke('publicDirectory', {});
      return { feeds: res?.data?.feeds || [], digests: res?.data?.digests || [] };
    },
    enabled: !authLoading,
  });
  const directoryFeeds = directory.feeds;
  const directoryDigests = directory.digests;
  const [votingKey, setVotingKey] = useState(null);

  const refreshDirectory = () => queryClient.invalidateQueries({ queryKey: ['public-directory'] });

  const filterAndSort = (items) => {
    let filtered = items.filter(item => {
      const matchSearch = !search ||
        (item.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.public_description || item.description || '').toLowerCase().includes(search.toLowerCase());
      const matchCat = category === 'All' || item.category === category || (item.categories || []).includes(category);
      return matchSearch && matchCat;
    });

    if (sortBy === 'top') {
      filtered.sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0)));
    } else if (sortBy === 'popular') {
      filtered.sort((a, b) => (b.added_count || 0) - (a.added_count || 0));
    } else {
      filtered.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }
    return filtered;
  };

  // Votes go through publicDirectory (service role): one vote per user per item, and nobody
  // writes to another user's Feed/Digest record.
  const handleVote = async (item, itemType, voteType) => {
    if (!user || votingKey) return;
    const key = `${itemType}-${item.id}`;
    setVotingKey(key);
    const qk = ['public-directory', user?.email || 'anon'];
    const prev = queryClient.getQueryData(qk);
    // Optimistic update
    const nextVote = item.my_vote === voteType ? null : voteType;
    const apply = (it) => {
      if (it.id !== item.id) return it;
      let up = it.upvotes || 0, down = it.downvotes || 0;
      if (it.my_vote === 'up') up--; if (it.my_vote === 'down') down--;
      if (nextVote === 'up') up++; if (nextVote === 'down') down++;
      return { ...it, upvotes: up, downvotes: down, score: up - down, my_vote: nextVote };
    };
    if (prev) {
      queryClient.setQueryData(qk, {
        feeds: itemType === 'feed' ? prev.feeds.map(apply) : prev.feeds,
        digests: itemType === 'digest' ? prev.digests.map(apply) : prev.digests,
      });
    }
    try {
      await base44.functions.invoke('publicDirectory', { action: 'vote', item_id: item.id, item_type: itemType, vote: voteType });
    } catch (err) {
      if (prev) queryClient.setQueryData(qk, prev);
      toast.error(err?.response?.data?.error || 'Could not record your vote');
    } finally {
      setVotingKey(null);
      refreshDirectory();
    }
  };

  const recordAdd = (item, itemType) =>
    base44.functions.invoke('publicDirectory', { action: 'record_add', item_id: item.id, item_type: itemType }).catch(() => {});

  // Adds a directory feed through addSource (validation, plan limit, dedupe, first fetch).
  // Returns the caller's Feed id (new or existing) or null.
  const addFeedItem = async (item, { quiet = false } = {}) => {
    const result = await addSourceViaApi({
      url: item.url,
      name: item.name,
      category: item.category || 'Other',
      tags: item.tags || [],
      sourced_from_directory: true,
      directory_feed_id: item.id,
    });
    if (!result.ok) {
      if (!quiet) toast.error(`${item.name}: ${result.error}`);
      return { ok: false, limitReached: result.limitReached, error: result.error };
    }
    setAddedItems(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
    if (!result.duplicate) recordAdd(item, 'feed');
    if (!quiet) {
      toast.success(result.duplicate ? `"${item.name}" is already in your sources` : `"${item.name}" added to your sources`);
    }
    return { ok: true, duplicate: result.duplicate, feedId: result.feedId };
  };

  const handleAdd = async (item, itemType) => {
    if (!user || item.added_by_me || addedItems.includes(item.id)) return;

    if (itemType === 'feed') {
      await addFeedItem(item);
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      refreshDirectory();
      return;
    }

    const result = await saveDigestViaApi({
      name: item.name,
      description: item.public_description || item.description || '',
      categories: item.categories || [],
      tags: item.tags || [],
      frequency: item.frequency || 'daily',
      ...(item.schedule_time ? { schedule_time: item.schedule_time } : {}),
      ...(item.schedule_day_of_week !== undefined ? { schedule_day_of_week: item.schedule_day_of_week } : {}),
      ...(item.schedule_day_of_month !== undefined ? { schedule_day_of_month: item.schedule_day_of_month } : {}),
      ...(item.output_length ? { output_length: item.output_length } : {}),
      delivery_web: true,
      status: 'active',
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    result.warnings.forEach(w => toast.warning(w));
    setAddedItems(prev => [...prev, item.id]);
    await recordAdd(item, 'digest');
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    refreshDirectory();
    toast.success(`"${item.name}" added to your digests`);
  };

  const filteredFeeds = filterAndSort(directoryFeeds);
  const filteredDigests = filterAndSort(directoryDigests);

  const toggleSelectItem = (itemId, itemType) => {
    const key = `${itemType}-${itemId}`;
    setSelectedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const selectedFeeds = filteredFeeds.filter(f => selectedItems[`feed-${f.id}`]);
  const selectedDigests = filteredDigests.filter(d => selectedItems[`digest-${d.id}`]);
  const totalSelected = selectedFeeds.length + selectedDigests.length;

  const handleSelectAll = () => {
    const newSelected = { ...selectedItems };
    filteredFeeds.forEach(f => {
      newSelected[`feed-${f.id}`] = true;
    });
    filteredDigests.forEach(d => {
      newSelected[`digest-${d.id}`] = true;
    });
    setSelectedItems(newSelected);
  };

  const handleDeselectAll = () => {
    setSelectedItems({});
  };

  // Adds each selected feed via addSource (existing ones come back as duplicates, not copies).
  // Returns the caller's own Feed ids for the selection.
  const addSelectedFeeds = async () => {
    const ids = [];
    let added = 0, dupes = 0, failed = 0;
    for (const feed of selectedFeeds) {
      const r = await addFeedItem(feed, { quiet: true });
      if (!r.ok) {
        failed++;
        if (r.limitReached) {
          toast.error(r.error);
          break;
        }
        continue;
      }
      if (r.feedId) ids.push(r.feedId);
      if (r.duplicate) dupes++; else added++;
    }
    return { ids, added, dupes, failed };
  };

  const handleBulkAdd = async () => {
    if (selectedFeeds.length === 0) return;
    setBulkAdding(true);
    try {
      const { added, dupes, failed } = await addSelectedFeeds();
      const parts = [`${added} added`];
      if (dupes) parts.push(`${dupes} already in your sources`);
      if (failed) parts.push(`${failed} failed`);
      (failed && !added ? toast.error : toast.success)(parts.join(' · '));
      setSelectedItems({});
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      refreshDirectory();
    } finally {
      setBulkAdding(false);
    }
  };

  const handleCreateDigestFromFeeds = async () => {
    if (selectedFeeds.length === 0) return;
    setDigestCreating(true);
    try {
      // The digest must point at the caller's own feeds, so add (or find) them first.
      const { ids } = await addSelectedFeeds();
      if (ids.length === 0) {
        toast.error('None of the selected feeds could be added, so no digest was created.');
        return;
      }
      const result = await saveDigestViaApi({
        name: `${category === 'All' ? 'Feeds' : category} Digest`,
        description: `Digest created from ${ids.length} directory feed${ids.length > 1 ? 's' : ''}`,
        categories: Array.from(new Set(selectedFeeds.map(f => f.category).filter(Boolean))),
        feed_ids: ids,
        frequency: 'daily',
        schedule_time: '09:00',
        output_length: 'medium',
        delivery_web: true,
        status: 'active',
        tags: Array.from(new Set(selectedFeeds.flatMap(f => f.tags || []))),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      result.warnings.forEach(w => toast.warning(w));
      setSelectedItems({});
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      refreshDirectory();
      toast.success(`Digest created from ${ids.length} feed${ids.length > 1 ? 's' : ''}`);
    } finally {
      setDigestCreating(false);
    }
  };

  return (
     <div className="min-h-screen bg-[#0a0805]">
       {/* Hero */}
       <div className="bg-[#0d0a06] border-b border-stone-800">
         <div className="max-w-4xl mx-auto px-4 py-12 text-center">
           <div className="inline-flex items-center gap-2 px-3 py-1 bg-[hsl(var(--primary))]/20 rounded-full text-xs text-[hsl(var(--primary))] font-medium mb-4">
             <Globe className="w-3.5 h-3.5" />
             Public Directory
           </div>
           <h1 className="text-3xl font-bold text-stone-100 mb-3">
             Discover Feeds & Digests
           </h1>
           <p className="text-stone-500 max-w-xl mx-auto mb-8">
             Browse community-shared RSS feeds and curated digests. Vote on your favorites and add them to your library in one click.
           </p>

           {/* Search */}
           <div className="relative max-w-lg mx-auto">
             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600" />
             <Input
               placeholder="Search feeds and digests..."
               aria-label="Search feeds and digests"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="pl-10 h-11 rounded-xl border-stone-800 bg-stone-900 text-stone-100 placeholder-stone-600 shadow-sm"
             />
           </div>

           {!authLoading && !user && (
             <p className="text-xs text-stone-500 mt-3">
               <button
                 onClick={() => base44.auth.redirectToLogin(createPageUrl('Directory'))}
                 className="text-amber-400 hover:underline"
               >
                 Sign in
               </button>
               {' '}to vote and add feeds/digests to your library
             </p>
           )}
         </div>
       </div>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition',
                category === cat
                  ? 'bg-[hsl(var(--primary))] text-stone-900'
                  : 'bg-stone-900 border border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-300'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {totalSelected === 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectAll}
              className="text-xs h-8"
            >
              Select All
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeselectAll}
              className="text-xs h-8 text-stone-400"
            >
              Deselect All
            </Button>
          )}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 text-xs w-32 rounded-lg" aria-label="Sort directory">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Top Rated</SelectItem>
              <SelectItem value="popular">Most Added</SelectItem>
              <SelectItem value="new">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {totalSelected > 0 && (
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 bg-stone-800 border-b border-stone-700">
          <span className="text-sm font-medium text-stone-300">
            {totalSelected} item{totalSelected > 1 ? 's' : ''} selected
          </span>
          {selectedFeeds.length > 0 && (
            <>
              <Button
                size="sm"
                onClick={handleBulkAdd}
                disabled={bulkAdding}
                className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold text-xs"
              >
                {bulkAdding ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Adding
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 mr-1" />
                    Add {selectedFeeds.length} Feed{selectedFeeds.length > 1 ? 's' : ''}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleCreateDigestFromFeeds}
                disabled={digestCreating}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs"
              >
                {digestCreating ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Creating
                  </>
                ) : (
                  <>
                    <FileText className="w-3 h-3 mr-1" />
                    Create Digest
                  </>
                )}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDeselectAll}
            className="ml-auto text-xs"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pb-12">
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All ({filteredFeeds.length + filteredDigests.length})</TabsTrigger>
            <TabsTrigger value="feeds">Feeds ({filteredFeeds.length})</TabsTrigger>
            <TabsTrigger value="digests">Digests ({filteredDigests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {filteredFeeds.length === 0 && filteredDigests.length === 0 ? (
              <EmptyState search={search} />
            ) : (
              <div className="space-y-3">
                {[...filteredFeeds.map(f => ({ ...f, _type: 'feed' })), ...filteredDigests.map(d => ({ ...d, _type: 'digest' }))]
                  .sort((a, b) => {
                    if (sortBy === 'top') return ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0));
                    if (sortBy === 'popular') return (b.added_count || 0) - (a.added_count || 0);
                    return new Date(b.created_date) - new Date(a.created_date);
                  })
                  .map(item => (
                    <DirectoryCard
                      key={`${item._type}-${item.id}`}
                      item={item}
                      itemType={item._type}
                      user={user}
                      votingKey={votingKey}
                      onVote={handleVote}
                      onAdd={handleAdd}
                      addedItems={addedItems}
                      isSelected={selectedItems[`${item._type}-${item.id}`]}
                      onToggleSelect={toggleSelectItem}
                    />
                  ))}
                  </div>
                  )}
                  </TabsContent>

                  <TabsContent value="feeds">
                  {filteredFeeds.length === 0 ? <EmptyState search={search} /> : (
                  <div className="space-y-3">
                  {filteredFeeds.map(item => (
                  <DirectoryCard key={item.id} item={item} itemType="feed" user={user} votingKey={votingKey} onVote={handleVote} onAdd={handleAdd} addedItems={addedItems} isSelected={selectedItems[`feed-${item.id}`]} onToggleSelect={toggleSelectItem} />
                  ))}
                  </div>
                  )}
                  </TabsContent>

                  <TabsContent value="digests">
                  {filteredDigests.length === 0 ? <EmptyState search={search} /> : (
                  <div className="space-y-3">
                  {filteredDigests.map(item => (
                  <DirectoryCard key={item.id} item={item} itemType="digest" user={user} votingKey={votingKey} onVote={handleVote} onAdd={handleAdd} addedItems={addedItems} isSelected={selectedItems[`digest-${item.id}`]} onToggleSelect={toggleSelectItem} />
                  ))}
                  </div>
                  )}
                  </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function EmptyState({ search }) {
   return (
     <div className="text-center py-16">
       <Globe className="w-10 h-10 text-stone-700 mx-auto mb-3" />
       <p className="text-stone-500 text-sm">
         {search ? `No results for "${search}"` : 'Nothing shared yet — be the first!'}
       </p>
     </div>
   );
 }