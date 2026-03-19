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
  let color = 'text-blue-500';
  
  if (maxSeverity === 3) {
    IconComponent = AlertCircle;
    color = 'text-red-500';
  } else if (maxSeverity === 2) {
    IconComponent = AlertTriangle;
    color = 'text-amber-500';
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`p-1 ${color} hover:opacity-70 transition`}
        title={`${issues.length} issue${issues.length !== 1 ? 's' : ''}`}
      >
        <IconComponent className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Source Issues ({issues.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {issues.map((issue, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-md border text-sm ${
                  issue.severity === 'critical'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : issue.severity === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}
              >
                <div className="font-semibold mb-1 capitalize">{issue.type.replace(/_/g, ' ')}</div>
                <div>{issue.message}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}