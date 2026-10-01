import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, Play, Loader2,
  ChevronDown, ChevronUp, FileText, Check, X, Download, Inbox, Eye, ClipboardList, Trash2
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import { generatePremiumPdf } from '@/lib/generatePremiumPdf';
import ReportViewer from '@/components/reports/ReportViewer';
import Markdown, { stripMarkdown } from '@/components/reports/Markdown';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';


function downloadDeliveryAsPdf(delivery, digestName) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const col = 174;
  let y = 22;

  // v3 palette: ink pages, violet accent, light text (see BRAND.md)
  const paintPage = () => {
    doc.setFillColor(10, 9, 16);
    doc.rect(0, 0, 210, 297, 'F');
  };
  paintPage();

  // Cover bar
  doc.setFillColor(23, 21, 31);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setFillColor(155, 92, 246);
  doc.rect(0, 40, 210, 1.2, 'F');

  // Brand
  doc.setFillColor(155, 92, 246);
  doc.roundedRect(margin, y - 6, 12, 12, 3, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text('M', margin + 3.5, y + 2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
  doc.text('MergeRSS', margin + 16, y + 2);

  // Title
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(243, 241, 247);
  const titleLines = doc.splitTextToSize((digestName || 'Briefing').toUpperCase(), col);
  titleLines.slice(0, 2).forEach((l, i) => doc.text(l, margin, 30 + i * 8));

  y = 52;
  // Date range
  const drStr = delivery.date_range_start
    ? `${format(new Date(delivery.date_range_start), 'MMMM d, yyyy')} – ${format(new Date(delivery.date_range_end), 'MMMM d, yyyy')}`
    : format(new Date(delivery.created_date || Date.now()), 'MMMM d, yyyy');
  doc.setFont('courier', 'normal'); doc.setFontSize(8); doc.setTextColor(124, 119, 139);
  doc.text(drStr.toUpperCase(), margin, y);
  y += 8;

  // Content: markdown is rendered to plain text, never shown raw
  const plain = stripMarkdown(
    (delivery.content || '').replace(/^\s*[-*+•]\s+/gm, '\u2022 ')
  );

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(201, 197, 212);
  const lines = doc.splitTextToSize(plain, col);
  lines.forEach(line => {
    if (y > 280) {
      doc.addPage(); paintPage(); y = 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(201, 197, 212);
    }
    doc.text(line, margin, y);
    y += 4.5;
  });

  // Footer
  doc.setFillColor(23, 21, 31);
  doc.rect(0, 287, 210, 10, 'F');
  doc.setFont('courier', 'normal'); doc.setFontSize(7); doc.setTextColor(124, 119, 139);
  doc.text('MERGERSS BRIEFING  ·  MERGERSS.COM', margin, 293);

  doc.save(`${(digestName || 'briefing').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

function DigestDeliveryList({ digests }) {
  const digestIds = digests.map(d => d.id);

  const { data: allDeliveries = [], isLoading } = useQuery({
    queryKey: ['digest-report-deliveries', digestIds.join(',')],
    queryFn: () => base44.entities.DigestDelivery.filter(
      { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent' },
      '-created_date',
      200
    ),
    enabled: digestIds.length > 0,
  });

  const [expandedId, setExpandedId] = useState(null);
  const [openDigestId, setOpenDigestId] = useState(null);

  // Group deliveries by digest
  const grouped = digests.map(d => ({
    digest: d,
    deliveries: allDeliveries.filter(del => del.digest_id === d.id),
  }));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading briefing history...
      </div>
    );
  }

  if (!allDeliveries.length) {
    return (
      <div className="text-stone-500 text-sm py-4 flex items-center gap-2">
        <Inbox className="w-4 h-4" aria-hidden="true" /> No sent briefings found yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {grouped.filter(g => g.deliveries.length > 0).map(({ digest, deliveries }) => (
        <div key={digest.id} className="panel-raised overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenDigestId(p => p === digest.id ? null : digest.id)}
            aria-expanded={openDigestId === digest.id}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold text-stone-100">{digest.name}</span>
              <span className="chip-neutral">{deliveries.length} sent</span>
            </div>
            {openDigestId === digest.id
              ? <ChevronUp className="w-4 h-4 text-stone-500" />
              : <ChevronDown className="w-4 h-4 text-stone-500" />}
          </button>

          {openDigestId === digest.id && (
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {deliveries.map(delivery => (
                <div key={delivery.id}>
                  <button
                    onClick={() => setExpandedId(p => p === delivery.id ? null : delivery.id)}
                    aria-expanded={expandedId === delivery.id}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Eye className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" aria-hidden="true" />
                      <span className="font-mono text-xs text-stone-300 truncate">
                        {delivery.date_range_start
                          ? format(new Date(delivery.date_range_start), 'MMM d') + ' – ' + format(new Date(delivery.date_range_end), 'MMM d, yyyy')
                          : format(new Date(delivery.created_date), 'MMM d, yyyy')}
                      </span>
                      {delivery.item_count > 0 && (
                        <span className="font-mono text-xs text-stone-500">{delivery.item_count} stories</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); downloadDeliveryAsPdf(delivery, digest.name); }}
                        title="Download as PDF"
                        aria-label="Download as PDF"
                        className="p-1 rounded-md text-stone-500 hover:text-[hsl(var(--primary))] transition"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      {expandedId === delivery.id
                        ? <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
                        : <ChevronDown className="w-3.5 h-3.5 text-stone-500" />}
                    </div>
                  </button>

                  {expandedId === delivery.id && delivery.content && (
                    <div className="px-6 pb-5 pt-2">
                      <Markdown text={delivery.content} />
                      <button
                        type="button"
                        onClick={() => downloadDeliveryAsPdf(delivery, digest.name)}
                        className="btn-soft mt-4 text-xs"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download as PDF
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

async function downloadReportAsPdf(savedReport) {
  await generatePremiumPdf(savedReport);
}

function SavedReportsList({ userEmail }) {
  const { data: savedReports = [], isLoading, refetch } = useQuery({
    queryKey: ['saved-digest-reports', userEmail],
    queryFn: () => base44.entities.SavedDigestReport.filter({ created_by: userEmail }, '-created_date', 100),
    enabled: !!userEmail,
  });

  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const handleDelete = async (id) => {
    setDeletingId(id);
    await base44.entities.SavedDigestReport.delete(id);
    setConfirmId(null);
    setExpandedId(null);
    setDeletingId(null);
    refetch();
  };

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          <span className="font-display text-base font-semibold text-stone-100">Saved reports</span>
          {savedReports.length > 0 && (
            <span className="chip-neutral">{savedReports.length}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.06]">
          {isLoading && (
            <div className="flex items-center gap-2 text-stone-500 text-sm px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading reports...
            </div>
          )}
          {!isLoading && savedReports.length === 0 && (
            <div className="px-5 py-4 text-sm text-stone-500">No reports generated yet. Run a report above to save it here.</div>
          )}
          {savedReports.map(sr => (
            <div key={sr.id} className="border-t border-white/[0.06] first:border-t-0">
              <button
                onClick={() => setExpandedId(p => p === sr.id ? null : sr.id)}
                aria-expanded={expandedId === sr.id}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" aria-hidden="true" />
                  <span className="text-sm text-stone-200 font-medium truncate">{sr.digest_name}</span>
                  <span className="font-mono text-xs text-stone-500 flex-shrink-0">{sr.start_date} – {sr.end_date}</span>
                  {sr.delivery_count > 0 && <span className="font-mono text-xs text-stone-500">{sr.delivery_count} briefings</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); downloadReportAsPdf(sr); }}
                    title="Download as PDF"
                    aria-label="Download as PDF"
                    className="p-1 rounded-md text-stone-500 hover:text-[hsl(var(--primary))] transition"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {confirmId === sr.id ? (
                    <>
                      <span className="text-xs text-red-400">Delete?</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(sr.id); }}
                        disabled={deletingId === sr.id}
                        className="text-xs text-red-400 hover:text-red-300 font-semibold transition px-1"
                      >
                        {deletingId === sr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmId(null); }}
                        className="text-xs text-stone-500 hover:text-stone-300 transition px-1"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmId(sr.id); }}
                      title="Delete report"
                      aria-label="Delete report"
                      className="p-1 rounded-md text-stone-500 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {expandedId === sr.id ? <ChevronUp className="w-3.5 h-3.5 text-stone-500" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-500" />}
                </div>
              </button>

              {expandedId === sr.id && sr.report && (
                <div className="border-t border-white/[0.06] p-4">
                  <ReportViewer
                    report={sr.report}
                    digestName={sr.digest_name}
                    startDate={sr.start_date}
                    endDate={sr.end_date}
                    deliveryCount={sr.delivery_count}
                    actualStart={sr.actual_start}
                    actualEnd={sr.actual_end}
                    savedReport={sr}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [issuesOpen, setIssuesOpen] = useState(false);
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
    setDropdownOpen(false);
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
      <PageHeader
        eyebrow="Briefings"
        title="Reports"
        subtitle="Analyze how topics and trends in your briefings evolve over time: monthly, quarterly or any custom range."
      />

      {/* Config panel */}
      <div className="panel p-5 mb-6 relative z-10">
        <h2 className="font-display text-base font-semibold text-stone-100 mb-4">Configure report</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {/* Briefing multi-select dropdown */}
          <div className="md:col-span-1 relative" ref={dropdownRef}>
            <MicroLabel as="span" className="mb-1.5 block">Briefings</MicroLabel>
            <button
              type="button"
              onClick={() => setDropdownOpen(p => !p)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              className="w-full flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm px-3 py-2 text-left hover:border-white/[0.16] transition-colors focus:outline-none focus:border-[hsl(var(--primary))]"
            >
              <span className={selectedDigestIds.length ? 'text-stone-200' : 'text-stone-500'}>
                {selectedDigestIds.length === 0
                  ? 'Choose briefings...'
                  : selectedDigestIds.length === 1
                    ? digests.find(d => d.id === selectedDigestIds[0])?.name
                    : `${selectedDigestIds.length} briefings selected`}
              </span>
              <ChevronDown className="w-4 h-4 text-stone-500 flex-shrink-0" aria-hidden="true" />
            </button>
            {dropdownOpen && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 overflow-hidden rounded-xl bg-stone-900 border border-white/[0.08] shadow-panel max-h-60 overflow-y-auto" role="listbox" aria-multiselectable="true">
                {digests.length === 0 && (
                  <div className="px-3 py-2 text-xs text-stone-500">No briefings found</div>
                )}
                {digests.map(d => {
                  const selected = selectedDigestIds.includes(d.id);
                  return (
                    <button
                      type="button"
                      key={d.id}
                      role="option"
                      aria-selected={selected}
                      onClick={() => toggleDigest(d.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/[0.05] transition-colors"
                    >
                      <div className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]' : 'border-stone-600'}`}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className={selected ? 'text-stone-100' : 'text-stone-400'}>{d.name}</span>
                    </button>
                  );
                })}
                {selectedDigestIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDigestIds([])}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/[0.05] border-t border-white/[0.06] transition-colors"
                  >
                    <X className="w-3 h-3" aria-hidden="true" /> Clear selection
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Start date */}
          <div>
            <MicroLabel as="label" className="mb-1.5 block" htmlFor="report-start">Start date</MicroLabel>
            <input
              id="report-start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] text-stone-200 font-mono text-sm px-3 py-2 focus:outline-none focus:border-[hsl(var(--primary))] [color-scheme:dark]"
            />
          </div>

          {/* End date */}
          <div>
            <MicroLabel as="label" className="mb-1.5 block" htmlFor="report-end">End date</MicroLabel>
            <input
              id="report-end"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] text-stone-200 font-mono text-sm px-3 py-2 focus:outline-none focus:border-[hsl(var(--primary))] [color-scheme:dark]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={runReport}
          disabled={!selectedDigestIds.length || loading}
          className="btn-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Generating report...' : 'Run report'}
        </button>
        {loading && (
          <p className="meta mt-3 normal-case tracking-normal">This uses AI analysis and may take 20 to 40 seconds.</p>
        )}
      </div>

      {/* Saved Reports */}
      {user && (
        <div className="mb-4">
          <SavedReportsList userEmail={user.email} />
        </div>
      )}

      {/* Briefing delivery history (collapsible) */}
      {digests.length > 0 && (
        <div className="panel mb-8 overflow-hidden">
          <button
            type="button"
            onClick={() => setIssuesOpen(p => !p)}
            aria-expanded={issuesOpen}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-stone-500" aria-hidden="true" />
              <span className="font-display text-base font-semibold text-stone-100">Delivery history</span>
            </div>
            {issuesOpen ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
          </button>
          {issuesOpen && (
            <div className="p-4 border-t border-white/[0.06]">
              <DigestDeliveryList digests={digests} />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-400/10 border border-red-400/25 text-red-300 p-4 mb-6 text-sm" role="alert">
          {error === 'No deliveries found in this date range'
            ? 'No sent briefings found in this date range. Try a wider range or a different briefing.'
            : `Error: ${error}`}
        </div>
      )}

      {/* Report output */}
      {report?.report && (
        <ReportViewer
          report={report.report}
          digestName={report.digest_name}
          startDate={report.requested_start}
          endDate={report.requested_end}
          deliveryCount={report.delivery_count}
          actualStart={report.actual_start}
          actualEnd={report.actual_end}
          requestedStart={report.requested_start}
          requestedEnd={report.requested_end}
          onRegenerate={runReport}
          savedReport={{ report: report.report, digest_name: report.digest_name, start_date: report.requested_start, end_date: report.requested_end, delivery_count: report.delivery_count }}
        />
      )}

      {/* Empty state */}
      {!report && !loading && !error && digests.length === 0 && (
        <div className="panel text-center py-16 px-6 text-stone-500">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
          <p className="text-sm">No briefings found. Create a briefing first to see reports here.</p>
        </div>
      )}
    </div>
  );
}