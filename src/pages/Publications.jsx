import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Pencil, Trash2, Loader2, Newspaper, Play, Inbox, BookOpen, ChevronDown, ChevronUp, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PublicationForm from '@/components/publications/PublicationForm';
import CandidatePipeline from '@/components/publications/CandidatePipeline';
import { PageHeader } from '@/components/brand/Brand';

// Cron hours are stored in UTC. Show them in Eastern time, DST-aware.
function cronToET(cron) {
  const parts = cron.trim().split(/\s+/);
  const minute = parseInt(parts[0], 10) || 0;
  const utcHour = parseInt(parts[1], 10);
  if (Number.isNaN(utcHour)) return cron;
  const d = new Date();
  d.setUTCHours(utcHour, minute, 0, 0);
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/Toronto', hour: 'numeric', minute: minute ? '2-digit' : undefined,
  }).replace(':00', '').replace(' ', '');
}

function formatSchedule(cronStr) {
  if (!cronStr) return 'Not set';
  const crons = cronStr.split(',').map(s => s.trim()).filter(Boolean);
  return crons.map(cronToET).join(', ') + ' ET';
}

const STATUS_COLORS = {
  active: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  paused: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  draft_only: 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#C4A5FD]',
};
const CHIP = 'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none';
const ICON_BTN = 'h-9 w-9 rounded-xl text-stone-400 hover:bg-white/[0.05] hover:text-stone-100';
const TAB_BTN = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 text-sm font-medium text-stone-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-stone-100';

function formatLastRun(iso) {
  if (!iso) return 'Not yet';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function PublicationsPage() {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [expandedPipeline, setExpandedPipeline] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);
  const { data: pubsRaw = [], isLoading } = useQuery({
    queryKey: ['publications', user?.email],
    queryFn: () => base44.entities.Publication.list('-created_date', 50),
    enabled: !!user,
  });
  const pubs = Array.isArray(pubsRaw) ? pubsRaw : (pubsRaw?.items || pubsRaw?.data || []);

  const { data: lensesRaw = [] } = useQuery({
    queryKey: ['pub-lenses', user?.email],
    queryFn: () => base44.entities.CustomLens.list('-created_date', 50),
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

  if (editing) {
    return (
      <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader eyebrow="Publications" title={editing === 'new' ? 'Create publication' : `Edit ${editing.name}`} />
        <PublicationForm
          publication={editing === 'new' ? null : editing}
          onSave={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['publications'] }); toast.success('Publication saved'); }}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Publications"
        subtitle="Scheduled post suggestions for review. Approved posts go to X Drafts to post manually."
        actions={
          <button type="button" onClick={() => {
            if (pubs.length >= 1) { toast.error('v1 limit: 1 publication per account. This limit will be raised.'); return; }
            setEditing('new');
          }} className="btn-brand">
            <Plus className="w-4 h-4" /> New publication
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
      ) : pubs.length === 0 ? (
        <div className="panel flex flex-col items-center py-12 text-center">
          <Newspaper className="w-10 h-10 text-stone-600 mb-3" />
          <p className="font-display text-stone-200 mb-1">No publications yet</p>
          <p className="text-stone-500 text-sm mb-4">Create a publication to start generating social posts from your sources.</p>
          <button type="button" onClick={() => setEditing('new')} className="btn-soft">
            <Plus className="w-4 h-4" /> Create your first publication
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {pubs.map(pub => {
            const open = expandedPipeline === pub.id;
            const facts = [
              ['Lens', lensMap[pub.lens_id]?.name || 'Unknown'],
              ['Candidates', `${pub.candidates_per_run || 3} per run`],
              ['Schedule', formatSchedule(pub.schedule_cron)],
              ['Last run', formatLastRun(pub.last_run_at)],
            ];
            return (
              <div key={pub.id}>
                <div className="panel p-4 sm:p-5">
                  {/* Title row: name + status on the left, quick actions on the right */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-semibold leading-snug text-stone-100 break-words">{pub.name}</h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge className={`${CHIP} ${STATUS_COLORS[pub.status] || 'border-white/10 bg-white/[0.03] text-stone-400'} hover:bg-inherit`}>{pub.status}</Badge>
                        <Badge variant="outline" className={`${CHIP} border-white/10 text-stone-300`}>{pub.channel_type}</Badge>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="icon" className={ICON_BTN} title="Run now" aria-label="Run now" onClick={() => handleRunNow(pub.id)} disabled={runningId === pub.id}>
                        {runningId === pub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-[#C4A5FD]" />}
                      </Button>
                      <Button variant="ghost" size="icon" className={ICON_BTN} title="Edit" aria-label="Edit" onClick={() => setEditing(pub)}>
                        <Pencil className="w-4 h-4 text-stone-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className={ICON_BTN} title="Delete" aria-label="Delete" onClick={() => setDeleteTarget(pub)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>

                  {/* Facts */}
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                    {facts.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="micro-label">{label}</dt>
                        <dd className="mt-1 text-sm text-stone-200 break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {/* Sections */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-4">
                    <button type="button"
                      onClick={() => setExpandedPipeline(open ? null : pub.id)}
                      aria-expanded={open}
                      className={`${TAB_BTN} ${open ? 'border-[hsl(var(--brand)/0.35)] bg-[hsl(var(--brand)/0.14)] text-[#D9C7FE]' : ''}`}>
                      <BarChart3 className="hidden w-4 h-4 shrink-0 sm:block" /> Pipeline
                      {open ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                    <Link to={`/PublicationInbox?id=${pub.id}`} className={TAB_BTN}>
                      <Inbox className="w-4 h-4 shrink-0" /> Inbox
                    </Link>
                    <Link to={`/PublicationVoice?id=${pub.id}`} className={TAB_BTN}>
                      <BookOpen className="w-4 h-4 shrink-0" /> Voice
                    </Link>
                  </div>
                </div>
                {open && (
                  <div className="mt-4">
                    <CandidatePipeline publicationId={pub.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete publication</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all its draft posts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


// --- Admin-only guard (non-admins see an "Admins only" message; inner page never mounts) ---
function AdminOnlyGuard({ children }) {
  const [access, setAccess] = React.useState('loading');
  React.useEffect(() => {
    let cancelled = false;
    base44.auth.me()
      .then((u) => { if (!cancelled) setAccess(u?.role === 'admin' ? 'admin' : 'denied'); })
      .catch(() => { if (!cancelled) setAccess('denied'); });
    return () => { cancelled = true; };
  }, []);
  if (access === 'loading') {
    return <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto text-sm text-stone-500">Loading...</div>;
  }
  if (access !== 'admin') {
    return (
      <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="panel p-8 text-center">
          <h2 className="font-display text-lg font-semibold text-stone-200 mb-1">Admins only</h2>
          <p className="text-sm text-stone-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function Publications() {
  return (
    <AdminOnlyGuard>
      <PublicationsPage />
    </AdminOnlyGuard>
  );
}
