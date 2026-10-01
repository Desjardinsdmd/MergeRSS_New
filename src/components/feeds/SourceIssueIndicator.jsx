import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function SourceIssueIndicator({ issues = [] }) {
  const [open, setOpen] = useState(false);

  if (!issues || issues.length === 0) return null;

  // Get highest severity
  const severities = { critical: 3, warning: 2, info: 1 };
  const maxSeverity = Math.max(...issues.map(i => severities[i.severity] || 0));
  
  let IconComponent = Info;
  let color = 'text-sky-400';
  
  if (maxSeverity === 3) {
    IconComponent = AlertCircle;
    color = 'text-red-400';
  } else if (maxSeverity === 2) {
    IconComponent = AlertTriangle;
    color = 'text-amber-400';
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-lg p-1 ${color} transition hover:bg-white/[0.05]`}
        title={`${issues.length} issue${issues.length !== 1 ? 's' : ''}`}
        aria-label={`${issues.length} issue${issues.length !== 1 ? 's' : ''}`}
      >
        <IconComponent className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Source issues <span className="font-mono text-stone-500">{issues.length}</span></DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {issues.map((issue, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-3 text-sm ${
                  issue.severity === 'critical'
                    ? 'border-red-400/25 bg-red-400/10 text-red-300'
                    : issue.severity === 'warning'
                    ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
                    : 'border-sky-400/25 bg-sky-400/10 text-sky-300'
                }`}
              >
                <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wider">{issue.type.replace(/_/g, ' ')}</div>
                <div>{issue.message}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}