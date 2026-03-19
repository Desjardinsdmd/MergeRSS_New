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
          <DialogTitle>Manage Source</DialogTitle>
          <DialogDescription>{feed?.name}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {feed?.status !== 'paused' && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction('pause')}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Pause Source
            </Button>
          )}

          {feed?.status === 'paused' && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction('resume')}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Resume Source
            </Button>
          )}

          {health?.issues?.some(i => i.type === 'high_failure_rate') && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction('reset')}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reset & Retry
            </Button>
          )}

          <Button
            variant="destructive"
            className="w-full justify-start"
            onClick={() => handleAction('delete')}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete Source
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}