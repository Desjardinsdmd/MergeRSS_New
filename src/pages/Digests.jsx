import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Loader2, Send } from 'lucide-react';
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

export default function Digests() {
  const [user, setUser] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editDigest, setEditDigest] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sendingTest, setSendingTest] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
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
      toast.success('Digest deleted');
    }
  };

  const handleToggleStatus = async (digest) => {
    const newStatus = digest.status === 'active' ? 'paused' : 'active';
    await base44.entities.Digest.update(digest.id, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['digests'] });
    toast.success(`Digest ${newStatus === 'active' ? 'activated' : 'paused'}`);
  };

  const handleSendTest = async (digest) => {
    setSendingTest(digest.id);
    
    // Create a test delivery record
    await base44.entities.DigestDelivery.create({
      digest_id: digest.id,
      delivery_type: 'web',
      status: 'sent',
      content: `Test digest for ${digest.name}. This is a sample digest with your selected content.`,
      item_count: 5,
      date_range_start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      date_range_end: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    });

    await base44.entities.Digest.update(digest.id, {
      last_sent: new Date().toISOString()
    });

    queryClient.invalidateQueries({ queryKey: ['digests'] });
    queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    
    setSendingTest(null);
    toast.success('Test digest sent! Check your inbox.');
  };

  const maxDigests = user?.plan === 'premium' ? Infinity : 1;
  const canAddMore = digests.length < maxDigests;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Digests</h1>
          <p className="text-slate-600">
            Create and manage your curated content digests
            {user?.plan !== 'premium' && (
              <span className="text-sm text-slate-500 ml-2">
                ({digests.length}/{maxDigests} digests)
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setShowDialog(true)}
          disabled={!canAddMore}
          className="bg-[#171a20] hover:bg-black rounded-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Digest
        </Button>
      </div>

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
          <Button onClick={() => setShowDialog(true)} className="bg-[#171a20] hover:bg-black rounded-sm">
            <Plus className="w-4 h-4 mr-2" />
            Create Digest
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {digests.map((digest) => (
            <DigestCard
              key={digest.id}
              digest={digest}
              onEdit={(d) => { setEditDigest(d); setShowDialog(true); }}
              onDelete={(d) => setDeleteConfirm(d)}
              onToggleStatus={handleToggleStatus}
              onSendTest={handleSendTest}
              isSending={sendingTest === digest.id}
            />
          ))}
        </div>
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
            <AlertDialogTitle>Delete Digest</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}