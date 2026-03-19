import React, { useState } from 'react';
import { AlertCircle, Zap, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function NeedsAttentionSummary({ failingCount, degradingCount, onFilter, onRepairComplete }) {
  const [isRepairing, setIsRepairing] = useState(false);
  const totalIssues = failingCount + degradingCount;

  if (totalIssues === 0) return null;

  const handleAutoRepair = async () => {
    setIsRepairing(true);
    try {
      const res = await base44.functions.invoke('autoRepairSources', {});
      toast.success(`Auto-repair complete: ${res.data?.repaired || 0} sources fixed`);
      if (res.data?.escalated > 0) {
        toast.info(`${res.data.escalated} sources need review`);
      }
      onRepairComplete?.();
    } catch (error) {
      toast.error('Auto-repair failed: ' + error.message);
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/10 mb-6">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-200 mb-1">
              {totalIssues} source{totalIssues !== 1 ? 's' : ''} being repaired
            </h3>
            <div className="text-sm text-amber-300/80 mb-3">
              {failingCount > 0 && <span>{failingCount} failing • </span>}
              {degradingCount > 0 && <span>{degradingCount} degrading</span>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-bold"
                onClick={handleAutoRepair}
                disabled={isRepairing}
              >
                <Wrench className="w-4 h-4 mr-2" />
                {isRepairing ? 'Repairing...' : 'Auto-Repair Now'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
                onClick={() => onFilter('needs-attention')}
              >
                View Details
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}