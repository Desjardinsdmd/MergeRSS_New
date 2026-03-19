import React from 'react';
import { AlertCircle, RotateCcw, Zap, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
    <Card className="border-red-500/30 bg-red-500/10 my-2">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-200 mb-1">Needs Your Input</h4>
            <p className="text-sm text-red-300/90 mb-3">
              {feed.escalation_reason || 'The system could not automatically recover this source.'}
            </p>

            {repairLog.length > 0 && (
              <div className="bg-red-950/30 rounded p-2 mb-3 text-xs text-red-200/70">
                <p className="font-medium mb-1">System attempted:</p>
                <ul className="space-y-0.5">
                  {repairLog.slice(-3).map((log, idx) => (
                    <li key={idx} className="text-red-300/60">
                      • {log.action.replace(/_/g, ' ')}: {log.result === 'success' ? '✓' : '✗'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-blue-300 border-blue-500/30 hover:bg-blue-500/10"
                onClick={() => setShowRetryDialog(true)}
                disabled={isLoading}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Retry Auto-Repair
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-stone-400 border-stone-700 hover:bg-stone-800"
                onClick={handleMarkInactive}
                disabled={isLoading}
              >
                <Zap className="w-4 h-4 mr-1" />
                Mark Inactive
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-400 border-red-700 hover:bg-red-950/30"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isLoading}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Retry Confirmation */}
      <AlertDialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retry Auto-Repair?</AlertDialogTitle>
            <AlertDialogDescription>
              The system will attempt all repair strategies again. If you have a more specific URL (like /blog or /news), update the source URL first for better results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetryRepair} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? 'Repairing...' : 'Retry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{feed.name}" and all associated items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isLoading} className="bg-red-600 hover:bg-red-700">
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}