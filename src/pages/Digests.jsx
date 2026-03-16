import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Loader2, Send, Grid3x3, List, Trash2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { getLimit } from '@/lib/planLimits';
import DigestDialog from '@/components/digests/DigestDialog';
import DigestWizard from '@/components/digests/DigestWizard';
import DigestCard from '@/components/digests/DigestCard';
import DigestListView from '@/components/digests/DigestListView';
import DigestCompactView from '@/components/digests/DigestCompactView';

export default function Digests() {
  const [user, setUser] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editDigest, setEditDigest] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sendingTest, setSendingTest] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid, list, compact
  const [selectedDigests, setSelectedDigests] = useState([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => localStorage.getItem('digestOnboardingDismissed') === '1');
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        // user not authenticated
      }
    };
    loadUser();
  }, []);

  const { data: digests = [], isLoading } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }, '-created_date'),
    enabled: !!user,
  });

  const handleDelete = async () => {
    if (deleteConfirm) {
      await base44.entities.Digest.delete(deleteConfirm.id);
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      setDeleteConfirm(null);
      setSelectedDigests([]);
      toast.success('Digest deleted');
    }
  };

  const handleBulkDelete = async () => {
    setDeletingBulk(true);
    await Promise.all(selectedDigests.map(id => base44.entities.Digest.delete(id)));
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    setSelectedDigests([]);
    setDeletingBulk(false);
    toast.success(`${selectedDigests.length} digest(es) deleted`);
  };

  const handleToggleStatus = async (digest) => {
    const newStatus = digest.status === 'active' ? 'paused' : 'active';
    await base44.entities.Digest.update(digest.id, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    toast.success(`Digest ${newStatus === 'active' ? 'activated' : 'paused'}`);
  };

  const handleSendTest = async (digest) => {
    setSendingTest(digest.id);
    try {
      await base44.functions.invoke('generateDigests', { digest_id: digest.id, force: true });
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      toast.success('Sent!');
    } catch (error) {
      toast.error(`Failed to send test: ${error.message}`);
    } finally {
      setSendingTest(null);
    }
  };

  const handleMakePublic = async (digest) => {
    await base44.entities.Digest.update(digest.id, { is_public: !digest.is_public });
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    toast.success(digest.is_public ? 'Digest made private' : 'Digest made public');
  };

  const isPremium = user?.plan === 'premium';
  const maxDigests = getLimit(isPremium, 'digests');
  const canAddMore = digests.length < maxDigests;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Digests</h1>
          <p className="text-stone-500">
            Create and manage your curated content digests
            {!isPremium && (
              <span className="text-sm text-stone-600 ml-2">
                ({digests.length}/{maxDigests} used)
              </span>
            )}
          </p>
        </div>
        <Button
        onClick={() => setShowWizard(true)}
        disabled={!canAddMore}
        title={!canAddMore ? 'Upgrade to Premium to create more digests' : ''}
        className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-lg disabled:opacity-60 font-bold"
        >
        <Plus className="w-4 h-4 mr-2" />
        Create Digest
        </Button>
      </div>

      {/* Free plan limit banner */}
      {!isPremium && digests.length >= maxDigests && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3">
          <p className="text-sm text-stone-400 font-medium">
            You've reached the {maxDigests}-digest limit on the Free plan. Upgrade to Premium for unlimited digests.
          </p>
          <Link to={createPageUrl('Pricing')}>
            <Button size="sm" className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-lg whitespace-nowrap font-bold">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Digest onboarding tip */}
      {digests.length === 0 && !isLoading && (() => {
        if (onboardingDismissed) return null;
        return (
          <div className="mb-6 p-4 border border-amber-400/30 bg-amber-400/5 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-400 mb-1">How digests work</p>
              <p className="text-xs text-stone-400 leading-relaxed">
                A digest selects articles from your feeds, lets AI summarize them, and delivers a clean roundup 
                to your inbox, email, Slack or Discord — on a schedule you choose. Create one in under 2 minutes.
              </p>
            </div>
            <button
              onClick={() => { localStorage.setItem('digestOnboardingDismissed', '1'); setOnboardingDismissed(true); }}
              className="p-1 text-stone-600 hover:text-stone-300 transition flex-shrink-0"
              aria-label="Dismiss tip"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {/* Digest List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      ) : digests.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-stone-600" />
          </div>
          <h3 className="text-lg font-medium text-stone-100 mb-1">No digests yet</h3>
          <p className="text-stone-500 mb-4">
            Create your first digest to start receiving curated content
          </p>
          <Button onClick={() => setShowWizard(true)} className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-lg font-bold">
            <Plus className="w-4 h-4 mr-2" />
            Create Digest
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-1 mb-6 border border-stone-800 rounded-lg p-1 bg-stone-900 w-fit">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded"
            >
              <Grid3x3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'compact' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('compact')}
              className="rounded"
            >
              <span className="text-xs font-semibold">≡</span>
            </Button>
          </div>

          {selectedDigests.length > 0 && (
            <div className="mb-6 flex items-center justify-between gap-4 bg-stone-900 border border-stone-800 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-stone-300">{selectedDigests.length} digest(es) selected</span>
              <Button
                size="sm"
                onClick={() => setDeleteConfirm({ id: 'bulk', name: '' })}
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected
              </Button>
            </div>
          )}

          {viewMode === 'grid' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {digests.map((digest) => (
                <DigestCard
                  key={digest.id}
                  digest={digest}
                  onEdit={(d) => { setEditDigest(d); setShowDialog(true); }}
                  onDelete={(d) => setDeleteConfirm(d)}
                  onToggleStatus={handleToggleStatus}
                  onSendTest={handleSendTest}
                  onMakePublic={handleMakePublic}
                  isSending={sendingTest === digest.id}
                />
              ))}
            </div>
          )}

          {viewMode === 'list' && (
            <DigestListView
              digests={digests}
              selectedIds={selectedDigests}
              onSelectionChange={setSelectedDigests}
              onEdit={(d) => { setEditDigest(d); setShowDialog(true); }}
              onDelete={(d) => setDeleteConfirm(d)}
              onToggleStatus={handleToggleStatus}
              onSendTest={handleSendTest}
              onMakePublic={handleMakePublic}
              sendingTest={sendingTest}
            />
          )}

          {viewMode === 'compact' && (
            <DigestCompactView
              digests={digests}
              selectedIds={selectedDigests}
              onSelectionChange={setSelectedDigests}
              onEdit={(d) => { setEditDigest(d); setShowDialog(true); }}
              onDelete={(d) => setDeleteConfirm(d)}
              onToggleStatus={handleToggleStatus}
              onSendTest={handleSendTest}
              onMakePublic={handleMakePublic}
              sendingTest={sendingTest}
            />
          )}
        </>
      )}

      {/* Create Wizard */}
      <DigestWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['digests'] })}
      />

      {/* Edit Dialog */}
      <DigestDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setEditDigest(null);
        }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['digests'] })}
        editDigest={editDigest}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.id === 'bulk' ? 'Delete Digests' : 'Delete Digest'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.id === 'bulk'
                ? `Are you sure you want to delete ${selectedDigests.length} digest(es)? This action cannot be undone.`
                : `Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteConfirm?.id === 'bulk' ? handleBulkDelete : handleDelete}
              disabled={deletingBulk}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingBulk ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}