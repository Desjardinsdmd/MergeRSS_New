import React from 'react';
import { Plus, Check, ExternalLink, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const categoryColors = {
  CRE: 'bg-amber-950 text-amber-400 border-amber-700',
  Markets: 'bg-blue-950 text-blue-400 border-blue-700',
  Tech: 'bg-violet-950 text-violet-400 border-violet-700',
  News: 'bg-stone-800 text-stone-300 border-stone-700',
  Finance: 'bg-emerald-950 text-emerald-400 border-emerald-700',
  Crypto: 'bg-orange-950 text-orange-400 border-orange-700',
  AI: 'bg-amber-950 text-amber-400 border-amber-700',
  Other: 'bg-stone-800 text-stone-300 border-stone-700',
};

export default function FeedSuggestionCard({ feed, onAdd, added, adding }) {
  const relevance = Math.round(feed.relevance_score || 7);
  const barWidth = `${(relevance / 10) * 100}%`;

  return (
    <div className={cn(
      "border rounded-xl p-5 transition-all",
      added
        ? "border-emerald-700 bg-emerald-950/50"
        : "border-stone-700 bg-stone-900 hover:border-amber-400 hover:shadow-sm"
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-stone-100 text-sm">{feed.name}</h3>
            <Badge className={cn("text-[10px] px-1.5 py-0 border", categoryColors[feed.category] || categoryColors.Other)}>
              {feed.category}
            </Badge>
          </div>
          <a
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-stone-500 hover:text-amber-400 flex items-center gap-1 truncate transition"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{feed.url}</span>
          </a>
        </div>

        <Button
          size="sm"
          onClick={() => onAdd(feed)}
          disabled={added || adding}
          className={cn(
            "flex-shrink-0 h-8 px-3 rounded-lg text-xs font-medium transition",
            added
              ? "bg-emerald-950 text-emerald-400 hover:bg-emerald-950 border border-emerald-700"
              : "bg-amber-400 hover:bg-amber-300 text-stone-900"
          )}
        >
          {added ? (
            <><Check className="w-3 h-3 mr-1" /> Added</>
          ) : adding ? (
            <span className="w-3 h-3 border border-stone-600 border-t-stone-300 rounded-full animate-spin" />
          ) : (
            <><Plus className="w-3 h-3 mr-1" /> Add Feed</>
          )}
        </Button>
      </div>

      <p className="text-sm text-stone-400 mb-3 leading-relaxed">{feed.description}</p>

      {feed.relevance_reason && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">Relevance</span>
            <span className="text-[10px] font-semibold text-amber-400">{relevance}/10</span>
          </div>
          <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: barWidth }}
            />
          </div>
          <p className="text-[11px] text-stone-500 mt-1">{feed.relevance_reason}</p>
        </div>
      )}

      {feed.tags?.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-stone-600 flex-shrink-0" />
          {feed.tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-stone-800 text-stone-400 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}