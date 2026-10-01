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

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CandidateRow({ candidate, onSelect, onSkip, selecting, selected, onToggleSelect }) {
  const TagIcon = TAG_ICONS[candidate.intelligence_tag] || Minus;

  return (
    <div className={cn(
      "grid grid-cols-[32px_1fr_100px_80px_80px_140px] gap-3 items-center px-4 py-3 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.03] transition",
      selected && "bg-[hsl(var(--brand)/0.08)]"
    )}>
      {/* Checkbox */}
      <Checkbox
        checked={!!selected}
        onCheckedChange={onToggleSelect}
        className="border-stone-600 data-[state=checked]:bg-[hsl(var(--brand))] data-[state=checked]:border-[hsl(var(--brand))] data-[state=checked]:text-white"
      />
      {/* Title + meta */}
      <div className="min-w-0">
        {candidate.article_url ? (
          <a
            href={candidate.article_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-stone-200 hover:text-[#C4A5FD] truncate flex items-center gap-1.5 group"
            title={candidate.article_url}
          >
            <span className="truncate">{candidate.title}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ) : (
          <p className="text-sm font-medium text-stone-200 truncate">{candidate.title}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className={cn('rounded-md border px-1.5 py-0 font-mono text-[10px] font-medium shadow-none hover:bg-inherit', TAG_COLORS[candidate.intelligence_tag] || TAG_COLORS.Neutral)} variant="secondary">
            <TagIcon className="w-3 h-3 mr-1" />
            {candidate.intelligence_tag}
          </Badge>
          {candidate.source_domains?.length > 0 && (
            <span className="font-mono text-[11px] text-stone-500 truncate max-w-[200px]">
              {candidate.source_domains.slice(0, 3).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Recency */}
      <div className="text-center">
        <span className="font-mono text-[11px] text-stone-400 flex items-center justify-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(candidate.last_updated_at || candidate.first_seen_at)}
        </span>
      </div>

      {/* Sources */}
      <div className="text-center">
        <span className="font-mono text-sm font-medium text-stone-300">{candidate.source_count}</span>
        <span className="font-mono text-[10px] text-stone-500 ml-1">src</span>
      </div>

      {/* Articles */}
      <div className="text-center">
        <span className="font-mono text-sm text-stone-400">{candidate.article_count}</span>
        <span className="font-mono text-[10px] text-stone-500 ml-1">stories</span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={selecting}
          onClick={() => onSkip?.(candidate)}
          className="rounded-xl text-xs text-stone-500 hover:text-red-300 hover:bg-red-400/10 px-2"
          title="Discard — not interested"
        >
          <X className="w-3.5 h-3.5 mr-0.5" /> Discard
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={selecting}
          onClick={() => onSelect(candidate)}
          className="rounded-xl text-xs border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#D9C7FE] hover:bg-[hsl(var(--brand)/0.22)] hover:text-[#D9C7FE]"
        >
          <Send className="w-3 h-3 mr-1" /> Draft
        </Button>
      </div>
    </div>
  );
}