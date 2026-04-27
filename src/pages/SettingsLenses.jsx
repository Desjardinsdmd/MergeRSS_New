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
import PremiumGate from '@/components/publications/PremiumGate';
import LensForm from '@/components/publications/LensForm';

export default function SettingsLenses() {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null); // null = list, 'new' = new form, lens object = edit
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const isPremium = user?.plan === 'premium';

  const { data: lensesRaw = [], isLoading } = useQuery({
    queryKey: ['custom-lenses'],
    queryFn: () => base44.entities.CustomLens.filter({}, '-created_date', 50),
    enabled: isPremium,
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
  if (!isPremium) return <div className="p-6 lg:p-8 max-w-3xl mx-auto"><PremiumGate feature="Custom Lenses" /></div>;

  if (editing) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-100 mb-6">
          {editing === 'new' ? 'Create Lens' : `Edit: ${editing.name}`}
        </h1>
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Custom Lenses</h1>
          <p className="text-stone-500 text-sm">Define scoring rubrics to rank stories for your publications</p>
        </div>
        <Button onClick={() => setEditing('new')} className="bg-[hsl(var(--primary))] text-stone-900 font-semibold">
          <Plus className="w-4 h-4 mr-2" /> New Lens
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
      ) : lenses.length === 0 ? (
        <Card className="border-stone-800 bg-stone-900">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <SlidersHorizontal className="w-10 h-10 text-stone-600 mb-3" />
            <p className="text-stone-400 mb-1">No lenses yet</p>
            <p className="text-stone-600 text-sm mb-4">Create a custom scoring lens to start ranking stories for your publications.</p>
            <Button onClick={() => setEditing('new')} variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Create Your First Lens
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lenses.map(lens => (
            <Card key={lens.id} className="border-stone-800 bg-stone-900">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-stone-200 truncate">{lens.name}</h3>
                    <Badge variant={lens.is_active ? 'default' : 'outline'} className="text-xs">
                      {lens.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {lens.description && <p className="text-sm text-stone-500 truncate">{lens.description}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-stone-600">
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
                  <Button variant="ghost" size="icon" onClick={() => setEditing(lens)}>
                    <Pencil className="w-4 h-4 text-stone-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(lens)}>
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
            <AlertDialogTitle>Delete Lens</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". Publications using this lens will need to be updated.
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