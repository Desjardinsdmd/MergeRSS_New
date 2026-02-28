import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Zap, Loader2, CheckCircle2, Clock, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function DigestQuickActions({ digests }) {
  const [generating, setGenerating] = useState({});
  const [generated, setGenerated] = useState({});

  if (digests.length === 0) return null;

  const handleGenerate = async (digest) => {
    setGenerating(prev => ({ ...prev, [digest.id]: true }));
    try {
      await base44.functions.invoke('generateDigests', { digest_id: digest.id, force: true });
      setGenerated(prev => ({ ...prev, [digest.id]: true }));
      toast.success(`Digest "${digest.name}" generated! Check your inbox.`);
    } catch (e) {
      toast.error('Failed to generate digest');
    } finally {
      setGenerating(prev => ({ ...prev, [digest.id]: false }));
    }
  };

  return (
    <Card className="border-slate-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Your Digests</CardTitle>
        <Link to={createPageUrl('Digests')} className="text-xs text-indigo-600 hover:underline">Manage →</Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {digests.slice(0, 5).map(digest => (
            <div key={digest.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{digest.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs capitalize">{digest.frequency}</Badge>
                  {digest.last_sent && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last: {new Date(digest.last_sent).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleGenerate(digest)}
                disabled={generating[digest.id] || generated[digest.id]}
                title="Generate now"
                className={`ml-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                  generated[digest.id]
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {generating[digest.id] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : generated[digest.id] ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {generated[digest.id] ? 'Sent' : 'Run Now'}
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}