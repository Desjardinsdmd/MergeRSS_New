import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import {
  Search, Rss, FileText, ArrowUp, ArrowDown,
  Users, Filter, Globe, Plus, Loader2
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

const CATEGORIES = ['All', 'CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];

const categoryColors = {
  CRE: 'bg-blue-100 text-blue-700',
  Markets: 'bg-green-100 text-green-700',
  Tech: 'bg-purple-100 text-purple-700',
  News: 'bg-orange-100 text-orange-700',
  Finance: 'bg-emerald-100 text-emerald-700',
  Crypto: 'bg-yellow-100 text-yellow-700',
  AI: 'bg-pink-100 text-pink-700',
  Other: 'bg-slate-100 text-slate-700',
};

function VoteButtons({ item, itemType, user, votes, onVote }) {
  const myVote = votes?.find(v => v.item_id === item.id && v.voter_email === user?.email);
  const score = (item.upvotes || 0) - (item.downvotes || 0);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => onVote(item, itemType, 'up')}
        disabled={!user}
        className={cn(
          'p-1 rounded transition',
          myVote?.vote === 'up'
            ? 'text-indigo-600'
            : 'text-slate-300 hover:text-indigo-500',
          !user && 'opacity-40 cursor-not-allowed'
        )}
        title={user ? 'Upvote' : 'Sign in to vote'}
      >
        <ArrowUp className="w-4 h-4" />
      </button>
      <span className={cn(
        'text-xs font-bold leading-none',
        score > 0 ? 'text-indigo-600' : score < 0 ? 'text-red-500' : 'text-slate-400'
      )}>
        {score}
      </span>
      <button
        onClick={() => onVote(item, itemType, 'down')}
        disabled={!user}
        className={cn(
          'p-1 rounded transition',
          myVote?.vote === 'down'
            ? 'text-red-500'
            : 'text-slate-300 hover:text-red-400',
          !user && 'opacity-40 cursor-not-allowed'
        )}
        title={user ? 'Downvote' : 'Sign in to vote'}
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  );
}

