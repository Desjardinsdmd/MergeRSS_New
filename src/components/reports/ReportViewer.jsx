import React, { useState } from 'react';
import {
  FileText, Download, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, BarChart2, ChevronDown, ChevronUp, Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { generatePremiumPdf } from '@/lib/generatePremiumPdf';
import { cn } from '@/lib/utils';
import Markdown, { MarkdownInline, hasBlockMarkdown, stripMarkdown } from '@/components/reports/Markdown';

// Semantic colours (BRAND.md): emerald rising, red falling, sky trending/informational, neutral otherwise.
const TRAJECTORY_CONFIG = {
  rising:    { cls: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300', label: 'Rising ↑' },
  falling:   { cls: 'border-red-400/25 bg-red-400/10 text-red-300',             label: 'Falling ↓' },
  stable:    { cls: 'border-white/10 bg-white/[0.03] text-stone-300',           label: 'Stable →' },
  volatile:  { cls: 'border-sky-400/25 bg-sky-400/10 text-sky-300',             label: 'Volatile ↕' },
  peaked:    { cls: 'border-sky-400/25 bg-sky-400/10 text-sky-300',             label: 'Peaked ⌃' },
  resolving: { cls: 'border-white/10 bg-white/[0.03] text-stone-300',           label: 'Resolving ↘' },
};

function TrajectoryBadge({ trajectory }) {
  const cfg = TRAJECTORY_CONFIG[trajectory] || TRAJECTORY_CONFIG.stable;
  return (
    <span className={cn('inline-flex flex-shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

/** Numbered section band: two-digit mono number, hairline divider, mono micro label. */
function SectionBand({ number, label, accent = false }) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-6 py-3',
      accent ? 'panel-accent rounded-none border-x-0 border-t-0' : 'border-b border-white/[0.06] bg-white/[0.02]'
    )}>
      <span className={cn('font-mono text-[11px] font-semibold', accent ? 'text-[#C4A5FD]' : 'text-stone-500')}>{number}</span>
      <span className={cn('h-3 w-px', accent ? 'bg-[hsl(var(--brand)/0.45)]' : 'bg-white/10')} aria-hidden="true" />
      <h3 className={cn('micro-label m-0', accent && 'text-stone-100')}>{label}</h3>
    </div>
  );
}

function Section({ number, label, accent, children }) {
  return (
    <section className="panel overflow-hidden" aria-label={label}>
      <SectionBand number={number} label={label} accent={accent} />
      {children}
    </section>
  );
}

function safeFormat(value, fmt) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : format(d, fmt);
}

function firstSentence(text) {
  const plain = stripMarkdown(text).replace(/\s+/g, ' ').trim();
  return plain.split(/(?<=[.!?])\s+/)[0] || '';
}

/**
 * ReportViewer — renders a saved or freshly-generated report.
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

  // Section numbers follow the sections that are actually present.
  let sectionNo = 0;
  const nextNo = () => String(++sectionNo).padStart(2, '0');

  const hasTrends = report.escalating_topics?.length > 0 || report.deescalating_topics?.length > 0 || report.cyclical_topics?.length > 0;
  const takeaway = report.executive_summary ? firstSentence(report.executive_summary) : '';

  const outlookIsStructured = report.outlook && hasBlockMarkdown(report.outlook);
  const outlookSignals = report.outlook && !outlookIsStructured
    ? report.outlook.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 8)
    : [];

  return (
    <div className="space-y-4">

      {/* Report header */}
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Intelligence report</p>
            <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-stone-100">{digestName}</h2>
            <p className="meta mt-2">
              {displayStart && safeFormat(displayStart, 'MMM d, yyyy')}
              {displayEnd && ` – ${safeFormat(displayEnd, 'MMM d, yyyy')}`}
              {deliveryCount > 0 && (
                <> · {deliveryCount} briefing{deliveryCount !== 1 ? 's' : ''} analyzed</>
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button type="button" onClick={handleExportPdf} className="btn-soft">
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export PDF
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="btn-ghost px-2"
                title="Regenerate"
                aria-label="Regenerate report"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {rangediffers && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-400" role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span>
              Data available <span className="font-mono">{safeFormat(actualStart, 'MMM d, yyyy')} – {safeFormat(actualEnd, 'MMM d, yyyy')}</span> only.
              The report is based on the briefings available within the requested range.
            </span>
          </div>
        )}
      </header>

      {/* Executive summary */}
      <Section number={nextNo()} label="Executive summary" accent>
        <div className="space-y-5 p-6">
          {takeaway && (
            <div className="rounded-xl border-l-4 border-[hsl(var(--primary))] bg-white/[0.03] px-5 py-4">
              <p className="micro-label mb-2 text-[#C4A5FD]">Key takeaway</p>
              <p className="text-[15px] font-medium leading-relaxed text-stone-100">{takeaway}</p>
            </div>
          )}
          <Markdown
            text={hasBlockMarkdown(report.executive_summary)
              ? report.executive_summary
              : String(report.executive_summary || '').replace(/\n+/g, '\n\n')}
          />
        </div>
      </Section>

      {/* Key themes */}
      {report.key_themes?.length > 0 && (
        <Section number={nextNo()} label="Key themes and evolution">
          <ul className="divide-y divide-white/[0.06]">
            {report.key_themes.map((theme, i) => {
              const open = !!expandedThemes[i];
              const toggle = () => setExpandedThemes(p => ({ ...p, [i]: !p[i] }));
              return (
                <li key={i} className="px-6 py-4">
                  <button
                    type="button"
                    className="group flex w-full items-start gap-3 text-left"
                    onClick={toggle}
                    aria-expanded={open}
                  >
                    <span className="mt-0.5 w-6 flex-shrink-0 font-mono text-[11px] text-stone-600">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                      <MarkdownInline
                        text={theme.theme}
                        className="text-sm font-semibold text-stone-100 transition-colors group-hover:text-[#C4A5FD]"
                      />
                      <TrajectoryBadge trajectory={theme.trajectory} />
                    </span>
                    <span className="mt-0.5 flex-shrink-0 text-stone-500 group-hover:text-stone-300" aria-hidden="true">
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>
                  {open && theme.description && (
                    <div className="mt-3 pl-9">
                      <Markdown text={theme.description} className="text-stone-400" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Trend trajectories */}
      {hasTrends && (
        <Section number={nextNo()} label="Trend trajectories">
          <div className="grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
            {report.escalating_topics?.length > 0 && (
              <div className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span className="micro-label text-emerald-300">Escalating</span>
                </div>
                <ul className="space-y-2">
                  {report.escalating_topics.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-300">
                      <span className="mt-0.5 flex-shrink-0 font-mono text-xs text-emerald-400" aria-hidden="true">↑</span>
                      <MarkdownInline text={t} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.deescalating_topics?.length > 0 && (
              <div className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
                  <span className="micro-label text-red-300">De-escalating</span>
                </div>
                <ul className="space-y-2">
                  {report.deescalating_topics.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-300">
                      <span className="mt-0.5 flex-shrink-0 font-mono text-xs text-red-400" aria-hidden="true">↓</span>
                      <MarkdownInline text={t} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.cyclical_topics?.length > 0 && (
              <div className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span className="micro-label text-sky-300">Cyclical or volatile</span>
                </div>
                <ul className="space-y-2">
                  {report.cyclical_topics.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-300">
                      <span className="mt-0.5 flex-shrink-0 font-mono text-xs text-sky-400" aria-hidden="true">↕</span>
                      <MarkdownInline text={t} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Inflection points */}
      {report.inflection_points?.length > 0 && (
        <Section number={nextNo()} label="Inflection points">
          <div className="p-6">
            <ol className="relative space-y-6">
              <span className="absolute bottom-2 left-[6px] top-2 w-px bg-white/[0.08]" aria-hidden="true" />
              {report.inflection_points.map((pt, i) => (
                <li key={i} className="relative flex gap-5">
                  <span className="mt-1 flex-shrink-0" aria-hidden="true">
                    <span className="relative z-10 block h-3.5 w-3.5 rounded-full border-2 border-stone-950 bg-[hsl(var(--primary))] shadow-[0_0_0_3px_hsl(var(--brand)/0.18)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#C4A5FD]">{pt.date}</span>
                    <h4 className="mb-1.5 mt-1 text-sm font-semibold leading-snug text-stone-100">
                      <MarkdownInline text={pt.event} />
                    </h4>
                    <Markdown text={pt.significance} className="text-stone-400" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )}

      {/* Outlook */}
      {report.outlook && (
        <Section number={nextNo()} label="Outlook and forward signals">
          <div className="p-6">
            {outlookIsStructured ? (
              <Markdown text={report.outlook} />
            ) : (
              <ol className="space-y-3">
                {outlookSignals.map((signal, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.12)] font-mono text-[10px] font-semibold text-[#C4A5FD]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <MarkdownInline text={signal.trim()} className="text-sm leading-relaxed text-stone-300" />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Section>
      )}

      {/* Data summary footer */}
      {report.data_summary && (
        <footer className="panel px-6 py-4">
          <div className="meta flex flex-wrap gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5">
              <BarChart2 className="h-3 w-3" aria-hidden="true" />
              {report.data_summary.digest_count} briefings analyzed
            </span>
            {report.data_summary.date_range && (
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3" aria-hidden="true" />
                {report.data_summary.date_range}
              </span>
            )}
            {report.data_summary.most_active_period && (
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                Most active: {report.data_summary.most_active_period}
              </span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
