import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Inbox, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
    <div className="bg-stone-900 border border-stone-800">
      <div className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <span className="text-sm font-semibold text-stone-200">Recent Deliveries</span>
        <Link to={createPageUrl('Inbox')} className="text-xs text-stone-500 hover:text-amber-400 transition-colors">Inbox →</Link>
      </div>
      <div className="divide-y divide-stone-800">
        {deliveries.map(delivery => (
          <div key={delivery.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="p-1.5 bg-stone-800 flex-shrink-0">
              <FileText className="w-3 h-3 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-300 truncate">
                {digestMap[delivery.digest_id] || 'Digest'}
              </p>
              <p className="text-xs text-stone-600">
                {delivery.item_count} articles • {delivery.sent_at ? new Date(delivery.sent_at).toLocaleDateString() : ''}
              </p>
            </div>
            {!delivery.is_read && (
              <span className="bg-amber-400 text-stone-900 text-xs font-bold px-1.5 py-0.5 flex-shrink-0">New</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}