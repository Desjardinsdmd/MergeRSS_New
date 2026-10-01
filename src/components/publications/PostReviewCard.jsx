import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Check, X, Clock, Send, ChevronDown, ChevronUp,
  Loader2, RotateCcw, Copy,
  Pencil, Sparkles, Save
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MicroLabel } from '@/components/brand/Brand';

// Semantic status chips: violet = awaiting review, sky = in flight, emerald = done, red = failed.
const STATUS_STYLES = {
  draft: 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#C4A5FD]',
  approved: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  scheduled: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  posted: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  rejected: 'border-white/10 bg-white/[0.03] text-stone-400',
  failed: 'border-red-400/25 bg-red-400/10 text-red-300',
  archived: 'border-white/10 text-stone-500',
};

const CHIP = 'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider';
const FIELD = 'rounded-xl border-white/10 bg-stone-800 text-sm text-stone-100';

export default function PostReviewCard({ post, onUpdate }) {
  const [expanded, setExpanded] = useState(post.status === 'draft');
  const [selectedVariant, setSelectedVariant] = useState(post.chosen_variant_index ?? 0);
  const [editContent, setEditContent] = useState(null);
  const [scheduledFor, setScheduledFor] = useState(post.scheduled_for || '');
  const [notes, setNotes] = useState(post.human_notes || '');
  const [acting, setActing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [revising, setRevising] = useState(false);

  const variants = post.draft_variants || [];

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

  const handleMarkPosted = async () => {
    setActing(true);
    const content = editContent || variants[selectedVariant]?.content || [];
    await base44.entities.PublicationPost.update(post.id, {
      status: 'posted', chosen_variant_index: selectedVariant,
      final_content: content, posted_at: new Date().toISOString(),
      human_notes: notes || 'Manually posted',
    });
    toast.success('Marked as posted');
    setActing(false);
    onUpdate();
  };

  const handleSaveEdit = async () => {
    if (!editContent) return;
    setActing(true);
    const updatedVariants = [...variants];
    updatedVariants[selectedVariant] = { ...updatedVariants[selectedVariant], content: editContent };
    await base44.entities.PublicationPost.update(post.id, {
      draft_variants: updatedVariants,
      final_content: editContent,
      human_notes: notes,
    });
    toast.success('Content saved');
    setActing(false);
    setIsEditing(false);
    onUpdate();
  };

  const handleRevise = async () => {
    if (!revisionFeedback.trim()) { toast.error('Enter your feedback first'); return; }
    setRevising(true);
    const res = await base44.functions.invoke('reviseDraft', {
      post_id: post.id,
      feedback: revisionFeedback.trim(),
    });
    if (res.data?.success) {
      toast.success('Drafts revised by AI');
      setRevisionFeedback('');
      setShowRevise(false);
      setEditContent(null);
    } else {
      toast.error(res.data?.error || 'Revision failed');
    }
    setRevising(false);
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
      toast.success('Saved to X Drafts');
    } else {
      toast.error(res.data?.error || 'Could not save draft');
    }
    setActing(false);
    onUpdate();
  };

  return (
    <div className="panel overflow-hidden">
      {/* Header */}
      <button className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.03]"
        onClick={() => setExpanded(!expanded)}>
        <span className={cn(CHIP, STATUS_STYLES[post.status] || STATUS_STYLES.rejected)}>
          {post.status}
        </span>
        <span className="flex-1 truncate text-sm font-medium text-stone-200">
          {variants[0]?.content?.[0]?.slice(0, 80) || post.selection_reason || 'Draft post'}
        </span>
        <span className="font-mono text-[11px] text-stone-500">{new Date(post.created_date).toLocaleDateString()}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-stone-500" /> : <ChevronDown className="h-4 w-4 text-stone-500" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4">
          {/* Selection Reason */}
          {post.selection_reason && (
            <div className="pt-3">
              <MicroLabel className="mb-1">Why this story</MicroLabel>
              <p className="text-sm text-stone-400">{post.selection_reason}</p>
            </div>
          )}

          {/* Variants */}
          {variants.length > 0 && (
            <div className={cn(!post.selection_reason && 'pt-3')}>
              <MicroLabel className="mb-2">Draft variants</MicroLabel>
              <div className="grid gap-3">
                {variants.map((v, i) => (
                  <button key={i}
                    className={cn(
                      'panel-raised p-3 text-left transition',
                      selectedVariant === i
                        ? 'border-[hsl(var(--brand)/0.6)] bg-[hsl(var(--brand)/0.08)] ring-1 ring-[hsl(var(--brand)/0.35)]'
                        : 'hover:border-white/[0.14]'
                    )}
                    onClick={() => { setSelectedVariant(i); setEditContent(null); }}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="chip-neutral">{v.label}</span>
                      {selectedVariant === i && <Check className="h-3 w-3 text-[#C4A5FD]" />}
                      <span className="font-mono text-[11px] text-stone-500">{v.content?.length === 1 ? 'Single post' : `${v.content?.length}-post thread`}</span>
                      <button
                        type="button"
                        className="ml-auto rounded-md p-1 text-stone-500 transition hover:bg-white/[0.06] hover:text-stone-200"
                        title="Copy to clipboard"
                        onClick={e => {
                          e.stopPropagation();
                          const text = (v.content || []).join('\n\n');
                          navigator.clipboard.writeText(text);
                          toast.success(`${v.label} copied to clipboard`);
                        }}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {(v.content || []).map((text, ti) => (
                      <p key={ti} className="mb-1 text-sm text-stone-300">{text}</p>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Inline Edit / Revise Controls */}
          <div className="flex items-center gap-2 pt-1">
            {!isEditing && (
              <button type="button" className="btn-ghost border-transparent px-2 py-1 text-xs"
                onClick={() => { setIsEditing(true); setEditContent(variants[selectedVariant]?.content || []); }}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            <button type="button" className="btn-ghost border-transparent px-2 py-1 text-xs" onClick={() => setShowRevise(!showRevise)}>
              <Sparkles className="h-3.5 w-3.5" /> {showRevise ? 'Cancel revise' : 'Revise with AI'}
            </button>
          </div>

          {/* Inline Editor */}
          {isEditing && (
            <div>
              <MicroLabel className="mb-2">Edit content</MicroLabel>
              {(editContent || variants[selectedVariant]?.content || []).map((text, i) => (
                <Textarea key={i} value={editContent ? editContent[i] : text}
                  onChange={e => {
                    const updated = [...(editContent || variants[selectedVariant]?.content || [])];
                    updated[i] = e.target.value;
                    setEditContent(updated);
                  }}
                  rows={3} className={cn(FIELD, 'mb-2')} />
              ))}
              <div className="flex gap-2">
                <button type="button" className="btn-soft text-xs disabled:opacity-50" onClick={handleSaveEdit} disabled={acting}>
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save changes
                </button>
                <button type="button" className="btn-ghost border-transparent text-xs"
                  onClick={() => { setIsEditing(false); setEditContent(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* AI Revision Feedback */}
          {showRevise && (
            <div className="panel-raised p-3">
              <MicroLabel className="mb-2">Revision instructions</MicroLabel>
              <Textarea value={revisionFeedback} onChange={e => setRevisionFeedback(e.target.value)}
                placeholder="Tell the AI what to change, e.g. 'Make it more concise', 'Add the dollar amount from the story', 'Make the tone less formal'"
                rows={3} className="mb-2 rounded-xl border-white/10 bg-stone-900 text-sm text-stone-100" />
              <button type="button" className="btn-soft text-xs disabled:opacity-50" onClick={handleRevise} disabled={revising}>
                {revising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {revising ? 'Revising...' : 'Generate revised drafts'}
              </button>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..." className={FIELD} />
          </div>

          {/* Error */}
          {post.status === 'failed' && post.error_message && (
            <p className="rounded-xl border border-red-400/25 bg-red-400/10 p-2.5 font-mono text-xs text-red-300">{post.error_message}</p>
          )}

          {/* Actions */}
          {post.status === 'draft' && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button type="button" className="btn-soft disabled:opacity-50" onClick={handleApprove} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve
              </button>
              <button type="button" className="btn-ghost hover:text-emerald-300 disabled:opacity-50" onClick={handleMarkPosted} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Mark as posted
              </button>
              <div className="flex items-center gap-2">
                <Input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className={cn(FIELD, 'w-auto font-mono text-xs')} />
                <button type="button" className="btn-ghost disabled:opacity-50" onClick={handleSchedule} disabled={acting}>
                  <Clock className="h-4 w-4" /> Schedule
                </button>
              </div>
              <button type="button" className="btn-ghost border-transparent hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50" onClick={handleReject} disabled={acting}>
                <X className="h-4 w-4" /> Reject
              </button>
            </div>
          )}

          {post.status === 'approved' && (
            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-brand disabled:opacity-50" onClick={handlePost} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to Drafts
              </button>
              <button type="button" className="btn-ghost hover:text-emerald-300 disabled:opacity-50" onClick={handleMarkPosted} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Mark as posted
              </button>
            </div>
          )}

          {post.status === 'failed' && (
            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-brand disabled:opacity-50" onClick={async () => {
                setActing(true);
                await base44.entities.PublicationPost.update(post.id, { status: 'approved', error_message: '' });
                const res = await base44.functions.invoke('postToX', { post_id: post.id });
                if (res.data?.success) {
                  toast.success('Saved to X Drafts');
                } else {
                  toast.error(res.data?.error || 'Could not save draft');
                }
                setActing(false);
                onUpdate();
              }} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Send to Drafts
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
