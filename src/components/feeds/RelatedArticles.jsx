import React, { useMemo } from 'react';
import { ExternalLink, Clock } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { Badge } from '@/components/ui/badge';

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
    <div className="mt-5 pt-4 border-t border-stone-800">
      <h4 className="text-sm font-semibold text-stone-200 mb-3">Related Articles</h4>
      <div className="space-y-2.5">
        {related.map(item => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 group hover:bg-stone-800 rounded-lg p-2 -mx-2 transition"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-200 line-clamp-2 group-hover:text-amber-400 transition-colors">
                {decodeHtml(item.title)}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-stone-500">
                <Clock className="w-3 h-3" />
                {item.published_date
                  ? new Date(item.published_date).toLocaleDateString()
                  : ''}
                {item.category && (
                  <Badge variant="secondary" className="text-xs py-0 bg-stone-800 text-stone-300">{item.category}</Badge>
                )}
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-stone-600 group-hover:text-amber-400 flex-shrink-0 mt-0.5 transition-colors" />
          </a>
        ))}
      </div>
    </div>
  );
}