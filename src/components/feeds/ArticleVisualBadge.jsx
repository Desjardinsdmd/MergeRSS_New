import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function ArticleVisualBadge({ item, onVisualReady }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // null | 'running' | 'accepted' | 'rejected'
  const [imageUrl, setImageUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  // Visual generation is admin-only on the backend; hide the control for everyone else.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { base44.auth.me().then(u => setIsAdmin(u?.role === 'admin')).catch(() => {}); }, []);

  const hidden = !isAdmin;

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

  if (hidden) return null;

  if (status === 'accepted' && imageUrl) {
    return (
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowPreview(!showPreview); }}
          className="flex items-center gap-1 font-mono text-[11px] text-emerald-400 transition hover:opacity-80"
          title="View AI visual"
          aria-expanded={showPreview}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <Eye className="w-3 h-3" />
          <span>Visual</span>
        </button>
        {showPreview && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-white/10 shadow-2xl"
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
      <div className="flex items-center gap-1 font-mono text-[11px] text-stone-500">
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
            <span className="flex cursor-default select-none items-center gap-1 font-mono text-[11px] text-stone-500">
              <XCircle className="w-3 h-3 text-stone-500" />
              <span>No visual</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] rounded-xl border border-white/10 bg-stone-950 text-xs text-stone-300">
            This story's content isn't suitable for an illustrative visual
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      onClick={handleGenerate}
      className="flex items-center gap-1 font-mono text-[11px] text-stone-500 transition hover:text-[#C4A5FD]"
      title="Generate AI visual for this story"
    >
      <Sparkles className="w-3 h-3" />
      <span>Visual</span>
    </button>
  );
}