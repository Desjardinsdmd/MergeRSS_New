import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Check, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

const CHIP = 'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit';

const statusColors = {
  open: `${CHIP} border-red-400/25 bg-red-400/10 text-red-300`,
  in_progress: `${CHIP} border-sky-400/25 bg-sky-400/10 text-sky-300`,
  resolved: `${CHIP} border-emerald-400/25 bg-emerald-400/10 text-emerald-300`,
};

const priorityColors = {
  low: `${CHIP} border-white/10 bg-transparent text-stone-400`,
  medium: `${CHIP} border-amber-400/25 bg-amber-400/10 text-amber-300`,
  high: `${CHIP} border-red-400/25 bg-red-400/10 text-red-300`,
};

function AdminReportsPage() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [adminNotes, setAdminNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const queryClient = useQueryClient();

  const downloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Problem Reports — ${statusFilter.replace('_', ' ').toUpperCase()}`, 14, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated ${new Date().toLocaleString()} — ${reports.length} report(s)`, 14, y);
    y += 10;

    reports.forEach((report, idx) => {
      if (y > 260) { doc.addPage(); y = 20; }

      doc.setDrawColor(60, 60, 60);
      doc.setFillColor(30, 30, 30);
      doc.rect(14, y, pageWidth - 28, 7, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${idx + 1}. ${report.title}`, 17, y + 5);
      y += 10;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);

      const meta = [
        `User: ${report.user_email || 'N/A'}`,
        `Page: ${report.page || 'N/A'}`,
        `Priority: ${report.priority || 'medium'}`,
        `Status: ${report.status}`,
        `Reported: ${format(new Date(report.created_date), 'PPP p')}`,
      ];
      meta.forEach(line => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, 17, y);
        y += 5;
      });

      if (report.description) {
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Description:', 17, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(report.description, pageWidth - 34);
        lines.forEach(line => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(line, 17, y);
          y += 5;
        });
      }

      if (report.browser_info) {
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Browser Info:', 17, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(report.browser_info, pageWidth - 34);
        lines.forEach(line => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(line, 17, y);
          y += 4;
        });
      }

      if (report.admin_notes) {
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Admin Notes:', 17, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(report.admin_notes, pageWidth - 34);
        lines.forEach(line => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(line, 17, y);
          y += 5;
        });
      }

      y += 8;
    });

    doc.save(`problem-reports-${statusFilter}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['problem-reports', statusFilter],
    queryFn: () =>
      base44.entities.ProblemReport.filter(
        { status: statusFilter },
        '-created_date',
        100
      ),
  });

  const handleStatusChange = async (reportId, newStatus) => {
    await base44.entities.ProblemReport.update(reportId, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['problem-reports'] });
    toast.success('Status updated');
  };

  const handleSaveNotes = async () => {
    if (!selectedReport) return;
    setSavingNotes(true);
    try {
      await base44.entities.ProblemReport.update(selectedReport.id, {
        admin_notes: adminNotes,
      });
      setSelectedReport(prev => ({ ...prev, admin_notes: adminNotes }));
      queryClient.invalidateQueries({ queryKey: ['problem-reports'] });
      toast.success('Notes saved');
    } catch (error) {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <PageHeader
        title={<span className="flex items-center gap-2"><AlertCircle className="w-6 h-6 text-red-400" aria-hidden="true" />Problem reports</span>}
        subtitle="Review and manage user-reported issues."
        actions={
          <button
            type="button"
            onClick={downloadPDF}
            disabled={reports.length === 0}
            className="btn-ghost py-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        }
      />

      {/* Status Filter */}
      <div className="mb-6 flex gap-6 border-b border-white/[0.07]">
        {['open', 'in_progress', 'resolved'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`-mb-px border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition ${
              statusFilter === status
                ? 'border-[hsl(var(--brand))] text-stone-100'
                : 'border-transparent text-stone-500 hover:text-stone-200'
            }`}
          >
            {(status.charAt(0).toUpperCase() + status.slice(1)).replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
        </div>
      ) : reports.length === 0 ? (
        <div className="panel text-center py-12">
          <Check className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <p className="text-stone-400">No reports in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div
              key={report.id}
              onClick={() => {
                setSelectedReport(report);
                setAdminNotes(report.admin_notes || '');
              }}
              className="panel panel-hover p-4 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-stone-100 truncate">
                      {report.title}
                    </h3>
                    <Badge className={priorityColors[report.priority || 'medium']}>
                      {report.priority || 'medium'}
                    </Badge>
                  </div>
                  <p className="meta normal-case mb-2">
                    {report.user_email} · {report.page}
                  </p>
                  <p className="text-sm text-stone-400 line-clamp-2">
                    {report.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={statusColors[report.status]}>
                    {report.status}
                  </Badge>
                  <span className="font-mono text-[11px] text-stone-500">
                    {format(new Date(report.created_date), 'MMM d')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      {selectedReport && (
        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-3 font-display">
                <span>{selectedReport.title}</span>
                <Badge className={statusColors[selectedReport.status]}>
                  {selectedReport.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Report Details */}
              <div className="space-y-4 pb-4 border-b border-white/[0.07]">
                <div>
                  <MicroLabel className="mb-1">
                    User
                  </MicroLabel>
                  <p className="font-mono text-sm text-stone-100">{selectedReport.user_email}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <MicroLabel className="mb-1">
                      Page
                    </MicroLabel>
                    <p className="font-mono text-sm text-stone-100">{selectedReport.page}</p>
                  </div>
                  <div>
                    <MicroLabel className="mb-1">
                      Priority
                    </MicroLabel>
                    <Badge className={priorityColors[selectedReport.priority || 'medium']}>
                      {selectedReport.priority || 'medium'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <MicroLabel className="mb-1">
                    Description
                  </MicroLabel>
                  <p className="text-sm text-stone-400 whitespace-pre-wrap">
                    {selectedReport.description}
                  </p>
                </div>

                {selectedReport.browser_info && (
                  <div>
                    <MicroLabel className="mb-1">
                      Browser info
                    </MicroLabel>
                    <p className="text-xs text-stone-500 font-mono">
                      {selectedReport.browser_info}
                    </p>
                  </div>
                )}

                <div>
                  <MicroLabel className="mb-1">
                    Reported
                  </MicroLabel>
                  <p className="font-mono text-sm text-stone-100">
                    {format(new Date(selectedReport.created_date), 'PPP p')}
                  </p>
                </div>
              </div>

              {/* Status Management */}
              <div>
                <MicroLabel className="mb-2">
                  Change status
                </MicroLabel>
                <Select
                  value={selectedReport.status}
                  onValueChange={(newStatus) =>
                    handleStatusChange(selectedReport.id, newStatus)
                  }
                >
                  <SelectTrigger className="rounded-xl border-white/10 bg-stone-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Admin Notes */}
              <div>
                <MicroLabel className="mb-2">
                  Admin notes
                </MicroLabel>
                <Textarea
                  placeholder="Add internal notes about this issue..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="rounded-xl border-white/10 bg-stone-800 text-stone-100 resize-none"
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="btn-brand mt-2 disabled:opacity-50"
                >
                  {savingNotes ? 'Saving...' : 'Save notes'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


// --- Admin-only guard (non-admins see an "Admins only" message; inner page never mounts) ---
function AdminOnlyGuard({ children }) {
  const [access, setAccess] = React.useState('loading');
  React.useEffect(() => {
    let cancelled = false;
    base44.auth.me()
      .then((u) => { if (!cancelled) setAccess(u?.role === 'admin' ? 'admin' : 'denied'); })
      .catch(() => { if (!cancelled) setAccess('denied'); });
    return () => { cancelled = true; };
  }, []);
  if (access === 'loading') {
    return <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto text-sm text-stone-500">Loading...</div>;
  }
  if (access !== 'admin') {
    return (
      <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="panel p-8 text-center">
          <h2 className="font-display text-lg font-semibold text-stone-200 mb-1">Admins only</h2>
          <p className="text-sm text-stone-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function AdminReports() {
  return (
    <AdminOnlyGuard>
      <AdminReportsPage />
    </AdminOnlyGuard>
  );
}
