import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, AlertCircle, TrendingUp } from 'lucide-react';

export default function SourceHealthDashboard() {
  const { data: healthData = [] } = useQuery({
    queryKey: ['admin-source-health'],
    queryFn: () => base44.entities.SourceHealth.list('-evaluated_at', 1000),
    staleTime: 5 * 60 * 1000,
  });

  const stats = React.useMemo(() => {
    const total = healthData.length;
    const healthy = healthData.filter(h => h.health_state === 'healthy').length;
    const degrading = healthData.filter(h => h.health_state === 'degrading').length;
    const failing = healthData.filter(h => h.health_state === 'failing').length;

    const avgScore = total > 0 ? Math.round(healthData.reduce((sum, h) => sum + (h.health_score || 0), 0) / total) : 0;
    
    const totalIssues = healthData.reduce((sum, h) => sum + (h.issues?.length || 0), 0);

    return { total, healthy, degrading, failing, avgScore, totalIssues };
  }, [healthData]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="micro-label">Total sources</p>
                <p className="font-display text-3xl font-semibold tabular-nums text-stone-100 mt-1">{stats.total}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-stone-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="micro-label">Healthy</p>
                <p className="font-display text-3xl font-semibold tabular-nums text-emerald-300 mt-1">{stats.healthy}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-400/70" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="micro-label">Degrading</p>
                <p className="font-display text-3xl font-semibold tabular-nums text-amber-300 mt-1">{stats.degrading}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-400/70" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="micro-label">Failing</p>
                <p className="font-display text-3xl font-semibold tabular-nums text-red-300 mt-1">{stats.failing}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400/70" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base font-semibold text-stone-100">Health metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-400">Average health score</span>
            <span className="font-mono text-lg font-semibold text-stone-100">{stats.avgScore}%</span>
          </div>
          <div className="w-full bg-stone-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                stats.avgScore >= 80 ? 'bg-emerald-400' : stats.avgScore >= 50 ? 'bg-amber-400' : 'bg-red-400'
              }`}
              style={{ width: `${stats.avgScore}%` }}
            />
          </div>

          <div className="pt-3 border-t border-white/[0.07]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-400">Total issues detected</span>
              <span className="font-mono text-lg font-semibold text-stone-100">{stats.totalIssues}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}