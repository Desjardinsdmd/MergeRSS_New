import React from 'react';
import { Plus, Check, ExternalLink, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const categoryColors = {
  CRE: 'bg-amber-50 text-amber-700 border-amber-200',
  Markets: 'bg-blue-50 text-blue-700 border-blue-200',
  Tech: 'bg-violet-50 text-violet-700 border-violet-200',
  News: 'bg-slate-50 text-slate-700 border-slate-200',
  Finance: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Crypto: 'bg-orange-50 text-orange-700 border-orange-200',
  AI: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Other: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function FeedSuggestionCard({ feed, onAdd, added, adding }) {
  const relevance = Math.round(feed.relevance_score || 7);
  const barWidth = `${(relevance / 10) * 100}%`;

  return (
    <div className={cn(
      "border rounded-xl p-5 transition-all",
      added
        ? "border-emerald-200 bg-emerald-50/50"
        : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm"
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 text-sm">{feed.name}</h3>
            <Badge className={cn("text-[10px] px-1.5 py-0 border", categoryColors[feed.category] || categoryColors.Other)}>
              {feed.category}
            </Badge>
          </div>
          <a
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 truncate transition"
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
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          )}
        >
          {added ? (
            <><Check className="w-3 h-3 mr-1" /> Added</>
          ) : adding ? (
            <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <><Plus className="w-3 h-3 mr-1" /> Add Feed</>
          )}
        </Button>
      </div>

      <p className="text-sm text-slate-500 mb-3 leading-relaxed">{feed.description}</p>

      {feed.relevance_reason && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Relevance</span>
            <span className="text-[10px] font-semibold text-indigo-600">{relevance}/10</span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all"
              style={{ width: barWidth }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{feed.relevance_reason}</p>
        </div>
      )}

      {feed.tags?.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-slate-300 flex-shrink-0" />
          {feed.tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}