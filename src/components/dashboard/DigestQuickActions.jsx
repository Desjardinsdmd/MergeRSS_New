import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Clock, CheckCircle2, PauseCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DigestQuickActions({ digests }) {
  if (digests.length === 0) return null;

  return (
    <Card className="border-slate-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Your Digests</CardTitle>
        <Link to={createPageUrl('Digests')} className="text-xs text-indigo-600 hover:underline">Manage →</Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {digests.slice(0, 5).map(digest => (
            <div key={digest.id} className="flex items-center gap-3 px-4 py-2.5">
              {digest.status === 'active'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                : <PauseCircle className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
              }
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{digest.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs capitalize">{digest.frequency}</Badge>
                  {digest.last_sent && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(digest.last_sent).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}