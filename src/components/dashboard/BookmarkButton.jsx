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
      onClick={handleBookmark}
      title={saved ? 'Saved' : 'Save for later'}
      className={`p-1.5 rounded-lg transition-colors ${
        saved
          ? 'text-amber-400 bg-amber-950'
          : 'text-stone-600 hover:text-stone-400 hover:bg-stone-800'
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="w-3.5 h-3.5" />
      ) : (
        <Bookmark className="w-3.5 h-3.5" />
      )}
    </button>
  );
}