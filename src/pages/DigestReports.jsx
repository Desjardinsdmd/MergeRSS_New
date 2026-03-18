import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, Play, Loader2, TrendingUp, TrendingDown,
  Minus, AlertTriangle, ArrowUpRight, ArrowDownRight, RefreshCw,
  ChevronDown, ChevronUp, FileText, Check, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, subDays } from 'date-fns';

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



export default function DigestReports() {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setUser); }, []);

  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }),
    enabled: !!user,
  });

  const [selectedDigestIds, setSelectedDigestIds] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [expandedThemes, setExpandedThemes] = useState({});
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleDigest = (id) => {
    setSelectedDigestIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const runReport = async () => {
    if (!selectedDigestIds.length) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await base44.functions.invoke('generateDigestReport', {
        digest_ids: selectedDigestIds,
        start_date: startDate,
        end_date: endDate,
      });
      setReport(res.data);
    } catch (e) {
      setError(e.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Digest multi-select dropdown */}
          <div className="md:col-span-1 relative" ref={dropdownRef}>
            <label className="text-xs text-stone-500 mb-1.5 block">Select Digest(s)</label>
            <button
              onClick={() => setDropdownOpen(p => !p)}
              className="w-full flex items-center justify-between bg-stone-800 border border-stone-700 text-sm px-3 py-2 text-left hover:border-stone-500 transition-colors focus:outline-none focus:border-[hsl(var(--primary))]"
            >
              <span className={selectedDigestIds.length ? 'text-stone-200' : 'text-stone-500'}>
                {selectedDigestIds.length === 0
                  ? 'Choose digests...'
                  : selectedDigestIds.length === 1
                    ? digests.find(d => d.id === selectedDigestIds[0])?.name
                    : `${selectedDigestIds.length} digests selected`}
              </span>
              <ChevronDown className="w-4 h-4 text-stone-500 flex-shrink-0" />
            </button>
            {dropdownOpen && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-stone-800 border border-stone-700 shadow-xl max-h-60 overflow-y-auto">
                {digests.length === 0 && (
                  <div className="px-3 py-2 text-xs text-stone-500">No digests found</div>
                )}
                {digests.map(d => {
                  const selected = selectedDigestIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleDigest(d.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-stone-700 transition-colors"
                    >
                      <div className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]' : 'border-stone-600'}`}>
                        {selected && <Check className="w-2.5 h-2.5 text-stone-900" />}
                      </div>
                      <span className={selected ? 'text-stone-100' : 'text-stone-400'}>{d.name}</span>
                    </button>
                  );
                })}
                {selectedDigestIds.length > 0 && (
                  <button
                    onClick={() => setSelectedDigestIds([])}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-stone-700 border-t border-stone-700 transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear selection
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label className="text-xs text-stone-500 mb-1.5 block">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 text-stone-200 text-sm px-3 py-2 focus:outline-none focus:border-[hsl(var(--primary))]"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="text-xs text-stone-500 mb-1.5 block">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 text-stone-200 text-sm px-3 py-2 focus:outline-none focus:border-[hsl(var(--primary))]"
            />
          </div>
        </div>

        <Button
          onClick={runReport}
          disabled={!selectedDigestIds.length || loading}
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
                {report.delivery_count} digest{report.delivery_count !== 1 ? 's' : ''} analyzed
              </p>
            </div>
            <button onClick={runReport} className="p-1.5 text-stone-600 hover:text-stone-300 transition" title="Regenerate">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Range callout */}
          {(() => {
            const reqStart = format(new Date(report.requested_start), 'MMM d, yyyy');
            const reqEnd = format(new Date(report.requested_end), 'MMM d, yyyy');
            const actStart = format(new Date(report.actual_start), 'MMM d, yyyy');
            const actEnd = format(new Date(report.actual_end), 'MMM d, yyyy');
            const differs = reqStart !== actStart || reqEnd !== actEnd;
            return (
              <div className={`p-4 border text-sm ${differs ? 'bg-amber-950/20 border-amber-900/50' : 'bg-stone-900 border-stone-800'}`}>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span className="text-stone-500">
                    <span className="text-stone-400 font-medium">Requested range:</span>{' '}
                    {reqStart} – {reqEnd}
                  </span>
                  <span className={differs ? 'text-amber-300' : 'text-stone-500'}>
                    <span className={`font-medium ${differs ? 'text-amber-400' : 'text-stone-400'}`}>Actual data range:</span>{' '}
                    {actStart} – {actEnd}
                  </span>
                </div>
                {differs && (
                  <p className="text-xs text-amber-500 mt-1.5">
                    ⚠ No digest data was found for part of the requested range. The report is based on available data only.
                  </p>
                )}
              </div>
            );
          })()}

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