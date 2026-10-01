import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText } from 'lucide-react';

export default function DigestDeliveryHistory({ digests }) {
  const digestIds = digests.map(d => d.id);
  const { data: deliveries = [] } = useQuery({
    queryKey: ['recent-deliveries', digestIds.join(',')],
    queryFn: () => base44.entities.DigestDelivery.filter(
      { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent' },
      '-sent_at',
      5
    ),
    enabled: digestIds.length > 0,
  });

  if (deliveries.length === 0) return null;

  const digestMap = Object.fromEntries(digests.map(d => [d.id, d.name]));

  return (
    <div className="panel overflow-hidden">
      <div className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <span className="micro-label">Recent briefings</span>
        <Link to={createPageUrl('Inbox')} className="text-xs text-stone-400 hover:text-brand-light transition-colors">Inbox →</Link>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {deliveries.map(delivery => (
          <div key={delivery.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="p-1.5 rounded-lg bg-[hsl(var(--brand)/0.14)] flex-shrink-0">
              <FileText className="w-3 h-3 text-brand-light" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-300 truncate">
                {digestMap[delivery.digest_id] || 'Briefing'}
              </p>
              <p className="meta mt-0.5">
                {delivery.item_count} stories · {delivery.sent_at ? new Date(delivery.sent_at).toLocaleDateString() : ''}
              </p>
            </div>
            {!delivery.is_read && (
              <span className="chip border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 flex-shrink-0">New</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}