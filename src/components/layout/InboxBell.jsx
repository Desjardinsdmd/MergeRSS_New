import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function InboxBell({ user }) {
  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }),
    enabled: !!user,
    staleTime: 60000,
  });

  const digestIds = digests.map(d => d.id);

  const { data: deliveries = [] } = useQuery({
    queryKey: ['deliveries', 'web', user?.email, digestIds.join(',')],
    queryFn: () => base44.entities.DigestDelivery.filter(
      { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent' },
      '-created_date',
      200
    ),
    enabled: !!user && digestIds.length > 0,
    refetchInterval: 60000,
  });

  const unread = deliveries.filter(d => !d.is_read).length;

  return (
    <Link
      to={createPageUrl('Inbox')}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-white/[0.05] hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
      aria-label={unread > 0 ? `Inbox, ${unread} unread briefings` : 'Inbox'}
    >
      <Mail className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-400 px-1 font-mono text-[10px] font-semibold leading-none text-stone-950">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}