import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, AlertCircle, TrendingUp } from 'lucide-react';

export default function SourceHealthDashboard() {
  const { data: healthData = [] } = useQuery({
    queryKey: ['admin-source-health'],
    queryFn: () => base44.asServiceRole.entities.SourceHealth.list('-evaluated_at', 1000),
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
                <p className="text-xs text-stone-500 uppercase tracking-wider">Total Sources</p>
                <p className="text-2xl font-bold text-stone-100 mt-1">{stats.total}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-stone-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500 uppercase tracking-wider">Healthy</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{stats.healthy}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500 uppercase tracking-wider">Degrading</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{stats.degrading}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500 uppercase tracking-wider">Failing</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{stats.failing}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Health Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-400">Average Health Score</span>
            <span className="text-lg font-semibold text-stone-100">{stats.avgScore}%</span>
          </div>
          <div className="w-full bg-stone-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                stats.avgScore >= 80 ? 'bg-green-500' : stats.avgScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${stats.avgScore}%` }}
            />
          </div>

          <div className="pt-3 border-t border-stone-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-400">Total Issues Detected</span>
              <span className="text-lg font-semibold text-stone-100">{stats.totalIssues}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}