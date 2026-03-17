import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2, ExternalLink, Clock, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ArticleSummarizeButton from '@/components/feeds/ArticleSummarizeButton';

const categoryColors = {
  CRE: 'bg-stone-800 text-[hsl(var(--primary))]',
  Markets: 'bg-stone-800 text-[hsl(var(--primary))]',
  Tech: 'bg-stone-800 text-[hsl(var(--primary))]',
  News: 'bg-stone-800 text-[hsl(var(--primary))]',
  Finance: 'bg-stone-800 text-[hsl(var(--primary))]',
  Crypto: 'bg-stone-800 text-[hsl(var(--primary))]',
  AI: 'bg-stone-800 text-[hsl(var(--primary))]',
  Other: 'bg-stone-800 text-stone-400',
};

export default function Bookmarks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: bookmarks = [], isLoading } = useQuery({
    queryKey: ['bookmarks', user?.email],
    queryFn: () => base44.entities.Bookmark.filter({ created_by: user?.email }, '-created_date', 200),
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Bookmark.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.email] }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Bookmark.update(id, { is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.email] }),
  });

  const filtered = filter === 'unread'
    ? bookmarks.filter(b => !b.is_read)
    : filter === 'read'
    ? bookmarks.filter(b => b.is_read)
    : bookmarks;

  const unreadCount = bookmarks.filter(b => !b.is_read).length;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[hsl(var(--primary))] rounded-xl flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-stone-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-100">Read Later</h1>
            <p className="text-sm text-stone-500">{unreadCount} unread · {bookmarks.length} total</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'unread', 'read'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-4 py-1.5 rounded-full font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-[hsl(var(--primary))] text-stone-900'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-stone-600">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark className="w-12 h-12 text-stone-700 mx-auto mb-3" />
          <p className="text-stone-400 font-medium">No bookmarks yet</p>
          <p className="text-stone-600 text-sm mt-1">
            Tap the bookmark icon on any article to save it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bookmark) => (
            <Card
              key={bookmark.id}
              className={`border-stone-800 bg-stone-900 transition-all ${bookmark.is_read ? 'opacity-60' : 'hover:border-stone-700 hover:shadow-sm'}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                       {bookmark.category && (
                         <Badge className={`text-xs border-0 ${categoryColors[bookmark.category] || categoryColors.Other}`}>
                           {bookmark.category}
                         </Badge>
                       )}
                       {bookmark.is_read && (
                         <span className="text-xs text-stone-600">Read</span>
                       )}
                    </div>
                    <a
                      href={safeUrl(bookmark.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => !bookmark.is_read && markReadMutation.mutate(bookmark.id)}
                      className="font-medium text-stone-200 hover:text-amber-400 transition-colors text-sm leading-snug line-clamp-2 block mb-2"
                    >
                      {decodeHtml(bookmark.title)}
                    </a>
                    {bookmark.published_date && (
                      <div className="flex items-center gap-1 text-xs text-stone-600">
                        <Clock className="w-3 h-3" />
                        {new Date(bookmark.published_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={safeUrl(bookmark.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-stone-600 hover:text-amber-400 hover:bg-stone-800 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {!bookmark.is_read && (
                      <button
                        onClick={() => markReadMutation.mutate(bookmark.id)}
                        className="p-1.5 rounded-lg text-stone-600 hover:text-emerald-400 hover:bg-stone-800 transition-colors"
                        title="Mark as read"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(bookmark.id)}
                      className="p-1.5 rounded-lg text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors"
                      title="Remove bookmark"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}