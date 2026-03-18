import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, Play, Loader2,
  ChevronDown, ChevronUp, FileText, Check, X, Download, Inbox, Eye, ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, subDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import { generatePremiumPdf } from '@/lib/generatePremiumPdf';
import ReportViewer from '@/components/reports/ReportViewer';

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

function downloadDeliveryAsPdf(delivery, digestName) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const col = 174;
  let y = 22;

  // Cover bar
  doc.setFillColor(10, 8, 5);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setFillColor(214, 158, 20);
  doc.rect(0, 40, 210, 2, 'F');

  // Brand
  doc.setFillColor(214, 158, 20);
  doc.rect(margin, y - 6, 12, 12, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(10, 8, 5);
  doc.text('M', margin + 3.5, y + 2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
  doc.text('MergeRSS', margin + 16, y + 2);

  // Title
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize((digestName || 'Digest').toUpperCase(), col);
  titleLines.slice(0, 2).forEach((l, i) => doc.text(l, margin, 30 + i * 8));

  y = 52;
  // Date range
  const drStr = delivery.date_range_start
    ? `${format(new Date(delivery.date_range_start), 'MMMM d, yyyy')} – ${format(new Date(delivery.date_range_end), 'MMMM d, yyyy')}`
    : format(new Date(delivery.created_date || Date.now()), 'MMMM d, yyyy');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 104, 96);
  doc.text(drStr, margin, y);
  y += 8;

  // Content
  const plain = (delivery.content || '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^\s*[-•]\s/gm, '• ');

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(34, 28, 20);
  const lines = doc.splitTextToSize(plain, col);
  lines.forEach(line => {
    if (y > 280) { doc.addPage(); y = 22; }
    doc.text(line, margin, y);
    y += 4.5;
  });

  // Footer
  doc.setFillColor(245, 243, 240);
  doc.rect(0, 287, 210, 10, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(180, 175, 168);
  doc.text('MergeRSS Intelligence  ·  mergerss.com', margin, 293);

  doc.save(`${(digestName || 'digest').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
        <Loader2 className="w-4 h-4 animate-spin" /> Loading digest history...
      </div>
    );
  }

  if (!allDeliveries.length) {
    return (
      <div className="text-stone-600 text-sm py-4 flex items-center gap-2">
        <Inbox className="w-4 h-4" /> No sent digest deliveries found yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {grouped.filter(g => g.deliveries.length > 0).map(({ digest, deliveries }) => (
        <div key={digest.id} className="border border-stone-800">
          <button
            onClick={() => setOpenDigestId(p => p === digest.id ? null : digest.id)}
            className="w-full flex items-center justify-between px-4 py-3 bg-stone-900 hover:bg-stone-800 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" />
              <span className="text-sm font-medium text-stone-200">{digest.name}</span>
              <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5">{deliveries.length} issue{deliveries.length !== 1 ? 's' : ''}</span>
            </div>
            {openDigestId === digest.id
              ? <ChevronUp className="w-4 h-4 text-stone-500" />
              : <ChevronDown className="w-4 h-4 text-stone-500" />}
          </button>

          {openDigestId === digest.id && (
            <div className="divide-y divide-stone-800">
              {deliveries.map(delivery => (
                <div key={delivery.id} className="bg-stone-950">
                  <button
                    onClick={() => setExpandedId(p => p === delivery.id ? null : delivery.id)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-stone-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Eye className="w-3.5 h-3.5 text-stone-600 flex-shrink-0" />
                      <span className="text-xs text-stone-400 truncate">
                        {delivery.date_range_start
                          ? format(new Date(delivery.date_range_start), 'MMM d') + ' – ' + format(new Date(delivery.date_range_end), 'MMM d, yyyy')
                          : format(new Date(delivery.created_date), 'MMM d, yyyy')}
                      </span>
                      {delivery.item_count > 0 && (
                        <span className="text-xs text-stone-600">{delivery.item_count} articles</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); downloadDeliveryAsPdf(delivery, digest.name); }}
                        title="Download as PDF"
                        className="p-1 text-stone-600 hover:text-[hsl(var(--primary))] transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {expandedId === delivery.id
                        ? <ChevronUp className="w-3.5 h-3.5 text-stone-600" />
                        : <ChevronDown className="w-3.5 h-3.5 text-stone-600" />}
                    </div>
                  </button>

                  {expandedId === delivery.id && delivery.content && (
                    <div className="px-6 pb-4 pt-2 bg-stone-950">
                      <div className="prose prose-invert prose-sm max-w-none text-stone-300 text-xs leading-relaxed whitespace-pre-wrap">
                        {delivery.content}
                      </div>
                      <button
                        onClick={() => downloadDeliveryAsPdf(delivery, digest.name)}
                        className="mt-4 flex items-center gap-1.5 text-xs text-[hsl(var(--primary))] hover:opacity-80 transition"
                      >
                        <Download className="w-3.5 h-3.5" /> Download as PDF
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
  const { data: savedReports = [], isLoading } = useQuery({
    queryKey: ['saved-digest-reports', userEmail],
    queryFn: () => base44.entities.SavedDigestReport.filter({ created_by: userEmail }, '-created_date', 100),
    enabled: !!userEmail,
  });

  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="mb-4 border border-stone-800">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-stone-900 hover:bg-stone-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[hsl(var(--primary))]" />
          <span className="text-sm font-semibold text-stone-200">All Digest Reports Issued</span>
          {savedReports.length > 0 && (
            <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5">{savedReports.length}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
      </button>

      {open && (
        <div className="bg-stone-950">
          {isLoading && (
            <div className="flex items-center gap-2 text-stone-500 text-sm px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading reports...
            </div>
          )}
          {!isLoading && savedReports.length === 0 && (
            <div className="px-4 py-3 text-xs text-stone-600">No reports generated yet. Run a report above to save it here.</div>
          )}
          {savedReports.map(sr => (
            <div key={sr.id} className="border-t border-stone-800 first:border-t-0">
              <button
                onClick={() => setExpandedId(p => p === sr.id ? null : sr.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-stone-900 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-stone-600 flex-shrink-0" />
                  <span className="text-xs text-stone-300 font-medium truncate">{sr.digest_name}</span>
                  <span className="text-xs text-stone-600 flex-shrink-0">{sr.start_date} – {sr.end_date}</span>
                  {sr.delivery_count > 0 && <span className="text-xs text-stone-600">{sr.delivery_count} issues</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); downloadReportAsPdf(sr); }}
                    title="Download as PDF"
                    className="p-1 text-stone-600 hover:text-[hsl(var(--primary))] transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {expandedId === sr.id ? <ChevronUp className="w-3.5 h-3.5 text-stone-600" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-600" />}
                </div>
              </button>

              {expandedId === sr.id && sr.report && (
                <div className="border-t border-stone-800">
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
  const [expandedThemes, setExpandedThemes] = useState({});
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
      <div className="bg-stone-900 border border-stone-800 p-5 mb-6 relative z-10">
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

      {/* Saved Reports */}
      {user && (
        <div className="mb-4">
          <SavedReportsList userEmail={user.email} />
        </div>
      )}

      {/* Digest Delivery History — collapsible */}
      {digests.length > 0 && (
        <div className="mb-8 border border-stone-800">
          <button
            onClick={() => setIssuesOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 bg-stone-900 hover:bg-stone-800 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-stone-500" />
              <span className="text-sm font-semibold text-stone-200">All Digest Issues</span>
            </div>
            {issuesOpen ? <ChevronUp className="w-4 h-4 text-stone-500" /> : <ChevronDown className="w-4 h-4 text-stone-500" />}
          </button>
          {issuesOpen && (
            <div className="p-4 bg-stone-950">
              <DigestDeliveryList digests={digests} />
            </div>
          )}
        </div>
      )}

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
        <div className="text-center py-16 text-stone-600">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No digests found. Create a digest first to see reports here.</p>
        </div>
      )}
    </div>
  );
}