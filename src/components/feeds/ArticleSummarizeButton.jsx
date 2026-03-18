import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

export default function ArticleSummarizeButton({ item, onSummaryUpdate, compact = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showSummary, setShowSummary] = useState(!!item.ai_summary);

  const handleSummarize = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Summarize the following article in 2-3 concise sentences. Focus on the key points and takeaways.\n\nTitle: ${item.title}\n\n${item.description || item.content || 'No content available.'}`,
    });
    const summary = typeof result === 'string' ? result : result?.summary || result?.text || String(result);
    await base44.entities.FeedItem.update(item.id, { ai_summary: summary });
    onSummaryUpdate?.({ ...item, ai_summary: summary });
    setShowSummary(true);
    setLoading(false);
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
          className="text-xs text-[hsl(var(--primary))]/70 hover:text-[hsl(var(--primary))] font-medium flex items-center gap-1 mt-2"
        >
          <Sparkles className="w-3 h-3" />
          {showSummary ? 'Hide' : 'Summary'}
        </button>
      );
    }
    return (
      <button
        onClick={handleSummarize}
        disabled={loading}
        className="text-xs text-stone-600 hover:text-[hsl(var(--primary))]/70 transition-colors flex items-center gap-1 mt-2 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Summarizing…
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            Summarize
          </>
        )}
      </button>
    );
  }

  if (item.ai_summary) {
    return (
      <div className="mt-2">
        <button
          onClick={toggleSummary}
          className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium"
        >
          <Sparkles className="w-3 h-3" />
          AI Summary
          {showSummary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showSummary && (
          <p className="mt-1.5 text-xs text-stone-400 bg-stone-800 px-3 py-2 border border-stone-700 leading-relaxed">
            {item.ai_summary}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleSummarize}
      disabled={loading}
      className="flex items-center gap-1 text-xs text-stone-600 hover:text-amber-400 transition-colors mt-1.5 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Sparkles className="w-3 h-3" />
      )}
      {loading ? 'Summarizing…' : 'Summarize'}
    </button>
  );
}