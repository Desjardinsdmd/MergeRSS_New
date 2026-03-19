import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NeedsAttentionSummary({ failingCount, degradingCount, onFilter }) {
  const totalIssues = failingCount + degradingCount;

  if (totalIssues === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/10 mb-6">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-200 mb-1">
              {totalIssues} source{totalIssues !== 1 ? 's' : ''} need{totalIssues === 1 ? 's' : ''} attention
            </h3>
            <div className="text-sm text-amber-300/80 mb-3">
              {failingCount > 0 && <span>{failingCount} failing • </span>}
              {degradingCount > 0 && <span>{degradingCount} degrading</span>}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
              onClick={() => onFilter('needs-attention')}
            >
              View Problematic Sources
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}