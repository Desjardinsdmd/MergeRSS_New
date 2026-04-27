import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Pencil, Trash2, Loader2, Newspaper, Play, Inbox, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PremiumGate from '@/components/publications/PremiumGate';
import PublicationForm from '@/components/publications/PublicationForm';

const STATUS_COLORS = {
  active: 'bg-green-900/30 text-green-400',
  paused: 'bg-stone-700 text-stone-400',
  draft_only: 'bg-amber-900/30 text-amber-400',
};

export default function Publications() {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);
  const isPremium = user?.plan === 'premium' || user?.role === 'admin';

  const { data: pubsRaw = [], isLoading } = useQuery({
    queryKey: ['publications'],
    queryFn: () => base44.entities.Publication.filter({}, '-created_date', 50),
    enabled: !!user,
  });
  const pubs = Array.isArray(pubsRaw) ? pubsRaw : (pubsRaw?.items || pubsRaw?.data || []);

  const { data: lensesRaw = [] } = useQuery({
    queryKey: ['pub-lenses'],
    queryFn: () => base44.entities.CustomLens.filter({}, '-created_date', 50),
    enabled: !!user,
  });
  const lenses = Array.isArray(lensesRaw) ? lensesRaw : (lensesRaw?.items || lensesRaw?.data || []);
  const lensMap = {};
  for (const l of lenses) lensMap[l.id] = l;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Publication.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['publications'] });
    setDeleteTarget(null);
    toast.success('Publication deleted');
  };

  const handleRunNow = async (pubId) => {
    setRunningId(pubId);
    const res = await base44.functions.invoke('runPublicationScheduler', { publication_id: pubId, force: true });
    if (res.data?.results?.[0]?.error) {
      toast.error(res.data.results[0].error);
    } else {
      toast.success('Scheduler run complete — check the inbox for new drafts');
    }
    queryClient.invalidateQueries({ queryKey: ['publications'] });
    setRunningId(null);
  };

  if (!user) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>;
  if (!isPremium) return <div className="p-6 lg:p-8 max-w-4xl mx-auto"><PremiumGate feature="Publications" /></div>;

  if (editing) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-100 mb-6">
          {editing === 'new' ? 'Create Publication' : `Edit: ${editing.name}`}
        </h1>
        <PublicationForm
          publication={editing === 'new' ? null : editing}
          onSave={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['publications'] }); toast.success('Publication saved'); }}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Publications</h1>
          <p className="text-stone-500 text-sm">Manage your automated social publications</p>
        </div>
        <Button onClick={() => {
          if (pubs.length >= 1) { toast.error('v1 limit: 1 publication per account. This limit will be raised.'); return; }
          setEditing('new');
        }} className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
          <Plus className="w-4 h-4 mr-2" /> New Publication
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
      ) : pubs.length === 0 ? (
        <Card className="border-stone-800 bg-stone-900">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Newspaper className="w-10 h-10 text-stone-600 mb-3" />
            <p className="text-stone-400 mb-1">No publications yet</p>
            <p className="text-stone-600 text-sm mb-4">Create a publication to start generating social posts from your intelligence feed.</p>
            <Button onClick={() => setEditing('new')} variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Create Your First Publication
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pubs.map(pub => (
            <Card key={pub.id} className="border-stone-800 bg-stone-900">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-stone-200">{pub.name}</h3>
                      <Badge className={STATUS_COLORS[pub.status] || 'bg-stone-700 text-stone-400'}>{pub.status}</Badge>
                      <Badge variant="outline" className="text-xs">{pub.channel_type}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-stone-600">
                      <span>Lens: {lensMap[pub.lens_id]?.name || 'Unknown'}</span>
                      <span>Candidates: {pub.candidates_per_run || 3}/run</span>
                      {pub.last_run_at && <span>Last run: {new Date(pub.last_run_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link to={`/PublicationInbox?id=${pub.id}`}>
                      <Button variant="ghost" size="sm" className="text-stone-400 hover:text-stone-200">
                        <Inbox className="w-4 h-4 mr-1" /> Inbox
                      </Button>
                    </Link>
                    <Link to={`/PublicationVoice?id=${pub.id}`}>
                      <Button variant="ghost" size="sm" className="text-stone-400 hover:text-stone-200">
                        <BookOpen className="w-4 h-4 mr-1" /> Voice
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => handleRunNow(pub.id)} disabled={runningId === pub.id}>
                      {runningId === pub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-[hsl(var(--primary))]" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(pub)}>
                      <Pencil className="w-4 h-4 text-stone-400" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(pub)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Publication</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all its draft posts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}