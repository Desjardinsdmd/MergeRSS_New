import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, CheckCircle2, TrendingUp, AlertTriangle, Zap, Minus, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TAG_COLORS = {
  Trending: 'bg-blue-900/30 text-blue-400',
  Risk: 'bg-red-900/30 text-red-400',
  Opportunity: 'bg-green-900/30 text-green-400',
  Neutral: 'bg-stone-700 text-stone-400',
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

export default function CandidateRow({ candidate, onSelect, onSkip, selecting }) {
  const TagIcon = TAG_ICONS[candidate.intelligence_tag] || Minus;

  return (
    <div className={cn(
      "grid grid-cols-[1fr_100px_80px_80px_100px] gap-3 items-center px-4 py-3 border-b border-stone-800 hover:bg-stone-800/50 transition",
      candidate.already_posted && "opacity-40"
    )}>
      {/* Title + meta */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-200 truncate">{candidate.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className={TAG_COLORS[candidate.intelligence_tag]} variant="secondary">
            <TagIcon className="w-3 h-3 mr-1" />
            {candidate.intelligence_tag}
          </Badge>
          {candidate.source_domains?.length > 0 && (
            <span className="text-xs text-stone-600 truncate max-w-[200px]">
              {candidate.source_domains.slice(0, 3).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Recency */}
      <div className="text-center">
        <span className="text-xs text-stone-400 flex items-center justify-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(candidate.last_updated_at || candidate.first_seen_at)}
        </span>
      </div>

      {/* Sources */}
      <div className="text-center">
        <span className="text-sm font-medium text-stone-300">{candidate.source_count}</span>
        <span className="text-xs text-stone-600 ml-1">src</span>
      </div>

      {/* Articles */}
      <div className="text-center">
        <span className="text-sm text-stone-400">{candidate.article_count}</span>
        <span className="text-xs text-stone-600 ml-1">art</span>
      </div>

      {/* Action */}
      <div className="text-right">
        {candidate.already_posted ? (
          <span className="text-xs text-stone-600 flex items-center justify-end gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Posted
          </span>
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={selecting}
              onClick={() => onSkip?.(candidate)}
              className="text-xs text-stone-500 hover:text-red-400 px-2"
              title="Skip — not interested"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selecting}
              onClick={() => onSelect(candidate)}
              className="text-xs"
            >
              <Send className="w-3 h-3 mr-1" /> Draft
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}