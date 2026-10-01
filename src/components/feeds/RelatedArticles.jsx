import React, { useMemo } from 'react';
import { ExternalLink, Clock, Zap } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { getArticleImage, normalizeImageUrl } from '@/components/utils/imageUtils';
import { calculateReadTime, getFaviconUrl } from '@/components/utils/articleUtils';

function extractKeywords(text = '') {
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','has','have','had','that','this',
    'it','its','as','by','from','will','can','than','then','not',
    'he','she','they','we','you','i','up','out','about','into',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
}

function scoreRelated(current, candidates) {
  const currentWords = new Set(extractKeywords(`${current.title} ${current.description || ''}`));
  return candidates
    .filter(c => c.id !== current.id)
    .map(c => {
      const words = extractKeywords(`${c.title} ${c.description || ''}`);
      const overlap = words.filter(w => currentWords.has(w)).length;
      const categoryBonus = c.category === current.category ? 3 : 0;
      return { ...c, _score: overlap + categoryBonus };
    })
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
}

export default function RelatedArticles({ currentItem, allItems }) {
  const related = useMemo(
    () => scoreRelated(currentItem, allItems),
    [currentItem, allItems]
  );

  if (related.length === 0) return null;

  return (
    <div className="mt-5 border-t border-white/[0.07] pt-4">
      <h4 className="micro-label mb-3">Related stories</h4>
      <div className="space-y-2.5">
        {related.map(item => {
           const imageUrl = normalizeImageUrl(getArticleImage(item));
           const readTime = calculateReadTime(item.content || item.description);
           const faviconUrl = getFaviconUrl(item.url);
           return (
             <a
               key={item.id}
               href={safeUrl(item.url)}
               target="_blank"
               rel="noopener noreferrer"
               className="group -mx-2 flex items-start gap-2.5 rounded-xl p-2 transition-all duration-200 hover:bg-white/[0.04]"
             >
               {imageUrl && (
                 <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.04]">
                   <img
                     src={imageUrl}
                     alt={item.title}
                     className="w-full h-full object-cover"
                     onError={(e) => (e.target.style.display = 'none')}
                   />
                 </div>
               )}
               <div className="flex-1 min-w-0">
                 <p className="line-clamp-2 text-sm font-semibold text-stone-100 transition-colors group-hover:text-[#C4A5FD]">
                   {decodeHtml(item.title)}
                 </p>
                 <div className="meta mt-0.5 flex flex-wrap items-center gap-2">
                   {faviconUrl && (
                     <img src={faviconUrl} alt="publication" className="w-3 h-3 rounded" onError={(e) => (e.target.style.display = 'none')} />
                   )}
                   <Clock className="w-3 h-3" />
                   {item.published_date
                     ? new Date(item.published_date).toLocaleDateString()
                     : ''}
                   {readTime && (
                     <>
                       <Zap className="w-3 h-3" />
                       {readTime}m
                     </>
                   )}
                   {item.category && (
                     <span className="chip-brand normal-case tracking-normal">{item.category}</span>
                   )}
                 </div>
               </div>
               <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stone-500 transition-colors group-hover:text-[#C4A5FD]" />
             </a>
           );
         })}
      </div>
    </div>
  );
}