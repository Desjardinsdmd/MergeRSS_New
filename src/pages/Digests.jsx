import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Loader2, Send, Grid3x3, List, Trash2, Info, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import SharedDigestsSection from '@/components/digests/SharedDigestsSection';
import { useWorkspace } from '@/components/feeds/workspaceApi';

export default function Digests() {
  const [user, setUser] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editDigest, setEditDigest] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sendingTest, setSendingTest] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid, list, compact
  const [sortBy, setSortBy] = useState('newest');
  const [selectedDigests, setSelectedDigests] = useState([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => localStorage.getItem('digestOnboardingDismissed') === '1');
  const [sharedDialog, setSharedDialog] = useState({ open: false, digest: null });
  const queryClient = useQueryClient();
  const { workspace, canManage: canManageTeam } = useWorkspace();
  const team = workspace && canManageTeam ? workspace : null;

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

  const { data: allDigests = [], isLoading } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }, '-created_date', 1000),
    enabled: !!user,
  });
  // Briefings shared with the current workspace are listed in the Shared section instead.
  const digests = React.useMemo(
    () => allDigests.filter(d => !(workspace && d.workspace_id === workspace.id)),
    [allDigests, workspace],
  );
  const refreshAllDigests = () => {
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    queryClient.invalidateQueries({ queryKey: ['shared-digests'] });
  };

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
      const res = await base44.functions.invoke('generateDigests', { digest_id: digest.id, force: true });
      refreshAllDigests();
      const d = res?.data || {};
      if (d.error) {
        toast.error(`Failed to send test: ${d.error}`);
        return;
      }
      if (d.skipped && !Array.isArray(d.results)) {
        toast.warning(`Not sent: ${d.reason || 'the run was skipped'}`);
        return;
      }
      const results = Array.isArray(d.results) ? d.results : [];
      const r = results.find(x => x.digest_id === digest.id) || results.find(x => x.digest === digest.name) || results[0];
      if (!r) {
        toast.warning(d.deferred ? 'Not sent yet: the run was deferred. Try again in a minute.' : 'Nothing was sent. The digest was not processed.');
      } else if (r.status === 'error' || r.error) {
        toast.error(`Failed to send test: ${r.error || 'unknown error'}`);
      } else if (r.skipped) {
        toast.warning(`Not sent: ${String(r.reason || 'skipped').replace(/_/g, ' ')}`);
      } else {
        const channels = Array.isArray(r.deliveries) && r.deliveries.length ? ` via ${r.deliveries.join(', ')}` : '';
        const skippedCh = Array.isArray(r.skipped_channels) && r.skipped_channels.length
          ? ` (${r.skipped_channels.map(c => c.channel).join(', ')} skipped: Premium only)` : '';
        toast.success(`Sent${channels} with ${r.items_included ?? 0} item${r.items_included === 1 ? '' : 's'}${skippedCh}`);
      }
    } catch (error) {
      toast.error(`Failed to send test: ${error?.response?.data?.error || error.message}`);
    } finally {
      setSendingTest(null);
    }
  };

  const handleMakePublic = async (digest) => {
    await base44.entities.Digest.update(digest.id, { is_public: !digest.is_public });
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    toast.success(digest.is_public ? 'Digest made private' : 'Digest made public');
  };

  const sortedDigests = React.useMemo(() => {
    const list = [...digests];
    if (sortBy === 'newest') list.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    else if (sortBy === 'oldest') list.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    else if (sortBy === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'name-desc') list.sort((a, b) => b.name.localeCompare(a.name));
    else if (sortBy === 'last-sent') list.sort((a, b) => new Date(b.last_sent || 0) - new Date(a.last_sent || 0));
    return list;
  }, [digests, sortBy]);

  const isPremium = user?.plan === 'premium';
  const maxDigests = getLimit(isPremium, 'digests');
  const canAddMore = allDigests.length < maxDigests;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-100 mb-1">Digests</h1>
          <p className="text-stone-500 text-sm">
            Create and manage your curated content digests
            {!isPremium && (
              <span className="text-stone-600 ml-2">
                ({allDigests.length}/{maxDigests} used)
              </span>
            )}
            <Link to={createPageUrl('DigestReports')} className="ml-3 text-xs text-[hsl(var(--primary))] hover:underline">
              View digest reports
            </Link>
          </p>
        </div>
        <Button
        onClick={() => setShowWizard(true)}
        disabled={!canAddMore}
        title={!canAddMore ? 'Upgrade to Premium to create more digests' : ''}
        className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-lg disabled:opacity-60 font-bold whitespace-nowrap"
        >
        <Plus className="w-4 h-4 mr-2" />
        Create Digest
        </Button>
      </div>

      {/* Team: shared briefings */}
      {workspace && (
        <SharedDigestsSection
          workspace={workspace}
          canManage={canManageTeam}
          onCreate={() => setSharedDialog({ open: true, digest: null })}
          onEdit={(d) => setSharedDialog({ open: true, digest: d })}
          onSendNow={handleSendTest}
          sendingId={sendingTest}
        />
      )}

      {/* Free plan limit banner */}
      {!isPremium && allDigests.length >= maxDigests && (
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
       <div className="text-center py-16">
         <div className="w-12 h-12 bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
           <FileText className="w-6 h-6 text-stone-600" />
         </div>
         <h3 className="text-lg font-semibold text-stone-100 mb-1">No digests yet</h3>
         <p className="text-stone-500 text-sm mb-6">
           Create your first digest to start receiving curated content
         </p>
         <Button onClick={() => setShowWizard(true)} className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 rounded-lg font-bold">
           <Plus className="w-4 h-4 mr-2" />
           Create Digest
         </Button>
       </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
              <SelectItem value="last-sent">Recently sent</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1 border border-stone-800 rounded-lg p-1 bg-stone-900">
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
              {sortedDigests.map((digest) => (
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
              digests={sortedDigests}
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
              digests={sortedDigests}
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
        onSuccess={refreshAllDigests}
        editDigest={editDigest}
        team={team}
      />

      {/* Shared briefing create/edit */}
      {team && (
        <DigestDialog
          open={sharedDialog.open}
          onOpenChange={(open) => setSharedDialog(s => (open ? { ...s, open } : { open: false, digest: null }))}
          onSuccess={refreshAllDigests}
          editDigest={sharedDialog.digest}
          team={team}
          defaultShared
        />
      )}

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