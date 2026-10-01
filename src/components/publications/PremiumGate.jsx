import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Crown } from 'lucide-react';

// Generic upgrade prompt. Lists only what Premium actually includes today.
export default function PremiumGate({ feature = 'This feature' }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)]" aria-hidden="true">
        <Crown className="h-8 w-8 text-[#C4A5FD]" />
      </div>
      <h2 className="mb-2 font-display text-xl font-semibold text-stone-100">{feature} needs Premium</h2>
      <p className="mb-6 max-w-md text-stone-400">
        Premium adds unlimited sources and briefings, delivery to Slack, Discord and Microsoft Teams,
        and weekly or monthly scheduling. $5 a month.
      </p>
      <Link to={createPageUrl('Pricing')} className="btn-brand">
        <Crown className="h-4 w-4" aria-hidden="true" />
        See plans
      </Link>
    </div>
  );
}
