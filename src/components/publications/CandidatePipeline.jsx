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
import { Loader2, RefreshCw, Search, Filter, BarChart3, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import CandidateRow from './CandidateRow';

export default function CandidatePipeline({ publicationId }) {
  const [tagFilter, setTagFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [confirmCandidate, setConfirmCandidate] = useState(null);
  const [userNotes, setUserNotes] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['pub-candidates', publicationId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPublicationCandidates', {
        publication_id: publicationId, limit: 50,
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

  const eligibleCount = candidates.filter(c => c.above_threshold && !c.already_posted).length;
  const postedCount = candidates.filter(c => c.already_posted).length;

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
            {data?.total_with_lens || 0} scored · {eligibleCount} eligible · {postedCount} posted
          </span>
        </div>
        {data?.feedback_count > 0 && (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-800">
            <TrendingUp className="w-3 h-3 mr-1" />
            {data.feedback_count} manual selections (learning)
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
            placeholder="Search clusters..."
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
      </div>

      {/* Table */}
      <Card className="border-stone-800 bg-stone-900 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_80px_70px_60px_100px] gap-3 items-center px-4 py-2 border-b border-stone-700 bg-stone-800/50">
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Cluster</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">Score</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">Lens</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">Trend</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-center">Status</span>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wider text-right">Action</span>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-stone-500 text-sm">
              No candidates found. Run the scheduler or wait for feeds to be scored.
            </div>
          ) : (
            filtered.map(c => (
              <CandidateRow
                key={c.id}
                candidate={c}
                selecting={selecting}
                onSelect={setConfirmCandidate}
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
                Score: {confirmCandidate?.combined_score} · Lens: {confirmCandidate?.lens_score} · {confirmCandidate?.intelligence_tag}
              </p>
              <p className="text-stone-500 text-sm">
                This will create a draft post and record your selection as feedback to improve future rankings.
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