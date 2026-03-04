import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Clock, CheckCircle2, PauseCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DigestQuickActions({ digests }) {
  if (digests.length === 0) return null;

  return (
    <div className="bg-stone-900 border border-stone-800">
      <div className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <span className="text-sm font-semibold text-stone-200">Your Digests</span>
        <Link to={createPageUrl('Digests')} className="text-xs text-stone-500 hover:text-[hsl(var(--primary))] transition-colors">Manage →</Link>
      </div>
      <div className="divide-y divide-stone-800">
        {digests.slice(0, 5).map(digest => (
          <div key={digest.id} className="flex items-center gap-3 px-4 py-2.5">
            {digest.status === 'active'
              ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--primary))] flex-shrink-0" />
              : <PauseCircle className="w-3.5 h-3.5 text-stone-700 flex-shrink-0" />
            }
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-300 truncate">{digest.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs bg-stone-800 text-stone-500 px-1.5 py-0.5 capitalize">{digest.frequency}</span>
                {digest.last_sent && (
                  <span className="text-xs text-stone-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(digest.last_sent).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}