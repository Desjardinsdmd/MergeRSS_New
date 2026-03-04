import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Check, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const statusColors = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
};

const priorityColors = {
  low: 'bg-stone-700 text-stone-100',
  medium: 'bg-amber-700 text-amber-100',
  high: 'bg-red-700 text-red-100',
};

export default function AdminReports() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [adminNotes, setAdminNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const queryClient = useQueryClient();

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
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-100 flex items-center gap-2">
          <AlertCircle className="w-6 h-6 text-red-500" />
          Problem Reports
        </h1>
        <p className="text-stone-500 mt-1">Review and manage user-reported issues</p>
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex gap-2">
        {['open', 'in_progress', 'resolved'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              statusFilter === status
                ? 'bg-amber-400 text-stone-900'
                : 'bg-stone-800 text-stone-400 hover:text-stone-100'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-stone-900 border border-stone-800 rounded-lg">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
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
              className="bg-stone-900 border border-stone-800 rounded-lg p-4 cursor-pointer hover:border-amber-400/50 transition"
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
                  <p className="text-xs text-stone-500 mb-2">
                    {report.user_email} • {report.page}
                  </p>
                  <p className="text-sm text-stone-400 line-clamp-2">
                    {report.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={statusColors[report.status]}>
                    {report.status}
                  </Badge>
                  <span className="text-xs text-stone-600">
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
              <DialogTitle className="flex items-center justify-between">
                <span>{selectedReport.title}</span>
                <Badge className={statusColors[selectedReport.status]}>
                  {selectedReport.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Report Details */}
              <div className="space-y-4 pb-4 border-b border-stone-700">
                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase mb-1">
                    User
                  </p>
                  <p className="text-sm text-stone-100">{selectedReport.user_email}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">
                      Page
                    </p>
                    <p className="text-sm text-stone-100">{selectedReport.page}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">
                      Priority
                    </p>
                    <Badge className={priorityColors[selectedReport.priority || 'medium']}>
                      {selectedReport.priority || 'medium'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase mb-1">
                    Description
                  </p>
                  <p className="text-sm text-stone-400 whitespace-pre-wrap">
                    {selectedReport.description}
                  </p>
                </div>

                {selectedReport.browser_info && (
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">
                      Browser Info
                    </p>
                    <p className="text-xs text-stone-500 font-mono">
                      {selectedReport.browser_info}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase mb-1">
                    Reported
                  </p>
                  <p className="text-sm text-stone-100">
                    {format(new Date(selectedReport.created_date), 'PPP p')}
                  </p>
                </div>
              </div>

              {/* Status Management */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase mb-2">
                  Change Status
                </p>
                <Select
                  value={selectedReport.status}
                  onValueChange={(newStatus) =>
                    handleStatusChange(selectedReport.id, newStatus)
                  }
                >
                  <SelectTrigger className="bg-stone-800 border-stone-700">
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
                <p className="text-xs font-semibold text-stone-500 uppercase mb-2">
                  Admin Notes
                </p>
                <Textarea
                  placeholder="Add internal notes about this issue..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="bg-stone-800 border-stone-700 text-stone-100 resize-none"
                />
                <Button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="mt-2 bg-amber-400 hover:bg-amber-500 text-stone-900 font-semibold"
                >
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}