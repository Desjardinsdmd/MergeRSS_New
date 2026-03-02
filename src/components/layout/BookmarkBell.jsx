import React from 'react';
import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function BookmarkBell({ user }) {
  const { data: bookmarks = [] } = useQuery({
    queryKey: ['bookmarks-unread', user?.email],
    queryFn: () => base44.entities.Bookmark.list('-created_date', 200),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const unread = bookmarks.filter(b => !b.is_read).length;

  return (
    <Link
      to={createPageUrl('Bookmarks')}
      className="relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition"
    >
      <Bookmark className="w-5 h-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}