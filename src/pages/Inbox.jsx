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
  Download,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import InboxFolderSidebar from '@/components/inbox/InboxFolderSidebar';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import InboxToolbar from '@/components/inbox/InboxToolbar';
import { generatePremiumPdf } from '@/lib/generatePremiumPdf';
import ReactMarkdown from 'react-markdown';
import SavedArticles from '@/components/dashboard/SavedArticles';
import { PageHeader } from '@/components/brand/Brand';

// Dark-theme markdown renderer for digest bodies. Raw HTML is not rendered (react-markdown
// default), and every link goes through safeUrl and opens in a new tab.
const DIGEST_MD_COMPONENTS = {
  h1: ({ node, ...p }) => <h2 className="font-display text-lg font-semibold text-stone-100 mt-5 mb-2" {...p} />,
  h2: ({ node, ...p }) => <h3 className="font-display text-base font-semibold text-stone-100 mt-5 mb-2" {...p} />,
  h3: ({ node, ...p }) => <h4 className="text-sm font-semibold text-stone-200 mt-4 mb-1.5" {...p} />,
  h4: ({ node, ...p }) => <h5 className="text-sm font-semibold text-stone-300 mt-3 mb-1" {...p} />,
  p: ({ node, ...p }) => <p className="text-sm text-stone-300 leading-relaxed my-2" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-stone-300" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-stone-300" {...p} />,
  li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-stone-200" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="border-l-2 border-[hsl(var(--primary)/0.6)] pl-3 my-3 text-stone-400 italic" {...p} />,
  hr: () => <hr className="my-4 border-white/[0.06]" />,
  code: ({ node, inline, ...p }) => <code className="bg-white/[0.06] font-mono text-brand-light rounded-md px-1 py-0.5 text-xs" {...p} />,
  pre: ({ node, ...p }) => <pre className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 font-mono overflow-x-auto text-xs my-3" {...p} />,
  a: ({ node, href, children, ...p }) => (
    <a
      {...p}
      href={safeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-light underline underline-offset-2 hover:text-stone-100 break-words"
    >
      {children}
    </a>
  ),
  img: () => null,
};

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
  const [tab, setTab] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('tab') === 'saved' ? 'saved' : 'briefings'; } catch { return 'briefings'; }
  });

  const switchTab = (next) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'saved') url.searchParams.set('tab', 'saved'); else url.searchParams.delete('tab');
      url.searchParams.delete('delivery_id');
      window.history.replaceState(null, '', url.pathname + url.search);
    } catch { /* ignore */ }
  };

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

  const getDigestName = id => digests.find(d => d.id === id)?.name || 'Unknown briefing';

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

  const handleDownloadPdf = async (delivery) => {
    const digestName = getDigestName(delivery.digest_id);
    await generatePremiumPdf({
      report: {
        executive_summary: (delivery.content || 'No content available.').split('\n')[0],
        key_themes: [],
        inflection_points: [],
        escalating_topics: [],
        deescalating_topics: [],
        cyclical_topics: [],
        outlook: delivery.content || '',
        data_summary: {
          digest_count: 1,
          date_range: delivery.sent_at ? format(new Date(delivery.sent_at), 'MMMM d, yyyy') : '',
          most_active_period: '',
        }
      },
      digest_name: digestName,
      delivery_count: delivery.item_count || 0,
      start_date: delivery.date_range_start || delivery.sent_at,
      end_date: delivery.date_range_end || delivery.sent_at,
    });
  };

  const sortSelect = (
    <Select value={sortBy} onValueChange={setSortBy}>
      <SelectTrigger className="w-full rounded-xl text-sm" aria-label="Sort briefings">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">Newest first</SelectItem>
        <SelectItem value="oldest">Oldest first</SelectItem>
        <SelectItem value="unread">Unread first</SelectItem>
        <SelectItem value="items">Most stories</SelectItem>
      </SelectContent>
    </Select>
  );

  const chipClass = (active) => cn(
    'flex-shrink-0 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
    active
      ? 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.16)] text-stone-100'
      : 'border-white/[0.07] text-stone-400 hover:bg-white/[0.04] hover:text-stone-100'
  );

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title="Inbox" subtitle="Your delivered briefings and the stories you saved" />

      <div role="tablist" aria-label="Inbox sections" className="mb-6 flex gap-6 border-b border-white/[0.07]">
        {[['briefings', 'Briefings'], ['saved', 'Saved']].map(([val, label]) => (
          <button
            key={val}
            type="button"
            role="tab"
            id={`inbox-tab-${val}`}
            aria-selected={tab === val}
            aria-controls={`inbox-panel-${val}`}
            onClick={() => switchTab(val)}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] rounded-t',
              tab === val ? 'border-[hsl(var(--primary))] text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'saved' ? (
        <div role="tabpanel" id="inbox-panel-saved" aria-labelledby="inbox-tab-saved">
          <SavedArticles user={user} />
        </div>
      ) : (
      <div role="tabpanel" id="inbox-panel-briefings" aria-labelledby="inbox-tab-briefings">
      {/* Mobile: sort + folder selector */}
      <div className="lg:hidden mb-4 space-y-3">
        <div className="w-48">{sortSelect}</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['Inbox', 'Starred', ...customFolders].map(folder => (
            <button
              key={folder}
              onClick={() => { setSelectedFolder(folder); setSelectedTag(null); }}
              className={chipClass(selectedFolder === folder && !selectedTag)}
            >
              {folder}
              {(unreadCounts?.[folder] || 0) > 0 && (
                <span className="ml-1.5 font-mono text-xs text-emerald-400">{unreadCounts[folder]}</span>
              )}
            </button>
          ))}
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => { setSelectedTag(tag); setSelectedFolder(null); }}
              className={chipClass(selectedTag === tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        <div className="hidden lg:block w-56 flex-shrink-0 space-y-5">
          {sortSelect}
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
          <div className="panel overflow-hidden">
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
                <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 px-4">
                 <div className="w-12 h-12 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                   <InboxIcon className="w-6 h-6 text-stone-500" />
                 </div>
                 <h3 className="font-display text-lg font-semibold text-stone-100 mb-1">No briefings here</h3>
                 <p className="text-stone-400 text-sm">Nothing in {selectedTag ? `#${selectedTag}` : selectedFolder} yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {filtered.map(delivery => {
                  const isUnread = !delivery.is_read;
                  const isSelected = selectedIds.includes(delivery.id);
                  return (
                    <div
                       key={delivery.id}
                       className={cn(
                         'flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.03] transition group',
                         isSelected && 'bg-[hsl(var(--brand)/0.08)] hover:bg-[hsl(var(--brand)/0.1)]'
                       )}
                     >
                      <button
                         type="button"
                         className="mt-0.5 flex-shrink-0 text-stone-600 transition"
                         onClick={e => { e.stopPropagation(); toggleSelect(delivery.id); }}
                         aria-label={isSelected ? 'Deselect briefing' : 'Select briefing'}
                         aria-pressed={isSelected}
                       >
                         {isSelected
                           ? <div className="w-4 h-4 bg-[hsl(var(--primary))] rounded-[5px] flex items-center justify-center"><svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                           : <div className="w-4 h-4 border-2 border-stone-700 rounded-[5px] group-hover:border-[hsl(var(--primary)/0.7)] transition" />
                         }
                       </button>

                       <div className="mt-[7px] flex-shrink-0 w-2 h-2">
                         {isUnread && <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />}
                       </div>

                      <button
                        type="button"
                        className="mt-0.5 flex-shrink-0"
                        aria-label={delivery.is_favorited ? 'Remove from starred' : 'Star this briefing'}
                        aria-pressed={!!delivery.is_favorited}
                        onClick={async e => {
                          e.stopPropagation();
                          await base44.entities.DigestDelivery.update(delivery.id, { is_favorited: !delivery.is_favorited });
                          invalidate();
                        }}
                      >
                        <Star className={cn('w-4 h-4 transition', delivery.is_favorited ? 'text-[hsl(var(--primary))] fill-[hsl(var(--primary))]' : 'text-stone-500 hover:text-brand-light')} />
                      </button>

                      <div className="flex-1 min-w-0" onClick={() => handleOpen(delivery)}>
                        <div className="flex items-center justify-between gap-2">
                           <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-stone-100' : 'font-medium text-stone-400')}>
                              {decodeHtml(getDigestName(delivery.digest_id))}
                            </span>
                           <span className="meta flex-shrink-0">
                             {delivery.sent_at && format(new Date(delivery.sent_at), 'MMM d')}
                           </span>
                         </div>
                         <div className="flex items-center gap-2 mt-1">
                           <span className="meta truncate">{delivery.item_count || 0} stories</span>
                           {(delivery.tags || []).map(tag => (
                             <span key={tag} className="chip-neutral">{tag}</span>
                           ))}
                           {delivery.folder && delivery.folder !== 'Inbox' && (
                             <span className="chip-brand">{delivery.folder}</span>
                           )}
                         </div>
                      </div>

                      {/* Download PDF button (visible on hover) */}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleDownloadPdf(delivery); }}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 mt-0.5 flex-shrink-0 rounded-lg p-1 text-stone-500 hover:text-brand-light transition"
                        title="Download as PDF"
                        aria-label={`Download ${getDigestName(delivery.digest_id) || 'briefing'} as PDF`}
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
      </div>
      )}

      {/* Delivery Detail Dialog */}
      <Dialog open={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <FileText className="w-5 h-5 text-[hsl(var(--primary))]" />
              {selectedDelivery && getDigestName(selectedDelivery.digest_id)}
            </DialogTitle>
          </DialogHeader>

          {selectedDelivery && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-stone-500 pb-4 border-b border-white/[0.07] flex-wrap">
                <span className="meta flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(selectedDelivery.sent_at), 'MMMM d, yyyy h:mm a')}
                </span>
                <span className="chip-neutral">{selectedDelivery.item_count || 0} stories</span>
                <span className="chip border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  <CheckCircle className="w-3 h-3 mr-1" />Delivered
                </span>
                <button
                  type="button"
                  aria-label={selectedDelivery.is_favorited ? 'Remove from starred' : 'Star this briefing'}
                  aria-pressed={!!selectedDelivery.is_favorited}
                  onClick={async () => {
                    await base44.entities.DigestDelivery.update(selectedDelivery.id, { is_favorited: !selectedDelivery.is_favorited });
                    setSelectedDelivery(prev => ({ ...prev, is_favorited: !prev.is_favorited }));
                    invalidate();
                  }}
                >
                  <Star className={cn('w-4 h-4 transition', selectedDelivery.is_favorited ? 'text-[hsl(var(--primary))] fill-[hsl(var(--primary))]' : 'text-stone-500 hover:text-brand-light')} />
                </button>
                <Button size="sm" variant="outline" className="ml-auto gap-1.5 rounded-xl" onClick={() => handleDownloadPdf(selectedDelivery)}>
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </Button>
              </div>

              {selectedDelivery.date_range_start && selectedDelivery.date_range_end && (
                <div className="panel-raised p-3 text-sm">
                  <p className="meta">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Coverage: {format(new Date(selectedDelivery.date_range_start), 'MMM d')} – {format(new Date(selectedDelivery.date_range_end), 'MMM d, yyyy')}
                  </p>
                </div>
              )}

              <div className="prose prose-sm prose-invert max-w-none text-stone-400">
                {selectedDelivery.content ? (
                  <ReactMarkdown components={DIGEST_MD_COMPONENTS}>
                    {String(selectedDelivery.content)}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm text-stone-500">No content available for this briefing.</p>
                )}
              </div>

              {selectedDelivery.items?.length > 0 && (
                <div className="border border-white/[0.07] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowItems(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition text-sm font-medium text-stone-300"
                  >
                    <span>{selectedDelivery.items.length} stories in this briefing</span>
                    {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showItems && (
                    <div className="divide-y divide-white/[0.06] max-h-64 overflow-y-auto">
                      {selectedDelivery.items.map((item, i) => (
                        <a
                          key={i}
                          href={safeUrl(item.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 px-4 py-2.5 hover:bg-white/[0.04] transition group"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-stone-600 group-hover:text-brand-light" />
                          <span className="text-sm text-stone-300 group-hover:text-brand-light line-clamp-2">{decodeHtml(item.title)}</span>
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