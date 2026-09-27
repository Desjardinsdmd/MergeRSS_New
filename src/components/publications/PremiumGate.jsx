import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Crown } from 'lucide-react';

// Generic upgrade prompt. Lists only what Premium actually includes today.
export default function PremiumGate({ feature = 'This feature' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-[hsl(var(--primary))]/10 rounded-2xl flex items-center justify-center mb-4" aria-hidden="true">
        <Crown className="w-8 h-8 text-[hsl(var(--primary))]" />
      </div>
      <h2 className="text-xl font-bold text-stone-100 mb-2">{feature} needs Premium</h2>
      <p className="text-stone-500 max-w-md mb-6">
        Premium adds unlimited sources and briefings, delivery to Slack, Discord and Microsoft Teams,
        and weekly or monthly scheduling. $5 a month.
      </p>
      <Link
        to={createPageUrl('Pricing')}
        className="inline-flex items-center h-10 px-5 rounded-md bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0805]"
      >
        <Crown className="w-4 h-4 mr-2" aria-hidden="true" />
        See plans
      </Link>
    </div>
  );
}
