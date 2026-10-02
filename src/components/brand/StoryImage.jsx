import React, { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Story thumbnail (design system v3).
 *
 * Shows the story's lead image when there is one and it loads. Otherwise a
 * branded tile with the source's initials, tinted from a small fixed palette
 * keyed on the source name, so a page of image-less stories still varies.
 *
 * Images are hotlinked from publishers: no-referrer keeps us off hotlink
 * blocklists, lazy + async decoding keeps long lists cheap.
 */

const TINTS = [
  ['#2A1F48', '#9B5CF6'], // violet
  ['#1E2547', '#818CF8'], // indigo
  ['#162E2C', '#34D399'], // emerald
  ['#2B2235', '#C4A5FD'], // lavender
  ['#1C2A3A', '#38BDF8'], // sky
  ['#33261C', '#FBBF24'], // amber
];

function hash(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(source = '') {
  const clean = String(source).replace(/^(the|www\.)\s*/i, '').replace(/\.(com|ca|org|net|co\.uk|io)$/i, '');
  const words = clean.split(/[\s\-_.:|]+/).filter(Boolean);
  if (!words.length) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const SIZES = {
  // Row thumbnail, right of the headline (Google News / Apple News pattern).
  thumb: 'h-[60px] w-[80px] sm:h-[84px] sm:w-[112px] rounded-xl',
  // Small square for dense lists (briefing contents, saved stories).
  mini: 'h-12 w-12 rounded-lg',
  // Lead story hero. Width comes from the parent.
  lead: 'aspect-[16/9] w-full rounded-xl',
};

export default function StoryImage({ src, source, alt = '', size = 'thumb', className }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImg = !!src && !failed;
  const [bg, fg] = TINTS[hash(source || alt) % TINTS.length];

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden border border-white/[0.07]', SIZES[size] || SIZES.thumb, className)}
      style={{ background: `linear-gradient(135deg, ${bg}, #15121D 78%)` }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span
            className={cn('font-display font-semibold tracking-tight', size === 'lead' ? 'text-4xl' : size === 'mini' ? 'text-sm' : 'text-lg')}
            style={{ color: fg, opacity: 0.85 }}
          >
            {initials(source || alt)}
          </span>
          <span className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${fg}55, transparent)` }} />
        </div>
      )}
      {showImg && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            // Tracking pixels and spacer images load fine but are tiny: treat as missing.
            if (e.currentTarget.naturalWidth < 60 || e.currentTarget.naturalHeight < 40) setFailed(true);
            else setLoaded(true);
          }}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </div>
  );
}
