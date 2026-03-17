import React from 'react';
import { Clock, BookmarkPlus, BookmarkCheck, MoreVertical, ExternalLink, Star, Image as ImageIcon } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { getArticleImage, normalizeImageUrl } from '@/components/utils/imageUtils';
import ArticleSummarizeButton from './ArticleSummarizeButton';

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

  // Importance indicator: articles with AI summaries or from "must-read" sources
  const isMustRead = hasAiSummary || item.tags?.includes('must-read');

  // Extract image from article content
  const imageUrl = normalizeImageUrl(getArticleImage(item));

  return (
    <div className={`group border-b border-stone-800 transition-colors p-4 cursor-pointer ${isMustRead ? 'bg-stone-900/80 hover:bg-stone-900/60 border-l-2 border-l-[hsl(var(--primary))]' : 'hover:bg-stone-900/40'}`}>
      <div onClick={() => onExpand && onExpand(item)} className="flex gap-3">
        {/* Thumbnail */}
        {imageUrl && (
          <div className="flex-shrink-0 w-16 h-16 bg-stone-800 rounded overflow-hidden border border-stone-700/50">
            <img
              src={imageUrl}
              alt={item.title}
              className="w-full h-full object-cover"
              onError={(e) => (e.target.style.display = 'none')}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header with category and time */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isMustRead && (
                <Star className="w-3.5 h-3.5 text-[hsl(var(--primary))] flex-shrink-0 fill-[hsl(var(--primary))]" title="Important article" />
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
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-stone-100 mb-2 line-clamp-2 group-hover:text-[hsl(var(--primary))] transition-colors leading-snug">
            {decodeHtml(item.title)}
          </h3>
        </div>
      </div>

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
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-stone-800/50">
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
  );
}