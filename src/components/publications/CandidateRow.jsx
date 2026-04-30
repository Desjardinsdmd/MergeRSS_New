import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, CheckCircle2, TrendingUp, AlertTriangle, Zap, Minus } from 'lucide-react';
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

export default function CandidateRow({ candidate, onSelect, selecting }) {
  const TagIcon = TAG_ICONS[candidate.intelligence_tag] || Minus;

  return (
    <div className={cn(
      "grid grid-cols-[1fr_80px_80px_70px_60px_100px] gap-3 items-center px-4 py-3 border-b border-stone-800 hover:bg-stone-800/50 transition",
      candidate.already_posted && "opacity-50",
      !candidate.above_threshold && "opacity-60"
    )}>
      {/* Title + meta */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-200 truncate">{candidate.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className={TAG_COLORS[candidate.intelligence_tag]} variant="secondary">
            <TagIcon className="w-3 h-3 mr-1" />
            {candidate.intelligence_tag}
          </Badge>
          <span className="text-xs text-stone-600">{candidate.source_count} src · {candidate.article_count} art</span>
          {candidate.source_domains?.length > 0 && (
            <span className="text-xs text-stone-600 truncate max-w-[150px]">
              {candidate.source_domains.slice(0, 2).join(', ')}
            </span>
          )}
          {candidate.feedback_boost > 0 && (
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-800">+{candidate.feedback_boost} boost</Badge>
          )}
        </div>
      </div>

      {/* Combined score */}
      <div className="text-center">
        <span className={cn(
          "text-sm font-bold",
          candidate.combined_score >= 60 ? "text-green-400" :
          candidate.combined_score >= 40 ? "text-amber-400" : "text-stone-500"
        )}>
          {candidate.combined_score}
        </span>
      </div>

      {/* Lens score */}
      <div className="text-center">
        <span className={cn(
          "text-sm",
          candidate.lens_score >= 60 ? "text-green-400" :
          candidate.lens_score >= 40 ? "text-amber-400" : "text-stone-500"
        )}>
          {candidate.lens_score}
        </span>
      </div>

      {/* Trend score */}
      <div className="text-center">
        <span className="text-sm text-stone-400">{candidate.trend_score || '—'}</span>
      </div>

      {/* Status */}
      <div className="text-center">
        {candidate.already_posted ? (
          <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
        ) : !candidate.above_threshold ? (
          <span className="text-xs text-stone-600">Below</span>
        ) : (
          <span className="text-xs text-green-400">Eligible</span>
        )}
      </div>

      {/* Action */}
      <div className="text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={candidate.already_posted || selecting}
          onClick={() => onSelect(candidate)}
          className="text-xs"
        >
          <Send className="w-3 h-3 mr-1" /> Draft
        </Button>
      </div>
    </div>
  );
}