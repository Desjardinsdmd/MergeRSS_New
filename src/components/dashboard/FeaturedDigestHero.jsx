import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, ArrowRight, Clock } from 'lucide-react';

export default function FeaturedDigestHero({ digests }) {
  const digestIds = digests.map(d => d.id);

  const { data: latestDeliveries = [] } = useQuery({
    queryKey: ['featured-digest', digestIds.join(',')],
    queryFn: () =>
      digestIds.length > 0
        ? base44.entities.DigestDelivery.filter(
            { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent' },
            '-created_date',
            5
          )
        : Promise.resolve([]),
    enabled: digestIds.length > 0,
    staleTime: 300000,
  });

  const today = latestDeliveries.find(d => {
    const deliveryDate = new Date(d.created_date).toLocaleDateString();
    const todayDate = new Date().toLocaleDateString();
    return deliveryDate === todayDate;
  });

  if (!today || !today.items || today.items.length === 0) {
    return null;
  }

  const itemCount = today.items.length;
  const readTimeMin = Math.ceil(itemCount / 3);

  return (
    <div className="mb-8 bg-gradient-to-br from-stone-800/60 to-stone-900/40 border border-[hsl(var(--primary))]/30 p-6 lg:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-[hsl(var(--primary))]/10 rounded">
              <FileText className="w-4 h-4 text-[hsl(var(--primary))]" />
            </div>
            <h3 className="text-sm font-semibold text-[hsl(var(--primary))]">TODAY'S BRIEFING</h3>
          </div>
          <h2 className="text-2xl lg:text-3xl font-bold text-stone-100 mb-1">
            {itemCount} key articles
          </h2>
          <p className="text-stone-400 text-sm flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {readTimeMin} minute read
          </p>
        </div>
        <Link to={createPageUrl('Inbox')} className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/80 transition-colors">
          View digest <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-3">
        {today.items.slice(0, 4).map((item, idx) => (
          <div key={idx} className="bg-stone-900/60 border border-stone-800/50 hover:border-stone-700 transition p-3 lg:p-4 group cursor-pointer">
            <h4 className="font-semibold text-stone-100 text-sm line-clamp-1 group-hover:text-[hsl(var(--primary))] transition-colors mb-1">
              {item.title}
            </h4>
            {item.description && (
              <p className="text-xs text-stone-400 line-clamp-1">
                {item.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {itemCount > 4 && (
        <div className="mt-4 pt-4 border-t border-stone-800/50">
          <p className="text-xs text-stone-500">
            +{itemCount - 4} more articles in today's digest
          </p>
        </div>
      )}
    </div>
  );
}