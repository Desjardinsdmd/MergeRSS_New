import React from 'react';
import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function BookmarkBell({ user }) {
  const { data: bookmarks = [] } = useQuery({
    queryKey: ['bookmarks-unread', user?.email],
    queryFn: () => base44.entities.Bookmark.filter({ created_by: user?.email }, '-created_date', 200),
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const unread = bookmarks.filter(b => !b.is_read).length;

  return (
    <Link
      to={createPageUrl('Bookmarks')}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-white/[0.05] hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
      aria-label={unread > 0 ? `Saved stories, ${unread} unread` : 'Saved stories'}
    >
      <Bookmark className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-400 px-1 font-mono text-[10px] font-semibold leading-none text-stone-950">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}