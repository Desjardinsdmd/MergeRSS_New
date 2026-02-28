import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Inbox, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DigestDeliveryHistory({ digests }) {
  const { data: deliveries = [] } = useQuery({
    queryKey: ['recent-deliveries'],
    queryFn: () => base44.entities.DigestDelivery.list('-sent_at', 5),
    enabled: digests.length > 0,
  });

  if (deliveries.length === 0) return null;

  const digestMap = Object.fromEntries(digests.map(d => [d.id, d.name]));

  return (
    <Card className="border-slate-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Recent Deliveries</CardTitle>
        <Link to={createPageUrl('Inbox')} className="text-xs text-indigo-600 hover:underline">Inbox →</Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {deliveries.map(delivery => (
            <div key={delivery.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="p-1.5 bg-indigo-50 rounded-lg flex-shrink-0">
                <FileText className="w-3 h-3 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {digestMap[delivery.digest_id] || 'Digest'}
                </p>
                <p className="text-xs text-slate-400">
                  {delivery.item_count} articles • {delivery.sent_at ? new Date(delivery.sent_at).toLocaleDateString() : ''}
                </p>
              </div>
              {!delivery.is_read && (
                <Badge className="bg-indigo-100 text-indigo-700 text-xs flex-shrink-0">New</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}