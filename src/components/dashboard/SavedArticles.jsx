import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2, ExternalLink, Clock, CheckCircle, RotateCcw, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { cn } from '@/lib/utils';
import StoryImage from '@/components/brand/StoryImage';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]';

/**
 * Saved stories (Bookmark entity, current user's), shown as the Inbox "Saved" tab.
 * Replaces the old Read Later page.
 */
export default function SavedArticles({ user }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('unread');
  const [sortBy, setSortBy] = useState('newest');
  const key = ['bookmarks', user?.email];

  const { data: bookmarks = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.Bookmark.filter({ created_by: user?.email }, '-created_date', 500),
    enabled: !!user?.email,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['bookmarks-unread'] });
  };

  const setRead = useMutation({
    mutationFn: ({ id, is_read }) => base44.entities.Bookmark.update(id, { is_read }),
    onMutate: async ({ id, is_read }) => {
      queryClient.setQueryData(key, (old = []) => old.map(b => (b.id === id ? { ...b, is_read } : b)));
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.Bookmark.delete(id),
    onMutate: async (id) => {
      queryClient.setQueryData(key, (old = []) => old.filter(b => b.id !== id));
    },
    onSettled: refresh,
  });

  const filtered = useMemo(() => {
    const list = filter === 'unread' ? bookmarks.filter(b => !b.is_read)
      : filter === 'read' ? bookmarks.filter(b => b.is_read)
      : bookmarks;
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_date) - new Date(b.created_date);
      if (sortBy === 'published') return new Date(b.published_date || 0) - new Date(a.published_date || 0);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [bookmarks, filter, sortBy]);

  const unread = bookmarks.filter(b => !b.is_read).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div role="radiogroup" aria-label="Filter saved stories" className="flex gap-2">
          {[['unread', `Unread (${unread})`], ['read', 'Read'], ['all', `All (${bookmarks.length})`]].map(([val, label]) => (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={filter === val}
              onClick={() => setFilter(val)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
                filter === val
                  ? 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.16)] text-stone-100'
                  : 'border-white/[0.07] text-stone-400 hover:bg-white/[0.04] hover:text-stone-100',
                FOCUS
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 rounded-xl text-sm" aria-label="Sort saved stories">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest saved</SelectItem>
              <SelectItem value="oldest">Oldest saved</SelectItem>
              <SelectItem value="published">By publish date</SelectItem>
              <SelectItem value="title">Title A to Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12" role="status">
            <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" aria-hidden="true" />
            <span className="sr-only">Loading saved stories</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Bookmark className="w-10 h-10 text-stone-600 mx-auto mb-3" aria-hidden="true" />
            <p className="font-display text-stone-100 font-semibold">{bookmarks.length ? 'Nothing here' : 'No saved stories yet'}</p>
            <p className="text-stone-400 text-sm mt-1">Tap the bookmark icon on any story to save it here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {filtered.map(b => (
              <li key={b.id} className={cn('flex items-start gap-3 px-4 py-3.5', b.is_read && 'opacity-60')}>
                <div className="relative flex-shrink-0">
                  <StoryImage src={b.image_url} source={hostOf(b.url)} alt="" size="mini" />
                  {!b.is_read && <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#100E17] bg-[hsl(var(--primary))]" aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={safeUrl(b.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => !b.is_read && setRead.mutate({ id: b.id, is_read: true })}
                    className={cn('text-sm leading-snug line-clamp-2 hover:text-brand-light rounded-sm', b.is_read ? 'text-stone-400' : 'text-stone-100 font-semibold', FOCUS)}
                  >
                    {decodeHtml(b.title)}
                  </a>
                  <div className="meta flex items-center gap-2 mt-1.5">
                    {b.category && <span className="chip-brand normal-case tracking-normal">{b.category}</span>}
                    {b.published_date && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {new Date(b.published_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={safeUrl(b.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${decodeHtml(b.title) || 'story'} in a new tab`}
                    onClick={() => !b.is_read && setRead.mutate({ id: b.id, is_read: true })}
                    className={cn('p-1.5 rounded-lg text-stone-500 hover:text-brand-light hover:bg-white/[0.05]', FOCUS)}
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setRead.mutate({ id: b.id, is_read: !b.is_read })}
                    aria-label={b.is_read ? 'Mark as unread' : 'Mark as read'}
                    title={b.is_read ? 'Mark as unread' : 'Mark as read'}
                    className={cn('p-1.5 rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-white/[0.05]', FOCUS)}
                  >
                    {b.is_read ? <RotateCcw className="w-4 h-4" aria-hidden="true" /> : <CheckCircle className="w-4 h-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(b.id)}
                    aria-label="Remove from saved"
                    title="Remove from saved"
                    className={cn('p-1.5 rounded-lg text-stone-500 hover:text-red-400 hover:bg-white/[0.05]', FOCUS)}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
