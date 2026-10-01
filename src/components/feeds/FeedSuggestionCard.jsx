import React from 'react';
import { Plus, Check, ExternalLink, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { safeUrl } from '@/components/utils/htmlUtils';

export default function FeedSuggestionCard({ feed, onAdd, added, adding }) {
  const relevance = Math.round(feed.relevance_score || 7);
  const barWidth = `${(relevance / 10) * 100}%`;

  return (
    <div className={cn(
      "rounded-2xl border p-5 backdrop-blur-xl transition-all",
      added
        ? "border-emerald-400/25 bg-emerald-400/[0.06]"
        : "border-white/[0.07] bg-white/[0.025] hover:border-[hsl(var(--primary)/0.4)] hover:bg-white/[0.04]"
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-[15px] font-semibold text-stone-100">{feed.name}</h3>
            {feed.category && (
              <span className="chip-brand">
                {feed.category}
              </span>
            )}
          </div>
          <a
            href={safeUrl(feed.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate font-mono text-[11px] text-stone-500 transition hover:text-[#C4A5FD]"
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
            "flex-shrink-0 h-8 px-3 rounded-xl text-xs font-medium transition",
            added
              ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/10"
              : "btn-brand"
          )}
        >
          {added ? (
            <><Check className="w-3 h-3 mr-1" /> Added</>
          ) : adding ? (
            <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <><Plus className="w-3 h-3 mr-1" /> Add source</>
          )}
        </Button>
      </div>

      <p className="text-sm text-stone-400 mb-3 leading-relaxed">{feed.description}</p>

      {feed.relevance_reason && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="micro-label">Relevance</span>
            <span className="font-mono text-[10px] font-semibold text-[#C4A5FD]">{relevance}/10</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full bg-[hsl(var(--primary))] rounded-full transition-all"
              style={{ width: barWidth }}
            />
          </div>
          <p className="text-[11px] text-stone-500 mt-1">{feed.relevance_reason}</p>
        </div>
      )}

      {feed.tags?.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-stone-500 flex-shrink-0" />
          {feed.tags.map((tag) => (
            <span key={tag} className="chip-neutral">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}