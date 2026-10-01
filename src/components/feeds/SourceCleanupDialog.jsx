import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export default function SourceCleanupDialog({ feed, health, open, onOpenChange, onComplete }) {
  const [action, setAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAction = async (actionType) => {
    setLoading(true);
    setError(null);
    
    try {
      if (actionType === 'pause') {
        await base44.entities.Feed.update(feed.id, { status: 'paused' });
      } else if (actionType === 'resume') {
        await base44.entities.Feed.update(feed.id, { status: 'active' });
      } else if (actionType === 'delete') {
        await base44.entities.Feed.delete(feed.id);
      } else if (actionType === 'reset') {
        // Reset consecutive errors counter
        await base44.entities.Feed.update(feed.id, { 
          consecutive_errors: 0,
          status: 'active'
        });
      }

      onComplete?.();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold text-stone-100">Manage source</DialogTitle>
          <DialogDescription>{feed?.name}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {feed?.status !== 'paused' && (
            <Button
              variant="outline"
              className="w-full justify-start rounded-xl"
              onClick={() => handleAction('pause')}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Pause source
            </Button>
          )}

          {feed?.status === 'paused' && (
            <Button
              variant="outline"
              className="w-full justify-start rounded-xl"
              onClick={() => handleAction('resume')}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Resume source
            </Button>
          )}

          {health?.issues?.some(i => i.type === 'high_failure_rate') && (
            <Button
              variant="outline"
              className="w-full justify-start rounded-xl"
              onClick={() => handleAction('reset')}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reset and retry
            </Button>
          )}

          <Button
            variant="destructive"
            className="w-full justify-start rounded-xl"
            onClick={() => handleAction('delete')}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete source
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}