function DirectoryCard({ item, itemType, user, votes, onVote, onAdd, addedItems }) {
  const [adding, setAdding] = React.useState(false);
  const Icon = itemType === 'feed' ? Rss : FileText;
  const isOwner = item.created_by === user?.email;
  const isAdded = addedItems?.includes(item.id);
  
  const handleAddClick = async () => {
    setAdding(true);
    await onAdd(item, itemType);
    setAdding(false);
  };
  
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 flex gap-4 hover:shadow-sm transition">
      <VoteButtons item={item} itemType={itemType} user={user} votes={votes} onVote={onVote} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate">{item.name}</h3>
              {item.category && (
                <Badge className={cn('text-[10px] mt-0.5', categoryColors[item.category] || categoryColors.Other)}>
                  {item.category}
                </Badge>
              )}
            </div>
          </div>
          {isOwner ? (
            <Badge variant="outline" className="text-xs h-7 px-2.5 flex-shrink-0">
              Your {itemType}
            </Badge>
          ) : isAdded ? (
            <Badge variant="outline" className="text-xs h-7 px-2.5 flex-shrink-0 bg-green-50 text-green-700 border-green-200">
              ✓ Added
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={handleAddClick}
              disabled={!user || adding}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs h-7 px-2.5 flex-shrink-0"
              title={user ? undefined : 'Sign in to add'}
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
          <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
            {item.public_description || item.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
          {item.frequency && (
            <span className="capitalize">{item.frequency}</span>
          )}
          {item.tags?.length > 0 && item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="bg-slate-50 px-1.5 py-0.5 rounded">#{tag}</span>
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
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('top');
  const [addedItems, setAddedItems] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await base44.auth.me());
    });
  }, []);

  const { data: publicFeeds = [] } = useQuery({
    queryKey: ['public-feeds'],
    queryFn: async () => {
      const userPublic = await base44.entities.Feed.filter({ is_public: true });
      const directoryFeeds = await base44.entities.DirectoryFeed.list();
      return [...userPublic, ...directoryFeeds];
    },
  });

  const { data: publicDigests = [] } = useQuery({
    queryKey: ['public-digests'],
    queryFn: () => base44.entities.Digest.filter({ is_public: true }),
  });

  // Show public items to everyone (including creators)
  const directoryFeeds = publicFeeds;
  const directoryDigests = publicDigests;

  const { data: votes = [] } = useQuery({
    queryKey: ['directory-votes', user?.email],
    queryFn: () => base44.entities.DirectoryVote.filter({ voter_email: user?.email }),
    enabled: !!user?.email,
  });

  const filterAndSort = (items) => {
    let filtered = items.filter(item => {
      const matchSearch = !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.public_description || item.description || '').toLowerCase().includes(search.toLowerCase());
      const matchCat = category === 'All' || item.category === category;
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

  const handleVote = async (item, itemType, voteType) => {
    if (!user) return;
    const existing = votes.find(v => v.item_id === item.id && v.voter_email === user.email);

    if (existing) {
      if (existing.vote === voteType) {
        // Undo vote
        await base44.entities.DirectoryVote.delete(existing.id);
        const entity = itemType === 'feed' ? base44.entities.Feed : base44.entities.Digest;
        await entity.update(item.id, {
          upvotes: Math.max(0, (item.upvotes || 0) - (voteType === 'up' ? 1 : 0)),
          downvotes: Math.max(0, (item.downvotes || 0) - (voteType === 'down' ? 1 : 0)),
        });
      } else {
        // Change vote
        await base44.entities.DirectoryVote.update(existing.id, { vote: voteType });
        const entity = itemType === 'feed' ? base44.entities.Feed : base44.entities.Digest;
        await entity.update(item.id, {
          upvotes: (item.upvotes || 0) + (voteType === 'up' ? 1 : -1),
          downvotes: (item.downvotes || 0) + (voteType === 'down' ? 1 : -1),
        });
      }
    } else {
      await base44.entities.DirectoryVote.create({ item_id: item.id, item_type: itemType, vote: voteType, voter_email: user.email });
      const entity = itemType === 'feed' ? base44.entities.Feed : base44.entities.Digest;
      await entity.update(item.id, {
        upvotes: (item.upvotes || 0) + (voteType === 'up' ? 1 : 0),
        downvotes: (item.downvotes || 0) + (voteType === 'down' ? 1 : 0),
      });
    }

    queryClient.invalidateQueries({ queryKey: ['public-feeds'] });
    queryClient.invalidateQueries({ queryKey: ['public-digests'] });
    queryClient.invalidateQueries({ queryKey: ['directory-votes', user?.email] });
  };

  const handleAdd = async (item, itemType) => {
    if (!user) return;
    if (itemType === 'feed') {
      await base44.entities.Feed.create({
        name: item.name,
        url: item.url,
        category: item.category,
        tags: item.tags || [],
        status: 'active',
        item_count: 0,
        sourced_from_directory: true,
      });
      await base44.entities.Feed.update(item.id, { added_count: (item.added_count || 0) + 1 });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['public-feeds'] });
      toast.success(`"${item.name}" added to your feeds!`);
    } else {
      await base44.entities.Digest.create({
        name: item.name,
        description: item.description,
        categories: item.categories || [],
        frequency: item.frequency,
        schedule_time: item.schedule_time,
        output_length: item.output_length,
        delivery_web: true,
        status: 'active',
      });
      await base44.entities.Digest.update(item.id, { added_count: (item.added_count || 0) + 1 });
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      queryClient.invalidateQueries({ queryKey: ['public-digests'] });
      toast.success(`"${item.name}" added to your digests!`);
    }
  };

  const filteredFeeds = filterAndSort(directoryFeeds);
  const filteredDigests = filterAndSort(directoryDigests);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-full text-xs text-indigo-600 font-medium mb-4">
            <Globe className="w-3.5 h-3.5" />
            Public Directory
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-3">
            Discover Feeds & Digests
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto mb-8">
            Browse community-shared RSS feeds and curated digests. Vote on your favorites and add them to your library in one click.
          </p>

          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search feeds and digests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl border-slate-200 bg-white shadow-sm"
            />
          </div>

          {!user && (
            <p className="text-xs text-slate-400 mt-3">
              <button
                onClick={() => base44.auth.redirectToLogin(createPageUrl('Directory'))}
                className="text-indigo-600 hover:underline"
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
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 text-xs w-32 rounded-lg">
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
                      votes={votes}
                      onVote={handleVote}
                      onAdd={handleAdd}
                    />
                  ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="feeds">
            {filteredFeeds.length === 0 ? <EmptyState search={search} /> : (
              <div className="space-y-3">
                {filteredFeeds.map(item => (
                  <DirectoryCard key={item.id} item={item} itemType="feed" user={user} votes={votes} onVote={handleVote} onAdd={handleAdd} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="digests">
            {filteredDigests.length === 0 ? <EmptyState search={search} /> : (
              <div className="space-y-3">
                {filteredDigests.map(item => (
                  <DirectoryCard key={item.id} item={item} itemType="digest" user={user} votes={votes} onVote={handleVote} onAdd={handleAdd} />
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
      <Globe className="w-10 h-10 text-slate-200 mx-auto mb-3" />
      <p className="text-slate-500 text-sm">
        {search ? `No results for "${search}"` : 'Nothing shared yet — be the first!'}
      </p>
    </div>
  );
}