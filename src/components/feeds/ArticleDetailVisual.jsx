import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Fetches and displays the accepted AI visual for an article in full-width 16:9 format.
 * Only renders if an accepted visual exists — no placeholders, no empty space on failure.
 */
export default function ArticleDetailVisual({ articleId }) {
  const [visual, setVisual] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!articleId) return;

    let cancelled = false;

    const fetchVisual = async () => {
      try {
        const results = await base44.entities.ArticleVisual.filter({
          article_id: articleId,
          final_outcome: 'accepted',
        });
        if (!cancelled && results?.length > 0) {
          // Use the most recent accepted visual
          const latest = results.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
          if (latest.image_url) {
            setVisual(latest);
          }
        }
      } catch {
        // Silent — article renders normally
      }
    };

    fetchVisual();
    return () => { cancelled = true; };
  }, [articleId]);

  if (!visual) return null;

  const caption = visual.visual_spec?.caption || visual.visual_spec?.core_visual_idea || null;

  return (
    <div className="mb-5">
      {/* 16:9 container */}
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <img
          src={visual.image_url}
          alt={caption || 'Article visual'}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setVisual(null)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        {!loaded && (
          <div className="absolute inset-0 bg-stone-800 animate-pulse" />
        )}
      </div>
      {caption && (
        <p className="mt-2 text-xs text-stone-500 italic leading-relaxed px-0.5">
          {caption}
        </p>
      )}
    </div>
  );
}