import React from 'react';
import { AlertCircle, RotateCcw, Zap, Trash2 } from 'lucide-react';
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
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function RepairEscalationPanel({ feed }) {
  const [showRetryDialog, setShowRetryDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const queryClient = useQueryClient();

  if (!feed || feed.repair_status !== 'failed') return null;

  const handleRetryRepair = async () => {
    setIsLoading(true);
    try {
      const res = await base44.functions.invoke('autoRepairSources', {});
      const feedResult = res.data?.results?.find(r => r.feed_id === feed.id);
      
      if (feedResult?.status === 'resolved') {
        toast.success('Source auto-repaired!');
        queryClient.invalidateQueries({ queryKey: ['feeds'] });
      } else {
        toast.error('Auto-repair did not resolve this source. Try providing more specific URL.');
      }
    } catch (error) {
      toast.error('Retry failed: ' + error.message);
    } finally {
      setIsLoading(false);
      setShowRetryDialog(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await base44.entities.Feed.delete(feed.id);
      toast.success('Source deleted');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    } catch (error) {
      toast.error('Delete failed: ' + error.message);
    } finally {
      setIsLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleMarkInactive = async () => {
    try {
      await base44.entities.Feed.update(feed.id, { status: 'paused' });
      toast.success('Source marked inactive');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    } catch (error) {
      toast.error('Failed to update: ' + error.message);
    }
  };

  // Show repair actions attempted
  const repairLog = feed.repair_actions_taken || [];

  return (
    <div className="my-2 rounded-2xl border border-red-400/25 bg-red-400/10">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <h4 className="mb-1 font-display text-[15px] font-semibold text-red-200">Needs your input</h4>
            <p className="text-sm text-red-300/90 mb-3">
              {feed.escalation_reason || 'The system could not automatically recover this source.'}
            </p>

            {repairLog.length > 0 && (
              <div className="mb-3 rounded-xl bg-black/20 p-2 text-xs text-red-200/70">
                <p className="micro-label mb-1 text-red-300/70">System attempted</p>
                <ul className="space-y-0.5 font-mono text-[11px]">
                  {repairLog.slice(-3).map((log, idx) => (
                    <li key={idx} className="text-red-300/60">
                      · {log.action.replace(/_/g, ' ')}: {log.result === 'success' ? '✓' : '✗'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="btn-soft h-auto"
                onClick={() => setShowRetryDialog(true)}
                disabled={isLoading}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Retry auto-repair
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="btn-ghost h-auto"
                onClick={handleMarkInactive}
                disabled={isLoading}
              >
                <Zap className="w-4 h-4 mr-1" />
                Mark inactive
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl border-red-400/30 text-red-300 hover:bg-red-400/10"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isLoading}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Retry Confirmation */}
      <AlertDialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retry auto-repair?</AlertDialogTitle>
            <AlertDialogDescription>
              The system will attempt all repair strategies again. If you have a more specific URL (like /blog or /news), update the source URL first for better results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetryRepair} disabled={isLoading} className="btn-brand">
              {isLoading ? 'Repairing...' : 'Retry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{feed.name}" and all associated stories. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isLoading} className="rounded-xl bg-red-500 text-white hover:bg-red-600">
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}