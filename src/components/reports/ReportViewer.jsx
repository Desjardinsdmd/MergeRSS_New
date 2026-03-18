import React, { useState } from 'react';
import {
  FileText, Download, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, BarChart2, ChevronDown, ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { generatePremiumPdf } from '@/lib/generatePremiumPdf';

const TRAJECTORY_CONFIG = {
  rising:    { icon: TrendingUp,    color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Rising ↑' },
  falling:   { icon: TrendingDown,  color: 'text-red-400',     bg: 'bg-red-400/10',     label: 'Falling ↓' },
  stable:    { icon: null,          color: 'text-stone-400',   bg: 'bg-stone-700/40',   label: 'Stable →' },
  volatile:  { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Volatile' },
  peaked:    { icon: TrendingUp,    color: 'text-orange-400',  bg: 'bg-orange-400/10',  label: 'Peaked' },
  resolving: { icon: TrendingDown,  color: 'text-blue-400',    bg: 'bg-blue-400/10',    label: 'Resolving ↘' },
};

function TrajectoryBadge({ trajectory }) {
  const cfg = TRAJECTORY_CONFIG[trajectory] || TRAJECTORY_CONFIG.stable;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 font-semibold ${cfg.bg} ${cfg.color} flex-shrink-0`}>
      {cfg.label}
    </span>
  );
}

/**
 * ReportViewer — renders a saved or freshly-generated report with the full premium UI.
 *
 * Props:
 *   report        — the report data object (with executive_summary, key_themes, etc.)
 *   digestName    — string
 *   startDate     — string (YYYY-MM-DD or ISO)
 *   endDate       — string
 *   deliveryCount — number
 *   actualStart   — string (optional, for range mismatch notice)
 *   actualEnd     — string (optional)
 *   requestedStart — string (optional)
 *   requestedEnd  — string (optional)
 *   onRegenerate  — optional callback for the regenerate button
 *   savedReport   — the raw SavedDigestReport entity (used for PDF export)
 */
export default function ReportViewer({
  report,
  digestName,
  startDate,
  endDate,
  deliveryCount,
  actualStart,
  actualEnd,
  requestedStart,
  requestedEnd,
  onRegenerate,
  savedReport,
}) {
  const [expandedThemes, setExpandedThemes] = useState({});

  if (!report) return null;

  const handleExportPdf = () => {
    const payload = savedReport || {
      report,
      digest_name: digestName,
      start_date: startDate,
      end_date: endDate,
      delivery_count: deliveryCount,
    };
    generatePremiumPdf(payload);
  };

  const displayStart = actualStart || startDate;
  const displayEnd = actualEnd || endDate;

  const rangediffers = requestedStart && requestedEnd && actualStart && actualEnd &&
    (requestedStart !== actualStart || requestedEnd !== actualEnd);

  return (
    <div className="space-y-0">

      {/* ── Report Header ── */}
      <div className="bg-stone-950 border border-stone-800 border-b-0 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[hsl(var(--primary))] uppercase">Intelligence Report</span>
            </div>
            <h2 className="text-2xl font-bold text-stone-100 leading-tight">{digestName}</h2>
            <p className="text-sm text-stone-500 mt-1">
              {displayStart && format(new Date(displayStart), 'MMMM d, yyyy')}
              {displayEnd && ` – ${format(new Date(displayEnd), 'MMMM d, yyyy')}`}
              {deliveryCount > 0 && (
                <><span className="mx-2 text-stone-700">·</span>{deliveryCount} issue{deliveryCount !== 1 ? 's' : ''} analyzed</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[hsl(var(--primary))] text-stone-900 hover:opacity-90 transition"
            >
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
            {onRegenerate && (
              <button onClick={onRegenerate} className="p-1.5 text-stone-600 hover:text-stone-300 transition border border-stone-800" title="Regenerate">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {rangediffers && (
          <div className="flex items-start gap-2 p-3 bg-amber-950/20 border border-amber-900/40 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span className="text-amber-300">
              Data available {format(new Date(actualStart), 'MMM d, yyyy')} – {format(new Date(actualEnd), 'MMM d, yyyy')} only.
              Report is based on available issues within the requested range.
            </span>
          </div>
        )}
      </div>

      {/* ── 01 Executive Summary ── */}
      <div className="border border-stone-800 border-t-0">
        <div className="flex items-center gap-3 px-6 py-3 bg-[hsl(var(--primary))]">
          <span className="text-[10px] font-bold text-stone-900">01</span>
          <div className="w-px h-3 bg-stone-900/30" />
          <span className="text-[10px] font-bold text-stone-900 uppercase tracking-widest">Executive Summary</span>
        </div>
        <div className="p-6 bg-stone-950 space-y-5">
          {report.executive_summary && (
            <div className="border-l-4 border-[hsl(var(--primary))] bg-stone-900 px-5 py-4">
              <p className="text-[10px] font-bold tracking-widest text-[hsl(var(--primary))] uppercase mb-2">Key Takeaway</p>
              <p className="text-sm font-medium text-stone-200 leading-relaxed">
                {report.executive_summary.split(/(?<=[.!?])\s+/)[0]}
              </p>
            </div>
          )}
          <div className="space-y-3">
            {(report.executive_summary || '').split(/\n+/).filter(p => p.trim()).map((para, i) => (
              <p key={i} className="text-sm text-stone-300 leading-[1.8]">{para}</p>
            ))}
          </div>
        </div>
      </div>

      {/* ── 02 Key Themes ── */}
      {report.key_themes?.length > 0 && (
        <div className="border border-stone-800 border-t-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-stone-900 border-b border-stone-800">
            <span className="text-[10px] font-bold text-stone-500">02</span>
            <div className="w-px h-3 bg-stone-700" />
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Key Themes & Evolution</span>
          </div>
          <div className="bg-stone-950 divide-y divide-stone-800/60">
            {report.key_themes.map((theme, i) => (
              <div key={i} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-stone-600 flex-shrink-0 w-6">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <button
                      className="flex items-center gap-3 flex-1 text-left group"
                      onClick={() => setExpandedThemes(p => ({ ...p, [i]: !p[i] }))}
                    >
                      <span className="text-sm font-semibold text-stone-100 group-hover:text-[hsl(var(--primary))] transition-colors">
                        {theme.theme}
                      </span>
                      <TrajectoryBadge trajectory={theme.trajectory} />
                    </button>
                  </div>
                  <button
                    onClick={() => setExpandedThemes(p => ({ ...p, [i]: !p[i] }))}
                    className="text-stone-600 hover:text-stone-400 flex-shrink-0 mt-0.5"
                  >
                    {expandedThemes[i] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {expandedThemes[i] && (
                  <div className="mt-4 ml-9">
                    <p className="text-sm text-stone-400 leading-[1.8]">{theme.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 03 Trend Trajectories ── */}
      {(report.escalating_topics?.length > 0 || report.deescalating_topics?.length > 0 || report.cyclical_topics?.length > 0) && (
        <div className="border border-stone-800 border-t-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-stone-900 border-b border-stone-800">
            <span className="text-[10px] font-bold text-stone-500">03</span>
            <div className="w-px h-3 bg-stone-700" />
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Trend Trajectories</span>
          </div>
          <div className="bg-stone-950 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-stone-800">
            {report.escalating_topics?.length > 0 && (
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Escalating</span>
                </div>
                <ul className="space-y-2">
                  {report.escalating_topics.map((t, i) => (
                    <li key={i} className="text-xs text-stone-300 flex items-start gap-2">
                      <span className="text-emerald-500 flex-shrink-0 mt-0.5">↑</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.deescalating_topics?.length > 0 && (
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase">De-escalating</span>
                </div>
                <ul className="space-y-2">
                  {report.deescalating_topics.map((t, i) => (
                    <li key={i} className="text-xs text-stone-300 flex items-start gap-2">
                      <span className="text-blue-400 flex-shrink-0 mt-0.5">↓</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.cyclical_topics?.length > 0 && (
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold tracking-widest text-amber-400 uppercase">Cyclical / Volatile</span>
                </div>
                <ul className="space-y-2">
                  {report.cyclical_topics.map((t, i) => (
                    <li key={i} className="text-xs text-stone-300 flex items-start gap-2">
                      <span className="text-amber-400 flex-shrink-0 mt-0.5">⚡</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 04 Inflection Points ── */}
      {report.inflection_points?.length > 0 && (
        <div className="border border-stone-800 border-t-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-stone-900 border-b border-stone-800">
            <span className="text-[10px] font-bold text-stone-500">04</span>
            <div className="w-px h-3 bg-stone-700" />
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Inflection Points</span>
          </div>
          <div className="bg-stone-950 p-6">
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-stone-800" />
              <div className="space-y-6">
                {report.inflection_points.map((pt, i) => (
                  <div key={i} className="flex gap-5 relative">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-3.5 h-3.5 rounded-full bg-[hsl(var(--primary))] border-2 border-stone-950 relative z-10" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold tracking-widest text-[hsl(var(--primary))] uppercase">{pt.date}</span>
                      <h4 className="text-sm font-semibold text-stone-100 mt-1 mb-2 leading-snug">{pt.event}</h4>
                      <p className="text-xs text-stone-400 leading-relaxed">{pt.significance}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 05 Outlook ── */}
      {report.outlook && (
        <div className="border border-stone-800 border-t-0">
          <div className="flex items-center gap-3 px-6 py-3 bg-stone-900 border-b border-stone-800">
            <span className="text-[10px] font-bold text-stone-500">05</span>
            <div className="w-px h-3 bg-stone-700" />
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Outlook & Forward Signals</span>
          </div>
          <div className="bg-stone-950 p-6 space-y-3">
            {report.outlook.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 8).map((signal, i) => (
              <div key={i} className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-5 h-5 bg-stone-800 border border-stone-700 flex items-center justify-center text-[9px] font-bold text-[hsl(var(--primary))] mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-stone-300 leading-relaxed">{signal.trim()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Data Summary Footer ── */}
      {report.data_summary && (
        <div className="border border-stone-800 border-t-0 bg-stone-900 px-6 py-4">
          <div className="flex flex-wrap gap-6 text-xs text-stone-600">
            <span className="flex items-center gap-1.5">
              <BarChart2 className="w-3 h-3" />
              {report.data_summary.digest_count} issues analyzed
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              {report.data_summary.date_range}
            </span>
            {report.data_summary.most_active_period && (
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" />
                Most active: {report.data_summary.most_active_period}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}