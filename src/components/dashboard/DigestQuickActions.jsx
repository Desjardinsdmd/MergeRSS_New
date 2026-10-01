import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Clock, CheckCircle2, PauseCircle } from 'lucide-react';

export default function DigestQuickActions({ digests }) {
  if (digests.length === 0) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <span className="micro-label">Your briefings</span>
        <Link to={createPageUrl('Digests')} className="text-xs text-stone-400 hover:text-brand-light transition-colors">Manage →</Link>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {digests.slice(0, 5).map(digest => (
          <div key={digest.id} className="flex items-center gap-3 px-4 py-2.5">
            {digest.status === 'active'
              ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--primary))] flex-shrink-0" />
              : <PauseCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            }
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-300 truncate">{digest.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="chip-neutral capitalize">{digest.frequency}</span>
                {digest.last_sent && (
                  <span className="meta flex items-center gap-1">
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