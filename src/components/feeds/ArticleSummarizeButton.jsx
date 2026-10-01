import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { summarizeArticle } from '@/api/articles';

export default function ArticleSummarizeButton({ item, onSummaryUpdate, compact = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showSummary, setShowSummary] = useState(!!item.ai_summary);

  const handleSummarize = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError(false);
    try {
      // Backend checks the user owns this article's feed before writing the summary.
      const summary = await summarizeArticle(item.id);
      onSummaryUpdate?.({ ...item, ai_summary: summary });
      setShowSummary(true);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleSummary = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSummary(v => !v);
  };

  if (compact) {
    // Compact mode for article cards
    if (item.ai_summary) {
      return (
        <button
          onClick={toggleSummary}
          aria-expanded={showSummary}
          className="mt-2 flex items-center gap-1 font-mono text-[11px] font-medium text-[#C4A5FD]/80 hover:text-[#C4A5FD]"
        >
          <Sparkles className="w-3 h-3" />
          {showSummary ? 'Hide' : 'Summary'}
        </button>
      );
    }
    if (error) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-2 flex cursor-default select-none items-center gap-1 font-mono text-[11px] text-stone-500">
                <XCircle className="w-3 h-3 text-stone-500" />
                <span>Summary failed</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] rounded-xl border border-white/10 bg-stone-950 text-xs text-stone-300">
              Could not generate summary — try again later
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <button
        onClick={handleSummarize}
        disabled={loading}
        className="mt-2 flex items-center gap-1 font-mono text-[11px] text-stone-500 transition-colors hover:text-[#C4A5FD] disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 className="w-3 h-3 animate-spin" />Summarizing…</>
        ) : (
          <><Sparkles className="w-3 h-3" />Summarize</>
        )}
      </button>
    );
  }

  if (item.ai_summary) {
    return (
      <div className="mt-2">
        <button
          onClick={toggleSummary}
          aria-expanded={showSummary}
          className="flex items-center gap-1 font-mono text-[11px] font-medium text-[#C4A5FD] hover:text-[#D9C7FE]"
        >
          <Sparkles className="w-3 h-3" />
          AI summary
          {showSummary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showSummary && (
          <p className="panel-raised mt-1.5 px-3 py-2 text-[13px] leading-relaxed text-stone-300">
            {item.ai_summary}
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mt-1.5 flex cursor-default select-none items-center gap-1 font-mono text-[11px] text-stone-500">
              <XCircle className="w-3 h-3 text-stone-500" />
              <span>Summary failed</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] rounded-xl border border-white/10 bg-stone-950 text-xs text-stone-300">
            Could not generate summary — try again later
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      onClick={handleSummarize}
      disabled={loading}
      className="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-stone-500 transition-colors hover:text-[#C4A5FD] disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      {loading ? 'Summarizing…' : 'Summarize'}
    </button>
  );
}