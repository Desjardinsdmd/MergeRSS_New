import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, TrendingUp, AlertTriangle, Zap, Minus, Clock, X, ExternalLink } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const TAG_COLORS = {
  Trending: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  Risk: 'border-red-400/25 bg-red-400/10 text-red-300',
  Opportunity: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  Neutral: 'border-white/10 bg-white/[0.03] text-stone-400',
};

const TAG_ICONS = {
  Trending: TrendingUp,
  Risk: AlertTriangle,
  Opportunity: Zap,
  Neutral: Minus,
};

// Shared with CandidatePipeline so the header and rows always line up.
export const CANDIDATE_GRID = 'md:grid md:grid-cols-[28px_minmax(0,1fr)_88px_64px_72px_176px] md:items-center md:gap-3';

const CHECKBOX = 'border-stone-600 data-[state=checked]:bg-[hsl(var(--brand))] data-[state=checked]:border-[hsl(var(--brand))] data-[state=checked]:text-white';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function plural(n, word, many) {
  return `${n} ${n === 1 ? word : (many || `${word}s`)}`;
}

function TagBadge({ tag }) {
  const TagIcon = TAG_ICONS[tag] || Minus;
  return (
    <Badge
      variant="secondary"
      className={cn('shrink-0 rounded-md border px-1.5 py-0 font-mono text-[10px] font-medium shadow-none hover:bg-inherit', TAG_COLORS[tag] || TAG_COLORS.Neutral)}
    >
      <TagIcon className="w-3 h-3 mr-1" />
      {tag || 'Neutral'}
    </Badge>
  );
}

function Title({ candidate, clamp }) {
  const cls = cn(
    'text-sm font-medium leading-snug text-stone-100',
    clamp ? 'line-clamp-3 break-words' : 'truncate',
  );
  if (!candidate.article_url) return <p className={cls}>{candidate.title}</p>;
  return (
    <a
      href={candidate.article_url}
      target="_blank"
      rel="noopener noreferrer"
      title={candidate.title}
      className="group flex min-w-0 items-start gap-1.5"
    >
      <span className={cn(cls, 'group-hover:text-[#C4A5FD]')}>{candidate.title}</span>
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-stone-500 opacity-60 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function Actions({ candidate, onSelect, onSkip, selecting, full }) {
  return (
    <div className={cn('flex items-center gap-2', full ? 'w-full' : 'justify-end')}>
      <Button
        size="sm"
        variant="ghost"
        disabled={selecting}
        onClick={() => onSkip?.(candidate)}
        className={cn('h-9 rounded-xl px-3 text-xs text-stone-400 hover:bg-red-400/10 hover:text-red-300', full && 'flex-1 border border-white/[0.08]')}
        title="Discard: not interested"
      >
        <X className="w-3.5 h-3.5 mr-1" /> Discard
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={selecting}
        onClick={() => onSelect(candidate)}
        className={cn('h-9 rounded-xl px-3 text-xs border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#D9C7FE] hover:bg-[hsl(var(--brand)/0.22)] hover:text-[#D9C7FE]', full && 'flex-1')}
      >
        <Send className="w-3.5 h-3.5 mr-1" /> Draft
      </Button>
    </div>
  );
}

export default function CandidateRow({ candidate, onSelect, onSkip, selecting, selected, onToggleSelect }) {
  const when = timeAgo(candidate.last_updated_at || candidate.first_seen_at);
  const domains = candidate.source_domains?.slice(0, 3).join(', ');

  return (
    <div className={cn(
      'border-b border-white/[0.06] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.03]',
      selected && 'bg-[hsl(var(--brand)/0.08)]',
    )}>
      {/* Phone and tablet: stacked card */}
      <div className="md:hidden">
        <div className="flex items-start gap-3">
          <Checkbox checked={!!selected} onCheckedChange={onToggleSelect} className={cn('mt-0.5', CHECKBOX)} aria-label="Select story" />
          <div className="min-w-0 flex-1">
            <Title candidate={candidate} clamp />
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <TagBadge tag={candidate.intelligence_tag} />
              <span className="meta inline-flex items-center gap-1 normal-case">
                <Clock className="h-3 w-3" /> {when}
              </span>
              <span className="meta whitespace-nowrap normal-case">
                {plural(candidate.source_count || 0, 'source')} · {plural(candidate.article_count || 0, 'story', 'stories')}
              </span>
            </div>
            {domains && <p className="mt-1 truncate font-mono text-[11px] text-stone-500">{domains}</p>}
          </div>
        </div>
        <div className="mt-3 pl-7">
          <Actions candidate={candidate} onSelect={onSelect} onSkip={onSkip} selecting={selecting} full />
        </div>
      </div>

      {/* Desktop: table row */}
      <div className={cn('hidden', CANDIDATE_GRID)}>
        <Checkbox checked={!!selected} onCheckedChange={onToggleSelect} className={CHECKBOX} aria-label="Select story" />
        <div className="min-w-0">
          <Title candidate={candidate} />
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <TagBadge tag={candidate.intelligence_tag} />
            {domains && <span className="truncate font-mono text-[11px] text-stone-500">{domains}</span>}
          </div>
        </div>
        <span className="flex items-center justify-center gap-1 font-mono text-[11px] text-stone-400">
          <Clock className="w-3 h-3" /> {when}
        </span>
        <div className="text-center">
          <span className="font-mono text-sm font-medium text-stone-300">{candidate.source_count}</span>
          <span className="ml-1 font-mono text-[10px] text-stone-500">src</span>
        </div>
        <div className="text-center">
          <span className="font-mono text-sm text-stone-400">{candidate.article_count}</span>
          <span className="ml-1 font-mono text-[10px] text-stone-500">{candidate.article_count === 1 ? 'story' : 'stories'}</span>
        </div>
        <Actions candidate={candidate} onSelect={onSelect} onSkip={onSkip} selecting={selecting} />
      </div>
    </div>
  );
}
