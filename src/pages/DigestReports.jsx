import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, Calendar, Play, Loader2, TrendingUp, TrendingDown,
  Minus, AlertTriangle, ArrowUpRight, ArrowDownRight, RefreshCw,
  ChevronDown, ChevronUp, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, subMonths, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';

const TRAJECTORY_CONFIG = {
  rising:     { icon: TrendingUp,    color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Rising' },
  falling:    { icon: TrendingDown,  color: 'text-red-400',     bg: 'bg-red-400/10',     label: 'Falling' },
  stable:     { icon: Minus,         color: 'text-stone-400',   bg: 'bg-stone-700',      label: 'Stable' },
  volatile:   { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Volatile' },
  peaked:     { icon: ArrowUpRight,  color: 'text-orange-400',  bg: 'bg-orange-400/10',  label: 'Peaked' },
  resolving:  { icon: ArrowDownRight,color: 'text-blue-400',    bg: 'bg-blue-400/10',    label: 'Resolving' },
};

function TrajectoryBadge({ trajectory }) {
  const cfg = TRAJECTORY_CONFIG[trajectory] || TRAJECTORY_CONFIG.stable;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

const QUICK_RANGES = [
  { label: 'Last 30 days',    getValue: () => ({ start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd'), period: 'Monthly' }) },
  { label: 'Last month',      getValue: () => { const d = subMonths(new Date(), 1); return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd'), period: 'Monthly' }; } },
  { label: 'Last quarter',    getValue: () => { const d = subMonths(new Date(), 3); return { start: format(startOfQuarter(d), 'yyyy-MM-dd'), end: format(endOfQuarter(d), 'yyyy-MM-dd'), period: 'Quarterly' }; } },
  { label: 'Last 90 days',    getValue: () => ({ start: format(subDays(new Date(), 90), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd'), period: 'Quarterly' }) },
  { label: 'Last 6 months',   getValue: () => ({ start: format(subMonths(new Date(), 6), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd'), period: 'Semi-Annual' }) },
  { label: 'Custom',          getValue: () => null },
];

export default function DigestReports() {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }),
    enabled: !!user,
  });

  const [selectedDigestId, setSelectedDigestId] = useState('');
  const [quickRange, setQuickRange] = useState('Last 30 days');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [periodLabel, setPeriodLabel] = useState('Monthly');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [expandedThemes, setExpandedThemes] = useState({});

  const handleQuickRange = (label) => {
    setQuickRange(label);
    if (label !== 'Custom') {
      const range = QUICK_RANGES.find(r => r.label === label)?.getValue();
      if (range) {
        setStartDate(range.start);
        setEndDate(range.end);
        setPeriodLabel(range.period);
      }
    }
  };

  const runReport = async () => {
    if (!selectedDigestId) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await base44.functions.invoke('generateDigestReport', {
        digest_id: selectedDigestId,
        start_date: startDate,
        end_date: endDate,
        period_label: periodLabel,
      });
      setReport(res.data);
    } catch (e) {
      setError(e.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const selectedDigest = digests.find(d => d.id === selectedDigestId);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="w-6 h-6 text-[hsl(var(--primary))]" />
          <h1 className="text-3xl font-bold text-stone-100">Digest Reports</h1>
        </div>
        <p className="text-stone-500 text-sm">
          Analyze how topics and trends in your digests evolve over time — monthly, quarterly, or any custom range.
        </p>
      </div>

      {/* Config panel */}
      <div className="bg-stone-900 border border-stone-800 p-5 mb-6">
        <h2 className="text-sm font-semibold text-stone-300 mb-4">Configure Report</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Digest selector */}
          <div>
            <label className="text-xs text-stone-500 mb-1.5 block">Select Digest</label>
            <Select value={selectedDigestId} onValueChange={setSelectedDigestId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a digest..." />
              </SelectTrigger>
              <SelectContent>
                {digests.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick range */}
          <div>
            <label className="text-xs text-stone-500 mb-1.5 block">Date Range</label>
            <Select value={quickRange} onValueChange={handleQuickRange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUICK_RANGES.map(r => (
                  <SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom date inputs */}
        {quickRange === 'Custom' && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-stone-500 mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 text-stone-200 text-sm px-3 py-2 focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 text-stone-200 text-sm px-3 py-2 focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
          </div>
        )}

        {/* Date display for non-custom */}
        {quickRange !== 'Custom' && (
          <div className="flex items-center gap-2 mb-4 text-xs text-stone-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{format(new Date(startDate), 'MMM d, yyyy')} → {format(new Date(endDate), 'MMM d, yyyy')}</span>
          </div>
        )}

        <Button
          onClick={runReport}
          disabled={!selectedDigestId || loading}
          className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-bold gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Generating Report...' : 'Run Report'}
        </Button>
        {loading && (
          <p className="text-xs text-stone-500 mt-2">This uses AI analysis and may take 20–40 seconds...</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-400 p-4 mb-6 text-sm">
          {error === 'No deliveries found in this date range'
            ? 'No digest deliveries found in this date range. Try a wider range or a different digest.'
            : `Error: ${error}`}
        </div>
      )}

      {/* Report output */}
      {report?.report && (
        <div className="space-y-4">
          {/* Report title */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-100">
                {report.digest_name} — {report.period_label || 'Trend'} Report
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                {report.delivery_count} digest{report.delivery_count !== 1 ? 's' : ''} analyzed · {format(new Date(report.start_date), 'MMM d, yyyy')} – {format(new Date(report.end_date), 'MMM d, yyyy')}
              </p>
            </div>
            <button onClick={runReport} className="p-1.5 text-stone-600 hover:text-stone-300 transition" title="Regenerate">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Executive Summary */}
          <div className="bg-stone-900 border border-[hsl(var(--primary))]/30 p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-[hsl(var(--primary))]" />
              <span className="text-xs font-semibold text-[hsl(var(--primary))] uppercase tracking-widest">Executive Summary</span>
            </div>
            <p className="text-stone-200 text-sm leading-relaxed">{report.report.executive_summary}</p>
          </div>

          {/* Key Themes */}
          {report.report.key_themes?.length > 0 && (
            <div className="bg-stone-900 border border-stone-800 p-5">
              <h3 className="text-sm font-semibold text-stone-300 mb-3">Key Themes & Evolution</h3>
              <div className="space-y-3">
                {report.report.key_themes.map((theme, i) => (
                  <div key={i} className="border border-stone-800 p-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => setExpandedThemes(p => ({ ...p, [i]: !p[i] }))}
                      >
                        <span className="text-sm font-medium text-stone-200">{theme.theme}</span>
                        <TrajectoryBadge trajectory={theme.trajectory} />
                        {expandedThemes[i] ? <ChevronUp className="w-3.5 h-3.5 text-stone-600 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-600 ml-auto" />}
                      </button>
                    </div>
                    {expandedThemes[i] && (
                      <p className="text-xs text-stone-400 leading-relaxed mt-2 pl-0">{theme.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inflection Points */}
          {report.report.inflection_points?.length > 0 && (
            <div className="bg-stone-900 border border-stone-800 p-5">
              <h3 className="text-sm font-semibold text-stone-300 mb-3">Significant Inflection Points</h3>
              <div className="space-y-3">
                {report.report.inflection_points.map((pt, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] mt-1.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-[hsl(var(--primary))]">{pt.date}</span>
                        <span className="text-sm text-stone-200">{pt.event}</span>
                      </div>
                      <p className="text-xs text-stone-500">{pt.significance}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend Trajectories */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.report.escalating_topics?.length > 0 && (
              <div className="bg-emerald-950/20 border border-emerald-900/40 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Escalating</span>
                </div>
                <ul className="space-y-1">
                  {report.report.escalating_topics.map((t, i) => (
                    <li key={i} className="text-xs text-stone-300">• {t}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.report.deescalating_topics?.length > 0 && (
              <div className="bg-blue-950/20 border border-blue-900/40 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">De-escalating</span>
                </div>
                <ul className="space-y-1">
                  {report.report.deescalating_topics.map((t, i) => (
                    <li key={i} className="text-xs text-stone-300">• {t}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.report.cyclical_topics?.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-900/40 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Cyclical / Volatile</span>
                </div>
                <ul className="space-y-1">
                  {report.report.cyclical_topics.map((t, i) => (
                    <li key={i} className="text-xs text-stone-300">• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Outlook */}
          {report.report.outlook && (
            <div className="bg-stone-900 border border-stone-800 p-5">
              <h3 className="text-sm font-semibold text-stone-300 mb-2">Outlook</h3>
              <p className="text-sm text-stone-400 leading-relaxed">{report.report.outlook}</p>
            </div>
          )}

          {/* Data Summary */}
          {report.report.data_summary && (
            <div className="flex flex-wrap gap-4 text-xs text-stone-600 border-t border-stone-800 pt-4">
              <span>📊 {report.report.data_summary.digest_count} digests analyzed</span>
              <span>📅 {report.report.data_summary.date_range}</span>
              {report.report.data_summary.most_active_period && (
                <span>🔥 Most active: {report.report.data_summary.most_active_period}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!report && !loading && !error && (
        <div className="text-center py-16 text-stone-600">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a digest and date range above, then run a report to see trend analysis.</p>
        </div>
      )}
    </div>
  );
}