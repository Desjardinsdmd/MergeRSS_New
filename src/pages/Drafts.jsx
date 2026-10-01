import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import XDraftCard from '@/components/drafts/XDraftCard';
import { PageHeader } from '@/components/brand/Brand';

const TAB_TRIGGER =
  'relative -mb-px rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-stone-500 shadow-none hover:text-stone-200 data-[state=active]:border-[hsl(var(--brand))] data-[state=active]:bg-transparent data-[state=active]:text-stone-100 data-[state=active]:shadow-none';

export default function Drafts() {
  const [status, setStatus] = useState('Draft');
  const { data: drafts = [], isLoading, refetch } = useQuery({
    queryKey: ['xdrafts', status],
    queryFn: () => base44.entities.XDraft.filter({ status }, '-created_date', 100),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader title="X Drafts" subtitle="Posts queued for X. Copy them or open them in X, then mark them posted." className="mb-0" />
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-white/[0.07] bg-transparent p-0">
          <TabsTrigger value="Draft" className={TAB_TRIGGER}>Draft</TabsTrigger>
          <TabsTrigger value="Posted" className={TAB_TRIGGER}>Posted</TabsTrigger>
          <TabsTrigger value="Skipped" className={TAB_TRIGGER}>Skipped</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-stone-500" />
      ) : drafts.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-stone-400">No {status.toLowerCase()} posts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map(d => <XDraftCard key={d.id} draft={d} onChange={refetch} />)}
        </div>
      )}
    </div>
  );
}
