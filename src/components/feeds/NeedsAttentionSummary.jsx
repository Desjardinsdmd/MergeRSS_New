import React, { useState } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
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
    <div className="mb-6 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4" role="status">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="mb-1 font-display text-[15px] font-semibold text-amber-300">
            {totalIssues} source{totalIssues !== 1 ? 's' : ''} being repaired
          </h3>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-amber-300/80">
            {failingCount > 0 && <span>{failingCount} failing</span>}
            {failingCount > 0 && degradingCount > 0 && <span> · </span>}
            {degradingCount > 0 && <span>{degradingCount} degrading</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/15 px-3 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-60"
              onClick={handleAutoRepair}
              disabled={isRepairing}
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              {isRepairing ? 'Repairing...' : 'Auto-repair now'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onFilter('needs-attention')}
            >
              View details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
