import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import XDraftCard from '@/components/drafts/XDraftCard';

export default function Drafts() {
  const [status, setStatus] = useState('Draft');
  const { data: drafts = [], isLoading, refetch } = useQuery({
    queryKey: ['xdrafts', status],
    queryFn: () => base44.entities.XDraft.filter({ status }, '-created_date', 100),
  });

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-stone-100">X Drafts</h1>
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="Draft">Draft</TabsTrigger>
          <TabsTrigger value="Posted">Posted</TabsTrigger>
          <TabsTrigger value="Skipped">Skipped</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? (
        <Loader2 className="w-6 h-6 animate-spin text-stone-500 mx-auto" />
      ) : drafts.length === 0 ? (
        <p className="text-stone-500 text-sm">No {status.toLowerCase()} items.</p>
      ) : (
        <div className="space-y-4">
          {drafts.map(d => <XDraftCard key={d.id} draft={d} onChange={refetch} />)}
        </div>
      )}
    </div>
  );
}