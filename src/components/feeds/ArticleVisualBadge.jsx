import React, { useState } from 'react';
import { Sparkles, Loader2, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function ArticleVisualBadge({ item, onVisualReady }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // null | 'running' | 'accepted' | 'rejected'
  const [imageUrl, setImageUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerate = async (e) => {
    e.stopPropagation();
    if (loading || status) return;

    setLoading(true);
    setStatus('running');

    try {
      const response = await base44.functions.invoke('visualIntelligence', {
        article_id: item.id,
        title: item.title,
        content: item.content || item.description || item.ai_summary || '',
        url: item.url
      });

      const result = response?.data?.result;
      if (result?.final_outcome === 'accepted' && result?.image_url) {
        setImageUrl(result.image_url);
        setStatus('accepted');
        onVisualReady && onVisualReady(result.image_url, result.visual_value_score);
      } else {
        setStatus('rejected');
      }
    } catch (err) {
      setStatus('rejected');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'accepted' && imageUrl) {
    return (
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowPreview(!showPreview); }}
          className="flex items-center gap-1 text-xs text-green-500 hover:opacity-80 transition"
          title="View AI visual"
        >
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          <Eye className="w-3 h-3" />
          <span>Visual</span>
        </button>
        {showPreview && (
          <div
            className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded overflow-hidden shadow-2xl border border-stone-700"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={imageUrl} alt="AI-generated visual" className="w-full h-auto" />
          </div>
        )}
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="flex items-center gap-1 text-xs text-stone-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Generating...</span>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-xs text-stone-600 cursor-default select-none">
              <XCircle className="w-3 h-3 text-stone-600" />
              <span>No visual</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-stone-950 border border-stone-700 text-stone-300 text-xs max-w-[200px]">
            This article's content isn't suitable for an illustrative visual
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      onClick={handleGenerate}
      className="flex items-center gap-1 text-xs text-stone-600 hover:text-[hsl(var(--primary))] transition"
      title="Generate AI visual for this article"
    >
      <Sparkles className="w-3 h-3" />
      <span>Visual</span>
    </button>
  );
}