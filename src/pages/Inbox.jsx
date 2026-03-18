import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Inbox as InboxIcon,
  Loader2,
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  Star,
  Download,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import InboxFolderSidebar from '@/components/inbox/InboxFolderSidebar';
import { decodeHtml } from '@/components/utils/htmlUtils';
import InboxToolbar from '@/components/inbox/InboxToolbar';
import { jsPDF } from 'jspdf';
import { generatePremiumPdf } from '@/lib/generatePremiumPdf';

const SYSTEM_FOLDERS = ['Inbox', 'Starred'];

export default function Inbox() {
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('Inbox');
  const [selectedTag, setSelectedTag] = useState(null);
  const [user, setUser] = React.useState(null);
  const [autoOpenId, setAutoOpenId] = React.useState(null);
  const queryClient = useQueryClient();

  const [showItems, setShowItems] = useState(false);
  const [sortBy, setSortBy] = useState('newest');

  React.useEffect(() => {
    base44.auth.me().then(setUser);
    // Check for deep-link delivery_id in URL params
    const params = new URLSearchParams(window.location.search);
    const did = params.get('delivery_id');
    if (did) setAutoOpenId(did);
  }, []);

  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }),
    enabled: !!user,
    staleTime: 0,
  });

  const digestIds = digests.map(d => d.id);

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['deliveries', 'web', user?.email, digestIds.join(',')],
    queryFn: async () => {
      if (!digestIds.length) return [];
      return base44.entities.DigestDelivery.filter(
        { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent' },
        '-created_date',
        200
      );
    },
    enabled: !!user && digests.length > 0,
  });

  const { customFolders, allTags } = useMemo(() => {
    const folderSet = new Set();
    const tagSet = new Set();
    deliveries.forEach(d => {
      if (d.folder && !SYSTEM_FOLDERS.includes(d.folder)) folderSet.add(d.folder);
      (d.tags || []).forEach(t => tagSet.add(t));
    });
    return { customFolders: Array.from(folderSet).sort(), allTags: Array.from(tagSet).sort() };
  }, [deliveries]);

  const unreadCounts = useMemo(() => {
    const counts = {};
    deliveries.forEach(d => {
      if (d.is_read) return;
      const folder = d.folder || 'Inbox';
      counts[folder] = (counts[folder] || 0) + 1;
      if (d.is_favorited) counts['Starred'] = (counts['Starred'] || 0) + 1;
    });
    return counts;
  }, [deliveries]);

  const filtered = useMemo(() => {
    let list;
    if (selectedTag) list = deliveries.filter(d => (d.tags || []).includes(selectedTag));
    else if (selectedFolder === 'Starred') list = deliveries.filter(d => d.is_favorited);
    else list = deliveries.filter(d => (d.folder || 'Inbox') === selectedFolder);
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.sent_at || b.created_date) - new Date(a.sent_at || a.created_date);
      if (sortBy === 'oldest') return new Date(a.sent_at || a.created_date) - new Date(b.sent_at || b.created_date);
      if (sortBy === 'unread') return (a.is_read ? 1 : 0) - (b.is_read ? 1 : 0);
      if (sortBy === 'items') return (b.item_count || 0) - (a.item_count || 0);
      return 0;
    });
  }, [deliveries, selectedFolder, selectedTag, sortBy]);

  const getDigestName = id => digests.find(d => d.id === id)?.name || 'Unknown Digest';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['deliveries', 'web', user?.email] });
    queryClient.invalidateQueries({ queryKey: ['inboxCount'] });
  };

  const updateDeliveries = async (ids, updates) => {
    await Promise.all(ids.map(id => base44.entities.DigestDelivery.update(id, updates)));
    invalidate();
    if (selectedDelivery && ids.includes(selectedDelivery.id)) {
      setSelectedDelivery(prev => ({ ...prev, ...updates }));
    }
  };

  const handleOpen = async (delivery) => {
    setSelectedDelivery(delivery);
    setShowItems(false);
    if (!delivery.is_read) {
      await base44.entities.DigestDelivery.update(delivery.id, { is_read: true });
      invalidate();
    }
  };

  // Auto-open delivery from deep link
  React.useEffect(() => {
    if (autoOpenId && deliveries.length > 0) {
      const d = deliveries.find(x => x.id === autoOpenId);
      if (d) {
        handleOpen(d);
        setAutoOpenId(null);
      }
      // Don't clear autoOpenId if not found yet — deliveries may still be loading
    }
  }, [autoOpenId, deliveries]);

  const handleMoveToFolder = async (folder) => {
    await updateDeliveries(selectedIds, { folder });
    setSelectedIds([]);
  };

  const handleAddTag = async (tag) => {
    await Promise.all(selectedIds.map(async id => {
      const delivery = deliveries.find(d => d.id === id);
      const existing = delivery?.tags || [];
      if (!existing.includes(tag)) {
        await base44.entities.DigestDelivery.update(id, { tags: [...existing, tag] });
      }
    }));
    setSelectedIds([]);
    invalidate();
  };

  const handleCreateFolder = (name) => {
    setSelectedFolder(name);
    setSelectedTag(null);
    if (selectedIds.length > 0) handleMoveToFolder(name);
  };

  const handleDeleteFolder = async (folder) => {
    await Promise.all(
      deliveries.filter(d => d.folder === folder).map(d =>
        base44.entities.DigestDelivery.update(d.id, { folder: 'Inbox' })
      )
    );
    if (selectedFolder === folder) setSelectedFolder('Inbox');
    invalidate();
  };

  const handleCreateTag = (tag) => {
    setSelectedTag(tag);
    setSelectedFolder(null);
  };

  const handleDeleteTag = async (tag) => {
    await Promise.all(
      deliveries.filter(d => (d.tags || []).includes(tag)).map(d =>
        base44.entities.DigestDelivery.update(d.id, { tags: (d.tags || []).filter(t => t !== tag) })
      )
    );
    if (selectedTag === tag) { setSelectedTag(null); setSelectedFolder('Inbox'); }
    invalidate();
  };

  const toggleSelect = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const handleDownloadPdf = (delivery) => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const digestName = getDigestName(delivery.digest_id);
    const sentDate = delivery.sent_at ? format(new Date(delivery.sent_at), 'MMMM d, yyyy h:mm a') : '';

    // Header bar
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(0, 0, pageW, 18, 'F');

    // Brand name in header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('MergeRSS', 20, 12);

    // Tagline in header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('AI-Powered RSS Digest', 20, 17.5);

    // URL right-aligned in header
    doc.setFontSize(8);
    doc.text('mergerss.com', pageW - 20, 12, { align: 'right' });

    // Digest title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 60);
    doc.text(digestName, 20, 34);

    // Meta info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Delivered: ${sentDate}`, 20, 44);
    if (delivery.item_count) doc.text(`${delivery.item_count} items`, 20, 51);

    // Divider
    doc.setDrawColor(200, 200, 220);
    doc.line(20, 56, pageW - 20, 56);

    // Content
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const content = delivery.content || 'No content available.';
    const lines = doc.splitTextToSize(content, pageW - 40);

    let y = 64;
    lines.forEach(line => {
      if (y > pageH - 20) {
        doc.addPage();
        // Repeat header on new page
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, pageW, 18, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('MergeRSS', 20, 12);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('mergerss.com', pageW - 20, 12, { align: 'right' });
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(11);
        y = 28;
      }
      doc.text(line, 20, y);
      y += 6;
    });

    // Footer on last page
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 180);
    doc.text(`Generated by MergeRSS · mergerss.com`, pageW / 2, pageH - 8, { align: 'center' });

    doc.save(`${digestName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(delivery.sent_at || new Date()), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100 mb-1">Inbox</h1>
        <p className="text-stone-500 text-sm">Your delivered digests and reading history</p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6">
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="unread">Unread first</SelectItem>
            <SelectItem value="items">Most items</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile folder selector */}
      <div className="lg:hidden mb-4 flex gap-2 overflow-x-auto pb-1">
        {['Inbox', 'Starred', ...customFolders].map(folder => (
          <button
            key={folder}
            onClick={() => { setSelectedFolder(folder); setSelectedTag(null); }}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              selectedFolder === folder && !selectedTag
                ? 'bg-amber-400 text-stone-900'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            )}
          >
            {folder}
            {(unreadCounts?.[folder] || 0) > 0 && (
              <span className="ml-1.5 text-xs">({unreadCounts[folder]})</span>
            )}
          </button>
        ))}
        {allTags.map(tag => (
          <button
            key={tag}
            onClick={() => { setSelectedTag(tag); setSelectedFolder(null); }}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              selectedTag === tag
                ? 'bg-amber-400 text-stone-900'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            )}
          >
            #{tag}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        <div className="hidden lg:block">
          <InboxFolderSidebar
            folders={customFolders}
            tags={allTags}
            selectedFolder={selectedFolder}
            selectedTag={selectedTag}
            onSelectFolder={setSelectedFolder}
            onSelectTag={setSelectedTag}
            unreadCounts={unreadCounts}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onCreateTag={handleCreateTag}
            onDeleteTag={handleDeleteTag}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <InboxToolbar
              selectedIds={selectedIds}
              allIds={filtered.map(d => d.id)}
              onSelectAll={() => setSelectedIds(filtered.map(d => d.id))}
              onDeselectAll={() => setSelectedIds([])}
              onMarkRead={() => { updateDeliveries(selectedIds, { is_read: true }); setSelectedIds([]); }}
              onMarkUnread={() => { updateDeliveries(selectedIds, { is_read: false }); setSelectedIds([]); }}
              onFavorite={() => { updateDeliveries(selectedIds, { is_favorited: true }); setSelectedIds([]); }}
              onUnfavorite={() => { updateDeliveries(selectedIds, { is_favorited: false }); setSelectedIds([]); }}
              onMoveToFolder={handleMoveToFolder}
              onAddTag={handleAddTag}
              folders={customFolders}
              tags={allTags}
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                 <div className="w-12 h-12 bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
                   <InboxIcon className="w-6 h-6 text-stone-600" />
                 </div>
                 <h3 className="text-lg font-semibold text-stone-100 mb-1">No digests here</h3>
                 <p className="text-stone-500 text-sm">Nothing in {selectedTag ? `#${selectedTag}` : selectedFolder} yet.</p>
              </div>
            ) : (
              <div>
                {filtered.map(delivery => {
                  const isUnread = !delivery.is_read;
                  const isSelected = selectedIds.includes(delivery.id);
                  return (
                    <div
                       key={delivery.id}
                       className={cn(
                         'flex items-start gap-3 px-4 py-3.5 border-b border-stone-800 cursor-pointer hover:bg-stone-800/50 transition group',
                         isSelected && 'bg-stone-800 hover:bg-stone-800'
                       )}
                     >
                      <button
                         className="mt-0.5 flex-shrink-0 text-stone-600 hover:text-amber-400 transition"
                         onClick={e => { e.stopPropagation(); toggleSelect(delivery.id); }}
                       >
                         {isSelected
                           ? <div className="w-4 h-4 bg-amber-400 rounded flex items-center justify-center"><svg className="w-2.5 h-2.5 text-stone-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                           : <div className="w-4 h-4 border-2 border-stone-700 rounded group-hover:border-amber-400 transition" />
                         }
                       </button>

                       <div className="mt-2 flex-shrink-0 w-2 h-2">
                         {isUnread && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                       </div>

                      <button
                        className="mt-0.5 flex-shrink-0"
                        onClick={async e => {
                          e.stopPropagation();
                          await base44.entities.DigestDelivery.update(delivery.id, { is_favorited: !delivery.is_favorited });
                          invalidate();
                        }}
                      >
                        <Star className={cn('w-4 h-4 transition', delivery.is_favorited ? 'text-amber-400 fill-amber-400' : 'text-slate-200 hover:text-amber-300')} />
                      </button>

                      <div className="flex-1 min-w-0" onClick={() => handleOpen(delivery)}>
                        <div className="flex items-center justify-between gap-2">
                           <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-stone-100' : 'font-medium text-stone-400')}>
                              {decodeHtml(getDigestName(delivery.digest_id))}
                            </span>
                           <span className="text-xs text-stone-600 flex-shrink-0">
                             {delivery.sent_at && format(new Date(delivery.sent_at), 'MMM d')}
                           </span>
                         </div>
                         <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-xs text-stone-600 truncate">{delivery.item_count || 0} items</span>
                           {(delivery.tags || []).map(tag => (
                             <span key={tag} className="text-xs bg-stone-800 text-stone-400 rounded px-1.5 py-0.5">{tag}</span>
                           ))}
                           {delivery.folder && delivery.folder !== 'Inbox' && (
                             <span className="text-xs bg-stone-800 text-amber-400 rounded px-1.5 py-0.5">{delivery.folder}</span>
                           )}
                         </div>
                      </div>

                      {/* Download PDF button (visible on hover) */}
                      <button
                        onClick={e => { e.stopPropagation(); handleDownloadPdf(delivery); }}
                        className="opacity-0 group-hover:opacity-100 mt-0.5 flex-shrink-0 p-1 text-stone-600 hover:text-amber-400 transition"
                        title="Download as PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delivery Detail Dialog */}
      <Dialog open={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              {selectedDelivery && getDigestName(selectedDelivery.digest_id)}
            </DialogTitle>
          </DialogHeader>

          {selectedDelivery && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-stone-500 pb-4 border-b border-stone-700 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(selectedDelivery.sent_at), 'MMMM d, yyyy h:mm a')}
                </span>
                <Badge variant="secondary">{selectedDelivery.item_count || 0} items</Badge>
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />Delivered
                </Badge>
                <button
                  onClick={async () => {
                    await base44.entities.DigestDelivery.update(selectedDelivery.id, { is_favorited: !selectedDelivery.is_favorited });
                    setSelectedDelivery(prev => ({ ...prev, is_favorited: !prev.is_favorited }));
                    invalidate();
                  }}
                >
                  <Star className={cn('w-4 h-4 transition', selectedDelivery.is_favorited ? 'text-amber-400 fill-amber-400' : 'text-slate-300 hover:text-amber-300')} />
                </button>
                <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => handleDownloadPdf(selectedDelivery)}>
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </Button>
              </div>

              {selectedDelivery.date_range_start && selectedDelivery.date_range_end && (
                <div className="bg-stone-800 rounded-lg p-3 text-sm">
                  <p className="text-stone-400">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Coverage: {format(new Date(selectedDelivery.date_range_start), 'MMM d')} – {format(new Date(selectedDelivery.date_range_end), 'MMM d, yyyy')}
                  </p>
                </div>
              )}

              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-stone-400">
                  {selectedDelivery.content || 'No content available for this digest.'}
                </div>
              </div>

              {selectedDelivery.items?.length > 0 && (
                <div className="border border-stone-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowItems(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-stone-800 hover:bg-stone-700 transition text-sm font-medium text-stone-300"
                  >
                    <span>📄 {selectedDelivery.items.length} articles in this digest</span>
                    {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showItems && (
                    <div className="divide-y divide-stone-800 max-h-64 overflow-y-auto">
                      {selectedDelivery.items.map((item, i) => (
                        <a
                          key={i}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 px-4 py-2.5 hover:bg-stone-700 transition group"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-stone-600 group-hover:text-amber-400" />
                          <span className="text-sm text-stone-400 group-hover:text-amber-400 line-clamp-2">{decodeHtml(item.title)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}