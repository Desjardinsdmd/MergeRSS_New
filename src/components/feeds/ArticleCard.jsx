import React, { useState, useEffect } from 'react';
import { Clock, BookmarkPlus, BookmarkCheck, MoreVertical, ExternalLink, Star, Image as ImageIcon, Zap } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { getArticleImage, normalizeImageUrl } from '@/components/utils/imageUtils';
import { calculateReadTime, getFaviconUrl, getPublicationName } from '@/components/utils/articleUtils';
import ArticleSummarizeButton from './ArticleSummarizeButton';
import ArticleVisualBadge from './ArticleVisualBadge';
import { base44 } from '@/api/base44Client';

const categoryColors = {
  CRE: 'bg-blue-950 text-blue-300',
  Markets: 'bg-green-950 text-green-300',
  Tech: 'bg-purple-950 text-purple-300',
  News: 'bg-orange-950 text-orange-300',
  Finance: 'bg-emerald-950 text-emerald-300',
  Crypto: 'bg-yellow-950 text-yellow-300',
  AI: 'bg-pink-950 text-pink-300',
  Other: 'bg-stone-800 text-stone-400',
};

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

  imageUrl = imageUrl || fetchedImage;

  // Generate a subtle gradient background color based on title hash
  const getBackgroundColor = () => {
    let hash = 0;
    for (let i = 0; i < item.title.length; i++) {
      hash = ((hash << 5) - hash) + item.title.charCodeAt(i);
      hash = hash & hash;
    }
    const colors = [
      'from-blue-900 to-blue-800',
      'from-purple-900 to-purple-800',
      'from-green-900 to-green-800',
      'from-amber-900 to-amber-800',
      'from-pink-900 to-pink-800',
      'from-indigo-900 to-indigo-800',
      'from-cyan-900 to-cyan-800',
      'from-rose-900 to-rose-800',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const readTime = calculateReadTime(item.content || item.description);
  const faviconUrl = getFaviconUrl(item.url);
  const publicationName = getPublicationName(item.url);

  return (
    <div className={`group border-b border-stone-800 transition-all duration-200 p-4 cursor-pointer ${isMustRead ? 'bg-stone-900/80 hover:bg-stone-800/80 border-l-2 border-l-[hsl(var(--primary))] hover:shadow-lg hover:shadow-[hsl(var(--primary))]/10' : 'hover:bg-stone-900/60 hover:shadow-md'}`}>
      <div onClick={() => onExpand && onExpand(item)} className="flex gap-3">
        {/* Thumbnail */}
        <div className={`flex-shrink-0 w-24 h-24 bg-gradient-to-br ${getBackgroundColor()} rounded overflow-hidden border border-stone-700/50 flex items-center justify-center`}>
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
                <Star className="w-3.5 h-3.5 text-[hsl(var(--primary))] flex-shrink-0 fill-[hsl(var(--primary))]" title="Important article" />
              )}
              {faviconUrl && (
                <img src={faviconUrl} alt={publicationName} className="w-3.5 h-3.5 rounded flex-shrink-0" onError={(e) => (e.target.style.display = 'none')} title={publicationName} />
              )}
              {item.category && (
                <span className={`text-xs font-medium px-2 py-1 rounded flex-shrink-0 ${categoryColors[item.category] || categoryColors.Other}`}>
                  {item.category}
                </span>
              )}
              <span className="text-xs text-stone-500 flex-shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(item.published_date)}
              </span>
              {readTime && (
                <span className="text-xs text-stone-500 flex-shrink-0 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {readTime}m
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-stone-100 mb-2 line-clamp-2 group-hover:text-[hsl(var(--primary))] transition-colors leading-snug">
            {decodeHtml(item.title)}
          </h3>

          {/* Inline AI Summary */}
          {hasAiSummary && (
            <p className="text-xs text-stone-400 mb-3 line-clamp-2 leading-relaxed italic border-l-2 border-[hsl(var(--primary))]/30 pl-2">
              {item.ai_summary}
            </p>
          )}

          {/* Author/Source */}
          {item.author && (
            <p className="text-xs text-stone-500 mb-3">
              by <span className="font-medium text-stone-400">{item.author}</span>
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-stone-800/50 mt-3 -mx-4 px-4 py-2">
            <div className="flex-1">
              <ArticleSummarizeButton
                item={item}
                onSummaryUpdate={onSummaryUpdate}
                compact={true}
              />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {showBookmark && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBookmark && onBookmark(item);
                  }}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
                  className="p-1.5 text-stone-600 hover:text-[hsl(var(--primary))] hover:bg-stone-800 rounded transition"
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
                className="p-1.5 text-stone-600 hover:text-[hsl(var(--primary))] hover:bg-stone-800 rounded transition"
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
                  className="p-1.5 text-stone-600 hover:text-[hsl(var(--primary))] hover:bg-stone-800 rounded transition opacity-0 group-hover:opacity-100"
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