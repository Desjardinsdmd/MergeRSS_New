import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Check, X, Clock, Send, ChevronDown, ChevronUp,
  MessageSquare, Eye, Heart, Repeat2, Bookmark, Loader2, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  draft: 'bg-amber-900/30 text-amber-400',
  approved: 'bg-blue-900/30 text-blue-400',
  scheduled: 'bg-purple-900/30 text-purple-400',
  posted: 'bg-green-900/30 text-green-400',
  rejected: 'bg-stone-700 text-stone-400',
  failed: 'bg-red-900/30 text-red-400',
  archived: 'bg-stone-800 text-stone-500',
};

export default function PostReviewCard({ post, onUpdate }) {
  const [expanded, setExpanded] = useState(post.status === 'draft');
  const [selectedVariant, setSelectedVariant] = useState(post.chosen_variant_index ?? 0);
  const [editContent, setEditContent] = useState(null);
  const [scheduledFor, setScheduledFor] = useState(post.scheduled_for || '');
  const [notes, setNotes] = useState(post.human_notes || '');
  const [acting, setActing] = useState(false);

  const variants = post.draft_variants || [];
  const metrics = post.engagement_metrics;

  const handleApprove = async () => {
    setActing(true);
    const content = editContent || variants[selectedVariant]?.content || [];
    await base44.entities.PublicationPost.update(post.id, {
      status: 'approved', chosen_variant_index: selectedVariant,
      final_content: content, human_notes: notes,
    });
    toast.success('Post approved');
    setActing(false);
    onUpdate();
  };

  const handleSchedule = async () => {
    if (!scheduledFor) { toast.error('Pick a date/time'); return; }
    setActing(true);
    const content = editContent || variants[selectedVariant]?.content || [];
    await base44.entities.PublicationPost.update(post.id, {
      status: 'scheduled', chosen_variant_index: selectedVariant,
      final_content: content, scheduled_for: scheduledFor, human_notes: notes,
    });
    toast.success('Post scheduled');
    setActing(false);
    onUpdate();
  };

  const handleReject = async () => {
    setActing(true);
    await base44.entities.PublicationPost.update(post.id, { status: 'rejected', human_notes: notes });
    toast.success('Post rejected');
    setActing(false);
    onUpdate();
  };

  const handlePost = async () => {
    setActing(true);
    const res = await base44.functions.invoke('postToX', { post_id: post.id });
    if (res.data?.success) {
      toast.success('Posted to X!');
    } else {
      toast.error(res.data?.error || 'Post failed');
    }
    setActing(false);
    onUpdate();
  };

  return (
    <div className="border border-stone-800 rounded-lg bg-stone-900 overflow-hidden">
      {/* Header */}
      <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-stone-800/50 transition"
        onClick={() => setExpanded(!expanded)}>
        <Badge className={STATUS_STYLES[post.status] || 'bg-stone-700 text-stone-400'}>
          {post.status}
        </Badge>
        <span className="flex-1 text-sm font-medium text-stone-200 truncate">
          {variants[0]?.content?.[0]?.slice(0, 80) || post.selection_reason || 'Draft post'}
        </span>
        <span className="text-xs text-stone-600">{new Date(post.created_date).toLocaleDateString()}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-stone-800">
          {/* Selection Reason */}
          {post.selection_reason && (
            <div className="pt-3">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Why this story</p>
              <p className="text-sm text-stone-400">{post.selection_reason}</p>
            </div>
          )}

          {/* Variants */}
          {variants.length > 0 && (
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Draft Variants</p>
              <div className="grid gap-3">
                {variants.map((v, i) => (
                  <button key={i}
                    className={cn(
                      "text-left p-3 rounded-lg border transition",
                      selectedVariant === i ? "border-[hsl(var(--primary))] bg-stone-800" : "border-stone-700 bg-stone-800/50 hover:border-stone-600"
                    )}
                    onClick={() => { setSelectedVariant(i); setEditContent(null); }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">{v.label}</Badge>
                      {selectedVariant === i && <Check className="w-3 h-3 text-[hsl(var(--primary))]" />}
                      <span className="text-xs text-stone-600">{v.content?.length === 1 ? 'Single post' : `${v.content?.length}-post thread`}</span>
                    </div>
                    {(v.content || []).map((text, ti) => (
                      <p key={ti} className="text-sm text-stone-300 mb-1">{text}</p>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Edit content */}
          {post.status === 'draft' && (
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Edit Content</p>
              {(editContent || variants[selectedVariant]?.content || []).map((text, i) => (
                <Textarea key={i} value={editContent ? editContent[i] : text}
                  onChange={e => {
                    const updated = [...(editContent || variants[selectedVariant]?.content || [])];
                    updated[i] = e.target.value;
                    setEditContent(updated);
                  }}
                  rows={3} className="bg-stone-800 border-stone-700 text-stone-100 text-sm mb-2" />
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="text-stone-500 text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..." className="bg-stone-800 border-stone-700 text-stone-100 text-sm" />
          </div>

          {/* Engagement metrics for posted items */}
          {post.status === 'posted' && metrics && (
            <div className="flex flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-sm text-stone-400">
                <Eye className="w-4 h-4" /> {metrics.impressions?.toLocaleString() || 0}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-stone-400">
                <Heart className="w-4 h-4" /> {metrics.likes || 0}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-stone-400">
                <Repeat2 className="w-4 h-4" /> {metrics.reposts || 0}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-stone-400">
                <MessageSquare className="w-4 h-4" /> {metrics.replies || 0}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-stone-400">
                <Bookmark className="w-4 h-4" /> {metrics.bookmarks || 0}
              </div>
            </div>
          )}

          {/* Error */}
          {post.status === 'failed' && post.error_message && (
            <p className="text-sm text-red-400 bg-red-900/20 p-2 rounded">{post.error_message}</p>
          )}

          {/* Actions */}
          {post.status === 'draft' && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm" onClick={handleApprove} disabled={acting}
                className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
                {acting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                Approve
              </Button>
              <div className="flex items-center gap-2">
                <Input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className="bg-stone-800 border-stone-700 text-stone-100 text-sm w-auto" />
                <Button size="sm" variant="outline" onClick={handleSchedule} disabled={acting}>
                  <Clock className="w-4 h-4 mr-1" /> Schedule
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={handleReject} disabled={acting}
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20">
                <X className="w-4 h-4 mr-1" /> Reject
              </Button>
            </div>
          )}

          {post.status === 'approved' && (
            <div className="flex gap-3 pt-2">
              <Button size="sm" onClick={handlePost} disabled={acting}
                className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
                {acting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Post Now
              </Button>
            </div>
          )}

          {post.status === 'failed' && (
            <div className="flex gap-3 pt-2">
              <Button size="sm" onClick={async () => {
                setActing(true);
                await base44.entities.PublicationPost.update(post.id, { status: 'approved', error_message: '' });
                const res = await base44.functions.invoke('postToX', { post_id: post.id });
                if (res.data?.success) {
                  toast.success('Posted to X!');
                } else {
                  toast.error(res.data?.error || 'Post failed again');
                }
                setActing(false);
                onUpdate();
              }} disabled={acting}
                className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
                {acting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                Retry Post
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}