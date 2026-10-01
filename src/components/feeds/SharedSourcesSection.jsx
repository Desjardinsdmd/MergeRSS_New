import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Loader2, Rss, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import { safeUrl } from '@/components/utils/htmlUtils';
import { workspaceCall } from './workspaceApi';

/**
 * Sources shared into the caller's team workspace (their own and teammates').
 * Articles from these sources already appear in search and Today via queryArticles.
 */
export default function SharedSourcesSection({ workspace, canManage }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['shared-feeds', workspace?.id],
    queryFn: () => workspaceCall('list_shared_feeds'),
    enabled: !!workspace?.id,
    staleTime: 60_000,
  });
  const feeds = data?.feeds || [];

  if (!workspace) return null;

  const unshare = async (feed) => {
    setBusyId(feed.id);
    try {
      await workspaceCall('unshare_feed', { feed_id: feed.id });
      toast.success(`"${feed.name}" is no longer shared`);
      queryClient.invalidateQueries({ queryKey: ['shared-feeds'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="shared-sources-heading" className="panel mb-6">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
        aria-controls="shared-sources-list"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
          <span id="shared-sources-heading" className="truncate font-display text-[15px] font-semibold text-stone-100">
            Shared with {workspace.name}
          </span>
          <span className="font-mono text-xs text-stone-500">{isLoading ? '' : feeds.length}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-stone-500" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-stone-500" aria-hidden="true" />}
      </button>
      {open && (
        <div id="shared-sources-list" className="border-t border-white/[0.07]">
          {isLoading ? (
            <div className="flex justify-center py-6" role="status" aria-label="Loading shared sources">
              <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
            </div>
          ) : feeds.length === 0 ? (
            <p className="px-4 py-4 text-sm text-stone-500">
              {canManage
                ? 'No shared sources yet. Open a source’s menu and choose "Share with team".'
                : 'No shared sources yet. Editors can share sources with the team.'}
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05]" aria-label="Shared sources">
              {feeds.map(f => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.14)]">
                      <Rss className="w-3.5 h-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-100">{f.name}</p>
                      <p className="meta truncate">
                        {f.category}{f.is_mine ? ' · yours' : ` · ${f.created_by}`}
                        {f.status && f.status !== 'active' ? ` · ${f.status}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={safeUrl(f.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden px-2 text-xs text-stone-500 hover:text-[#C4A5FD] sm:inline"
                      aria-label={`Open ${f.name} in a new tab`}
                    >
                      Open
                    </a>
                    {f.can_unshare && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unshare(f)}
                        disabled={busyId === f.id}
                        className="h-8 rounded-lg text-stone-500 hover:text-red-400"
                        aria-label={`Stop sharing ${f.name}`}
                      >
                        {busyId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        <span className="hidden sm:inline ml-1">Unshare</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-white/[0.07] px-4 py-2 text-xs text-stone-500">
            Stories from shared sources appear in search and Today for everyone on the team.{' '}
            <Link to={createPageUrl('Team')} className="text-[#C4A5FD] hover:opacity-80">Manage team</Link>
          </p>
        </div>
      )}
    </section>
  );
}
