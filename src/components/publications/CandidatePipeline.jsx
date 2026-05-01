import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, RefreshCw, Search, Filter, BarChart3, TrendingUp, ArrowUpDown, CheckSquare, Square, X, Send } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import CandidateRow from './CandidateRow';

export default function CandidatePipeline({ publicationId }) {
  const [tagFilter, setTagFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [selecting, setSelecting] = useState(false);
  const [confirmCandidate, setConfirmCandidate] = useState(null);
  const [userNotes, setUserNotes] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const queryClient = useQueryClient();

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDiscard = async () => {
    setBulkActing(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      const c = candidates.find(x => x.id === id);
      if (c) {
        await base44.functions.invoke('skipCluster', {
          publication_id: publicationId,
          cluster_id: id,
          cluster_title: c.title,
        });
      }
    }
    toast.info(`Discarded ${ids.length} stories`);
    setSelectedIds(new Set());
    setBulkActing(false);
    queryClient.invalidateQueries({ queryKey: ['pub-candidates'] });
  };

  const handleBulkDraft = async () => {
    setBulkActing(true);
    const ids = [...selectedIds];
    let success = 0;
    for (const id of ids) {
      const res = await base44.functions.invoke('manualSelectCluster', {
        publication_id: publicationId,
        cluster_id: id,
        user_notes: '',
      });
      if (res.data?.success) success++;
    }
    toast.success(`Created ${success} drafts`);
    setSelectedIds(new Set());
    setBulkActing(false);
    queryClient.invalidateQueries({ queryKey: ['pub-candidates'] });
    queryClient.invalidateQueries({ queryKey: ['pub-posts'] });
  };

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['pub-candidates', publicationId, sortBy],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPublicationCandidates', {
        publication_id: publicationId, limit: 50, sort: sortBy,
      });
      return res.data;
    },
    enabled: !!publicationId,
    staleTime: 60000,
  });

  const candidates = data?.candidates || [];

  // Filters
  const filtered = candidates.filter(c => {
    if (tagFilter !== 'all' && c.intelligence_tag !== tagFilter) return false;
    if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const fbStats = data?.feedback_stats || {};

  const handleSkip = async (candidate) => {
    await base44.functions.invoke('skipCluster', {
      publication_id: publicationId,
      cluster_id: candidate.id,
      cluster_title: candidate.title,
    });
    toast.info('Skipped — noted for learning');
    queryClient.invalidateQueries({ queryKey: ['pub-candidates'] });
  };

  const handleSelect = async () => {
    if (!confirmCandidate) return;
    setSelecting(true);
    const res = await base44.functions.invoke('manualSelectCluster', {
      publication_id: publicationId,
      cluster_id: confirmCandidate.id,
      user_notes: userNotes,
    });
    if (res.data?.success) {
      toast.success('Draft created — check the Inbox');
      queryClient.invalidateQueries({ queryKey: ['pub-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['pub-posts'] });
    } else {
      toast.error(res.data?.error || 'Failed to create draft');
    }
    setSelecting(false);
    setConfirmCandidate(null);
    setUserNotes('');
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-stone-500" />
          <span className="text-sm text-stone-400">
            {data?.total_clusters || 0} stories in the last 24h
          </span>
        </div>
        {fbStats.manual_selects > 0 && (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-800">
            <TrendingUp className="w-3 h-3 mr-1" />
            {fbStats.manual_selects} picks · {fbStats.skips || 0} skips (learning)
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search stories..."
            className="pl-9 bg-stone-800 border-stone-700 text-stone-100 text-sm"
          />
        </div>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-36 bg-stone-800 border-stone-700 text-stone-100 text-sm">
            <Filter className="w-3 h-3 mr-1 text-stone-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            <SelectItem value="Trending">Trending</SelectItem>
            <SelectItem value="Risk">Risk</SelectItem>
            <SelectItem value="Opportunity">Opportunity</SelectItem>
            <SelectItem value="Neutral">Neutral</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36 bg-stone-800 border-stone-700 text-stone-100 text-sm">
            <ArrowUpDown className="w-3 h-3 mr-1 text-stone-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="sources">Most Sources</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg">
          <span className="text-sm text-stone-300 font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" disabled={bulkActing}
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-stone-500 hover:text-stone-200">
            Clear
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkActing}
            onClick={handleBulkDiscard}
            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30">
            {bulkActing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <X className="w-3.5 h-3.5 mr-1" />}
            Discard All
          </Button>
          <Button size="sm" variant="outline" disabled={bulkActing}
            onClick={handleBulkDraft}
            className="text-xs border-amber-800/50 text-amber-400 hover:bg-amber-950/30">
            {bulkActing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Draft All
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="border-stone-800 bg-stone-900 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[32px_1fr_100px_80px_80px_140px] gap-3 items-center px-4 py-2 border-b border-stone-700 bg-stone-800/50">
          <Checkbox
            checked={filtered.length > 0 && selectedIds.size === filtered.length}
            onCheckedChange={toggleAll}
            className="border-stone-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
          />
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Story</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">When</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">Sources</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">Articles</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-right">Action</span>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-stone-500 text-sm">
              No new stories in the last 24 hours. Check back after your next feed fetch.
            </div>
          ) : (
            filtered.map(c => (
              <CandidateRow
                key={c.id}
                candidate={c}
                selecting={selecting || bulkActing}
                selected={selectedIds.has(c.id)}
                onToggleSelect={() => toggleSelect(c.id)}
                onSelect={setConfirmCandidate}
                onSkip={handleSkip}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmCandidate} onOpenChange={() => { setConfirmCandidate(null); setUserNotes(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate draft from this cluster?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-stone-300">"{confirmCandidate?.title}"</p>
              <p className="text-stone-500 text-sm">
                {confirmCandidate?.source_count} sources · {confirmCandidate?.article_count} articles · {confirmCandidate?.intelligence_tag}
              </p>
              <p className="text-stone-500 text-sm">
                This will create a draft post. Your pick helps the system learn your preferences over time.
              </p>
              <Input
                value={userNotes}
                onChange={e => setUserNotes(e.target.value)}
                placeholder="Why are you selecting this? (optional — helps the system learn)"
                className="bg-stone-800 border-stone-700 text-stone-100 text-sm"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSelect} disabled={selecting}
              className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
              {selecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Generate Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}