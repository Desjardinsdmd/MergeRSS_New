import React, { useState } from 'react';
import DigestComments from '@/components/digests/DigestComments';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  Pause,
  Play,
  Zap,
  Clock,
  MessageCircle,
  Inbox,
  ChevronDown,
  Globe,
  Mail,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

const channelTile = 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.04] text-stone-400';

export default function DigestCard({ digest, onEdit, onDelete, onToggleStatus, onSendTest, onMakePublic, isSending }) {
  const [showComments, setShowComments] = useState(false);
  const [ran, setRan] = useState(false);

  const handleRunNow = async () => {
    await onSendTest(digest);
    setRan(true);
  };
  const frequencyLabel = digest.frequency === 'daily' ? 'Daily' : 'Weekly';

  return (
    <article className={cn(
      'panel panel-hover flex flex-col p-5',
      digest.status === 'paused' && 'opacity-70'
    )}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.05] flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-stone-300" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-sans text-[15px] font-semibold leading-snug tracking-normal text-stone-100 truncate">{digest.name}</h3>
              {digest.description && (
                <p className="text-sm text-stone-400 mt-0.5 line-clamp-1">
                  {digest.description}
                </p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-1 rounded-lg text-stone-400 hover:text-stone-100" aria-label="Briefing options menu" title="More options">
                  <MoreVertical className="w-4 h-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(digest)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMakePublic?.(digest)}>
                  <Globe className="w-4 h-4 mr-2" />
                  {digest.is_public ? 'Make private' : 'Make public'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSendTest(digest)} disabled={isSending}>
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Run now
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleStatus(digest)}>
                  {digest.status === 'active' ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Activate
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(digest)}
                  className="text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Categories */}
      {digest.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4" role="list" aria-label="Briefing categories">
          {digest.categories.slice(0, 3).map((cat, idx) => (
            <span key={`${cat}-${idx}`} className="chip-brand" role="listitem">
              {cat}
            </span>
          ))}
          {digest.categories.length > 3 && (
            <span className="chip-neutral" role="listitem" title={`Plus ${digest.categories.length - 3} more categories`}>
              +{digest.categories.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Schedule & delivery */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-stone-400">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" />
          {frequencyLabel} at <span className="font-mono text-[13px] text-stone-300">{digest.schedule_time || '09:00'}</span>
          {digest.status === 'paused' && (
            <span className="ml-1 rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400">Paused</span>
          )}
        </span>

        <div className="flex items-center gap-1" aria-label="Delivery channels">
          {digest.delivery_web && (
            <span className={channelTile} title="Inbox">
              <Inbox className="w-3 h-3" aria-hidden="true" />
              <span className="sr-only">Inbox</span>
            </span>
          )}
          {digest.delivery_email && (
            <span className={channelTile} title="Email">
              <Mail className="w-3 h-3" aria-hidden="true" />
              <span className="sr-only">Email</span>
            </span>
          )}
          {digest.delivery_slack && (
            <span className={channelTile} title="Slack">
              <svg className="w-3 h-3 fill-current" aria-hidden="true" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">
                      <path d="M27.2 80c0 7.5-6.1 13.6-13.6 13.6S0 87.5 0 80c0-7.5 6.1-13.6 13.6-13.6h13.6V80zm6.8 0c0-7.5 6.1-13.6 13.6-13.6 7.5 0 13.6 6.1 13.6 13.6v34c0 7.5-6.1 13.6-13.6 13.6-7.5 0-13.6-6.1-13.6-13.6V80z"/>
                      <path d="M47 27.2c-7.5 0-13.6-6.1-13.6-13.6S39.5 0 47 0c7.5 0 13.6 6.1 13.6 13.6v13.6H47zm0 6.8c7.5 0 13.6 6.1 13.6 13.6 0 7.5-6.1 13.6-13.6 13.6H13c-7.5 0-13.6-6.1-13.6-13.6 0-7.5 6.1-13.6 13.6-13.6h34z"/>
                    </svg>
              <span className="sr-only">Slack</span>
            </span>
          )}
          {digest.delivery_discord && (
            <span className={channelTile} title="Discord">
              <svg className="w-3 h-3 fill-current" aria-hidden="true" viewBox="0 0 127 96" xmlns="http://www.w3.org/2000/svg">
                      <path d="M107.7 8.07A105.2 105.2 0 0 0 83 0a72.6 72.6 0 0 0-3.36 6.83 97.7 97.7 0 0 0-29.3 0A72.6 72.6 0 0 0 47 0a105.2 105.2 0 0 0-24.7 8.07 106.3 106.3 0 0 0-16.6 64.3c0 .46 0 .92.05 1.38a105.2 105.2 0 0 0 32.2 16.3 74.1 74.1 0 0 0 6.44-10.6 69.4 69.4 0 0 1-10.2-4.9c.86-.6 1.7-1.23 2.5-1.88 19.8 9.2 41.2 9.2 60.8 0 .8.65 1.64 1.27 2.5 1.88a69.4 69.4 0 0 1-10.2 4.9 74.1 74.1 0 0 0 6.44 10.6 105.2 105.2 0 0 0 32.2-16.3c.03-.46.05-.92.05-1.38a106.3 106.3 0 0 0-16.6-64.3zM42.8 52.3c-5.8 0-10.6-5.3-10.6-11.8 0-6.5 4.7-11.8 10.6-11.8 5.9 0 10.6 5.3 10.6 11.8 0 6.5-4.7 11.8-10.6 11.8zm40.8 0c-5.8 0-10.6-5.3-10.6-11.8 0-6.5 4.7-11.8 10.6-11.8 5.9 0 10.6 5.3 10.6 11.8 0 6.5-4.7 11.8-10.6 11.8z"/>
                    </svg>
              <span className="sr-only">Discord</span>
            </span>
          )}
        </div>
      </div>

      {(digest.consecutive_skips > 0 || digest.auto_adjustment_note) && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-400" role="status">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="space-y-0.5">
            {digest.consecutive_skips > 0 && (
              <p>Not sent for the last <span className="font-mono">{digest.consecutive_skips}</span> scheduled {digest.consecutive_skips === 1 ? 'slot' : 'slots'}{digest.last_skip_reason ? `: ${digest.last_skip_reason}` : ''}.</p>
            )}
            {digest.auto_adjustment_note && <p className="text-amber-400/80">{digest.auto_adjustment_note}</p>}
          </div>
        </div>
      )}

      {/* Last sent + Run now */}
      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          {digest.last_sent ? (
            <p className="meta normal-case tracking-normal">
              Last sent: {new Date(digest.last_sent).toLocaleString()}
            </p>
          ) : <span className="meta normal-case tracking-normal">Not sent yet</span>}
          <button
            type="button"
            onClick={handleRunNow}
            disabled={isSending || ran}
            className={cn(
              ran
                ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-300'
                : 'btn-soft',
              (isSending || ran) && 'opacity-70 cursor-not-allowed'
            )}
            aria-label={isSending ? 'Running briefing' : ran ? 'Briefing sent successfully' : 'Run briefing now'}
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ran ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {isSending ? 'Running…' : ran ? 'Sent' : 'Run now'}
          </button>
        </div>

        {/* Toggle comments */}
        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 mt-3 rounded-md px-1 -ml-1 text-xs font-medium text-stone-400 hover:text-[hsl(var(--primary))] transition"
          aria-expanded={showComments}
          aria-label={`${showComments ? 'Hide' : 'Show'} discussion comments`}
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          Discussion
          <ChevronDown className={cn('w-3 h-3 transition-transform', showComments && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>

      {showComments && <DigestComments digestId={digest.id} />}
    </article>
  );
}
