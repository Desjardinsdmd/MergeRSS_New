import React, { useState, useMemo } from 'react';
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
  Mail,
  MailOpen,
  Tag as TagIcon,
  X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import InboxFolderSidebar from '@/components/inbox/InboxFolderSidebar';
import InboxToolbar from '@/components/inbox/InboxToolbar';

const SYSTEM_FOLDERS = ['Inbox', 'Starred'];

export default function Inbox() {
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('Inbox');
  const [selectedTag, setSelectedTag] = useState(null);
  const [user, setUser] = React.useState(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['deliveries', 'web', user?.email],
    queryFn: async () => {
      const all = await base44.entities.DigestDelivery.filter({ created_by: user?.email }, '-created_date');
      return all.filter(d => d.delivery_type === 'web' && d.status === 'sent');
    },
    enabled: !!user,
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }),
    enabled: !!user,
  });

  // Derive custom folders and tags from deliveries
  const { customFolders, allTags } = useMemo(() => {
    const folderSet = new Set();
    const tagSet = new Set();
    deliveries.forEach(d => {
      if (d.folder && !SYSTEM_FOLDERS.includes(d.folder)) folderSet.add(d.folder);
      (d.tags || []).forEach(t => tagSet.add(t));
    });
    return { customFolders: Array.from(folderSet).sort(), allTags: Array.from(tagSet).sort() };
  }, [deliveries]);

  // Compute unread counts per folder
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

  // Filtered list
  const filtered = useMemo(() => {
    if (selectedTag) return deliveries.filter(d => (d.tags || []).includes(selectedTag));
    if (selectedFolder === 'Starred') return deliveries.filter(d => d.is_favorited);
    return deliveries.filter(d => (d.folder || 'Inbox') === selectedFolder);
  }, [deliveries, selectedFolder, selectedTag]);

  const getDigestName = id => digests.find(d => d.id === id)?.name || 'Unknown Digest';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['deliveries', 'web', user?.email] });

  // --- Actions ---
  const updateDeliveries = async (ids, updates) => {
    await Promise.all(ids.map(id => base44.entities.DigestDelivery.update(id, updates)));
    invalidate();
    if (selectedDelivery && ids.includes(selectedDelivery.id)) {
      setSelectedDelivery(prev => ({ ...prev, ...updates }));
    }
  };

  const handleOpen = async (delivery) => {
    setSelectedDelivery(delivery);
    if (!delivery.is_read) {
      await base44.entities.DigestDelivery.update(delivery.id, { is_read: true });
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['inboxCount'] });
    }
  };

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
    // Folders are created implicitly when items are moved there.
    // For now just add to filter state.
    setSelectedFolder(name);
    setSelectedTag(null);
    // If items are selected, move them
    if (selectedIds.length > 0) handleMoveToFolder(name);
  };

  const handleDeleteFolder = async (folder) => {
    // Move all items in that folder back to Inbox
    await Promise.all(
      deliveries
        .filter(d => d.folder === folder)
        .map(d => base44.entities.DigestDelivery.update(d.id, { folder: 'Inbox' }))
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
      deliveries
        .filter(d => (d.tags || []).includes(tag))
        .map(d => base44.entities.DigestDelivery.update(d.id, { tags: (d.tags || []).filter(t => t !== tag) }))
    );
    if (selectedTag === tag) { setSelectedTag(null); setSelectedFolder('Inbox'); }
    invalidate();
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="text-slate-600">Your AI-generated digests, delivered to your web inbox</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
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

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <InboxToolbar
              selectedIds={selectedIds}
              allIds={filtered.map(d => d.id)}
              onSelectAll={() => setSelectedIds(filtered.map(d => d.id))}
              onDeselectAll={() => setSelectedIds([])}
              onMarkRead={() => { updateDeliveries(selectedIds, { is_read: true }); setSelectedIds([]); queryClient.invalidateQueries({ queryKey: ['inboxCount'] }); }}
              onMarkUnread={() => { updateDeliveries(selectedIds, { is_read: false }); setSelectedIds([]); queryClient.invalidateQueries({ queryKey: ['inboxCount'] }); }}
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
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <InboxIcon className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-1">No digests here</h3>
                <p className="text-slate-500 text-sm">Nothing in {selectedTag ? `#${selectedTag}` : selectedFolder} yet.</p>
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
                        'flex items-start gap-3 px-4 py-3.5 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition group',
                        isSelected && 'bg-indigo-50 hover:bg-indigo-50',
                        isUnread && !isSelected && 'bg-white'
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        className="mt-0.5 flex-shrink-0 text-slate-300 hover:text-indigo-600 transition"
                        onClick={e => { e.stopPropagation(); toggleSelect(delivery.id); }}
                      >
                        {isSelected
                          ? <div className="w-4 h-4 bg-indigo-600 rounded flex items-center justify-center"><svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                          : <div className="w-4 h-4 border-2 border-slate-200 rounded group-hover:border-indigo-400 transition" />
                        }
                      </button>

                      {/* Unread dot */}
                      <div className="mt-2 flex-shrink-0 w-2 h-2">
                        {isUnread && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                      </div>

                      {/* Star */}
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

                      {/* Content */}
                      <div className="flex-1 min-w-0" onClick={() => handleOpen(delivery)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
                            {getDigestName(delivery.digest_id)}
                          </span>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {delivery.sent_at && format(new Date(delivery.sent_at), 'MMM d')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500 truncate">
                            {delivery.item_count || 0} items
                          </span>
                          {(delivery.tags || []).map(tag => (
                            <span key={tag} className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{tag}</span>
                          ))}
                          {delivery.folder && delivery.folder !== 'Inbox' && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">{delivery.folder}</span>
                          )}
                        </div>
                      </div>
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
              <FileText className="w-5 h-5 text-indigo-600" />
              {selectedDelivery && getDigestName(selectedDelivery.digest_id)}
            </DialogTitle>
          </DialogHeader>

          {selectedDelivery && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-slate-500 pb-4 border-b flex-wrap">
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
              </div>

              {selectedDelivery.date_range_start && selectedDelivery.date_range_end && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <p className="text-slate-600">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Coverage: {format(new Date(selectedDelivery.date_range_start), 'MMM d')} – {format(new Date(selectedDelivery.date_range_end), 'MMM d, yyyy')}
                  </p>
                </div>
              )}

              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-slate-700">
                  {selectedDelivery.content || 'No content available for this digest.'}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}