import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, SlidersHorizontal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import LensForm from '@/components/publications/LensForm';
import { PageHeader } from '@/components/brand/Brand';

const ICON_BTN = 'rounded-xl hover:bg-white/[0.05]';

function SettingsLensesPage() {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null); // null = list, 'new' = new form, lens object = edit
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: lensesRaw = [], isLoading } = useQuery({
    queryKey: ['custom-lenses', user?.email],
    queryFn: () => base44.entities.CustomLens.filter({ created_by: user.email }, '-created_date', 50),
    enabled: !!user,
  });
  const lenses = Array.isArray(lensesRaw) ? lensesRaw : (lensesRaw?.items || lensesRaw?.data || []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.CustomLens.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['custom-lenses'] });
    setDeleteTarget(null);
    toast.success('Lens deleted');
  };

  if (!user) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>;

  if (editing) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader eyebrow="Lenses" title={editing === 'new' ? 'Create lens' : `Edit ${editing.name}`} />
        <LensForm
          lens={editing === 'new' ? null : editing}
          onSave={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['custom-lenses'] }); toast.success('Lens saved'); }}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Lenses"
        subtitle="Scoring rubrics that rank stories for your publications."
        actions={
          <button type="button" onClick={() => setEditing('new')} className="btn-brand">
            <Plus className="w-4 h-4" /> New lens
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
      ) : lenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <SlidersHorizontal className="w-10 h-10 text-stone-600 mb-3" />
            <p className="font-display text-stone-200 mb-1">No lenses yet</p>
            <p className="text-stone-500 text-sm mb-4">Create a custom scoring lens to start ranking stories for your publications.</p>
            <button type="button" onClick={() => setEditing('new')} className="btn-soft">
              <Plus className="w-4 h-4" /> Create your first lens
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lenses.map(lens => (
            <Card key={lens.id}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-base font-semibold text-stone-100 truncate">{lens.name}</h3>
                    <Badge variant="outline" className={lens.is_active
                      ? 'rounded-md border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-300'
                      : 'rounded-md border-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-stone-500'}>
                      {lens.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {lens.description && <p className="text-sm text-stone-400 truncate">{lens.description}</p>}
                  <div className="meta mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 normal-case">
                    <span>Threshold: {lens.minimum_score_threshold}</span>
                    {lens.feed_filter_categories?.length > 0 && (
                      <span>Categories: {lens.feed_filter_categories.join(', ')}</span>
                    )}
                    {lens.feed_filter_tags?.length > 0 && (
                      <span>Tags: {lens.feed_filter_tags.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className={ICON_BTN} aria-label="Edit lens" onClick={() => setEditing(lens)}>
                    <Pencil className="w-4 h-4 text-stone-400" />
                  </Button>
                  <Button variant="ghost" size="icon" className={ICON_BTN} aria-label="Delete lens" onClick={() => setDeleteTarget(lens)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete lens</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". Publications using this lens will need to be updated.
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
    return <div className="p-6 lg:p-8 max-w-3xl mx-auto text-sm text-stone-500">Loading...</div>;
  }
  if (access !== 'admin') {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="p-8 text-center border border-stone-800 rounded-xl bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-200 mb-1">Admins only</h2>
          <p className="text-sm text-stone-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function SettingsLenses() {
  return (
    <AdminOnlyGuard>
      <SettingsLensesPage />
    </AdminOnlyGuard>
  );
}
