import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PremiumGate({ feature = 'Publications' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-[hsl(var(--primary))]/10 rounded-2xl flex items-center justify-center mb-4">
        <Crown className="w-8 h-8 text-[hsl(var(--primary))]" />
      </div>
      <h2 className="text-xl font-bold text-stone-100 mb-2">{feature} is a Premium Feature</h2>
      <p className="text-stone-500 max-w-md mb-6">
        Upgrade to Premium to create custom scoring lenses, build publications, and auto-generate social posts from your intelligence feed.
      </p>
      <Link to={createPageUrl('Pricing')}>
        <Button className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold">
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Premium
        </Button>
      </Link>
    </div>
  );
}