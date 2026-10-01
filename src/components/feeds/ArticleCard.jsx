import React, { useState, useEffect } from 'react';
import { Clock, BookmarkPlus, BookmarkCheck, ExternalLink, Star, Image as ImageIcon, Zap } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { getArticleImage, normalizeImageUrl } from '@/components/utils/imageUtils';
import { calculateReadTime, getFaviconUrl, getPublicationName } from '@/components/utils/articleUtils';
import ArticleSummarizeButton from './ArticleSummarizeButton';
import ArticleVisualBadge from './ArticleVisualBadge';
import { base44 } from '@/api/base44Client';

export default function ArticleCard({
  item,
  onExpand,
  onMarkAsRead,
  onBookmark,
  isBookmarked,
  showBookmark = true,
  onSummaryUpdate,
}) {
  const [fetchedImage, setFetchedImage] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [aiVisualUrl, setAiVisualUrl] = useState(null);
  const [aiVisualScore, setAiVisualScore] = useState(null);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const hasAiSummary = item.ai_summary && item.ai_summary.trim();
  const isMustRead = hasAiSummary || item.tags?.includes('must-read');

  // Extract image from article content
  let imageUrl = normalizeImageUrl(getArticleImage(item));

  // If no image in RSS, fetch from article URL
  useEffect(() => {
    if (imageUrl || !item.url || isLoadingImage) return;

    const fetchImage = async () => {
      setIsLoadingImage(true);
      try {
        const response = await base44.functions.invoke('extractImageFromUrl', { url: item.url });
        if (response.data?.imageUrl) {
          setFetchedImage(response.data.imageUrl);
        }
      } catch (error) {
        // Silently fail
      } finally {
        setIsLoadingImage(false);
      }
    };

    // Debounce slightly to avoid hammering on load
    const timer = setTimeout(fetchImage, 100);
    return () => clearTimeout(timer);
  }, [item.url, imageUrl]);

  // Only promote AI visual to thumbnail if score is high enough (≥75)
  const useAiAsThumbnail = aiVisualUrl && aiVisualScore >= 75;
  imageUrl = imageUrl || fetchedImage || (useAiAsThumbnail ? aiVisualUrl : null);

  // Generate a subtle gradient background color based on title hash
  const getBackgroundColor = () => {
    let hash = 0;
    for (let i = 0; i < item.title.length; i++) {
      hash = ((hash << 5) - hash) + item.title.charCodeAt(i);
      hash = hash & hash;
    }
    const colors = [
      'from-violet-500/25 to-stone-900',
      'from-violet-600/20 to-stone-900',
      'from-stone-700 to-stone-900',
      'from-violet-400/15 to-stone-800',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const readTime = calculateReadTime(item.content || item.description);
  const faviconUrl = getFaviconUrl(item.url);
  const publicationName = getPublicationName(item.url);

  return (
    <div className={`group cursor-pointer rounded-xl border-b border-white/[0.05] p-4 transition-all duration-200 ${isMustRead ? 'bg-[hsl(var(--primary)/0.05)] hover:bg-[hsl(var(--primary)/0.08)]' : 'hover:bg-white/[0.03]'}`}>
      <div onClick={() => onExpand && onExpand(item)} className="flex gap-3">
        {/* Thumbnail */}
        <div className={`flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-br ${getBackgroundColor()}`}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.title}
              className="w-full h-full object-cover"
              onError={(e) => (e.target.style.display = 'none')}
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-white/30" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header with publication, category, time, and read time */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              {isMustRead && (
                <Star className="w-3.5 h-3.5 text-[hsl(var(--primary))] flex-shrink-0 fill-[hsl(var(--primary))]" title="Important story" aria-label="Important story" />
              )}
              {faviconUrl && (
                <img src={faviconUrl} alt={publicationName} className="w-3.5 h-3.5 rounded flex-shrink-0" onError={(e) => (e.target.style.display = 'none')} title={publicationName} />
              )}
              {item.category && (
                <span className="chip-brand flex-shrink-0">
                  {item.category}
                </span>
              )}
              <span className="meta flex flex-shrink-0 items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(item.published_date)}
              </span>
              {readTime && (
                <span className="meta flex flex-shrink-0 items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {readTime}m
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="mb-2 line-clamp-2 font-sans text-[15px] font-semibold leading-snug tracking-normal text-stone-100 transition-colors group-hover:text-[#C4A5FD]">
            {decodeHtml(item.title)}
          </h3>

          {/* Inline AI Summary */}
          {hasAiSummary && (
            <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-stone-400">
              {item.ai_summary}
            </p>
          )}

          {/* Author/Source */}
          {item.author && (
            <p className="meta mb-3">
              by <span className="text-stone-400">{item.author}</span>
            </p>
          )}

          {/* Footer Actions */}
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2">
            <div className="flex-1 flex items-center gap-3">
              <ArticleSummarizeButton
                item={item}
                onSummaryUpdate={onSummaryUpdate}
                compact={true}
              />
              <ArticleVisualBadge
                item={item}
                onVisualReady={(url, score) => { setAiVisualUrl(url); setAiVisualScore(score); }}
              />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {showBookmark && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBookmark && onBookmark(item);
                  }}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark story'}
                  aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark story'}
                  className={`rounded-lg p-1.5 transition hover:bg-white/[0.05] hover:text-[#C4A5FD] ${isBookmarked ? 'text-[hsl(var(--primary))]' : 'text-stone-500'}`}
                >
                  {isBookmarked ? (
                    <BookmarkCheck className="w-3.5 h-3.5" />
                  ) : (
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              <a
                href={safeUrl(item.url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Open in new tab"
                aria-label="Open in new tab"
                className="rounded-lg p-1.5 text-stone-500 transition hover:bg-white/[0.05] hover:text-[#C4A5FD]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {onMarkAsRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsRead(item, e);
                  }}
                  title="Mark as read"
                  aria-label="Mark as read"
                  className="rounded-lg p-1.5 text-stone-500 opacity-0 transition hover:bg-white/[0.05] hover:text-[#C4A5FD] group-hover:opacity-100"
                >
                  ✓
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}