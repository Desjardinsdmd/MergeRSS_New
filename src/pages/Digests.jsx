import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Loader2, Send, Grid3x3, List, Trash2 } from 'lucide-react';
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
import DigestDialog from '@/components/digests/DigestDialog';
import DigestCard from '@/components/digests/DigestCard';
import DigestListView from '@/components/digests/DigestListView';
import DigestCompactView from '@/components/digests/DigestCompactView';

export default function Digests() {
  const [user, setUser] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editDigest, setEditDigest] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sendingTest, setSendingTest] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid, list, compact
  const [selectedDigests, setSelectedDigests] = useState([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
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
    queryKey: ['digests'],
    queryFn: () => base44.entities.Digest.list('-created_date'),
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
      if (digest.delivery_discord) {
        await base44.functions.invoke('sendDiscordTest', { digest_name: digest.name });
      }
      if (digest.delivery_email) {
        await base44.functions.invoke('generateDigests', { digest_id: digest.id, force: true });
      }
      if (!digest.delivery_discord && !digest.delivery_email) {
        await base44.functions.invoke('generateDigests', { digest_id: digest.id, force: true });
      }
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
  const maxDigests = isPremium ? Infinity : 1;
  const canAddMore = digests.length < maxDigests;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Digests</h1>
          <p className="text-slate-600">
            Create and manage your curated content digests
            {!isPremium && (
              <span className="text-sm text-slate-500 ml-2">
                ({digests.length}/{maxDigests} used)
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setShowDialog(true)}
          disabled={!canAddMore}
          title={!canAddMore ? 'Upgrade to Premium to create more digests' : ''}
          className="bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Digest
        </Button>
      </div>

      {/* Free plan limit banner */}
      {!isPremium && digests.length >= maxDigests && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">
            You've reached the 1-digest limit on the Free plan. Upgrade to Premium for unlimited digests.
          </p>
          <Link to={createPageUrl('Pricing')}>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 rounded-lg whitespace-nowrap">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Digest List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : digests.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">No digests yet</h3>
          <p className="text-slate-500 mb-4">
            Create your first digest to start receiving curated content
          </p>
          <Button onClick={() => setShowDialog(true)} className="bg-indigo-600 hover:bg-indigo-700 rounded-lg">
            <Plus className="w-4 h-4 mr-2" />
            Create Digest
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-1 mb-6 border border-slate-200 rounded-lg p-1 bg-white w-fit">
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
            <div className="mb-6 flex items-center justify-between gap-4 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-indigo-900">{selectedDigests.length} digest(es) selected</span>
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

      {/* Create/Edit Dialog */}
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