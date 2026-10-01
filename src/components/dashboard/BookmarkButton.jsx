import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';

export default function BookmarkButton({ item, className = '' }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (saved || loading) return;
    setLoading(true);
    try {
      await base44.entities.Bookmark.create({
        feed_item_id: item.id,
        title: item.title,
        url: item.url,
        description: item.description || '',
        category: item.category || '',
        published_date: item.published_date || '',
        is_read: false,
      });
      setSaved(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBookmark}
      title={saved ? 'Saved' : 'Save for later'}
      aria-label={saved ? 'Saved to Inbox' : 'Save for later'}
      aria-pressed={saved}
      className={`rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] ${
        saved
          ? 'bg-[hsl(var(--brand)/0.16)] text-brand-light'
          : 'text-stone-500 hover:bg-white/[0.05] hover:text-stone-200'
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : saved ? (
        <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Bookmark className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );
}