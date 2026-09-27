import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Loader2, Plus, Pencil, Send, Pause, Play, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import { workspaceCall } from '@/components/feeds/workspaceApi';
import { saveDigestViaApi } from '@/components/feeds/sourceApi';

function scheduleLabel(d) {
  const t = d.schedule_time ? ` at ${d.schedule_time}` : '';
  if (d.frequency === 'weekly') {
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.schedule_day_of_week ?? 1];
    return `Weekly, ${day}${t}`;
  }
  if (d.frequency === 'monthly') return `Monthly, day ${d.schedule_day_of_month ?? 1}${t}`;
  return `Daily${t}`;
}

/**
 * Briefings shared with the caller's team workspace. Every member receives them;
 * owners/editors can create, edit, pause and send them.
 */
export default function SharedDigestsSection({ workspace, canManage, onCreate, onEdit, onSendNow, sendingId }) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['shared-digests', workspace?.id],
    queryFn: () => workspaceCall('list_shared_digests'),
    enabled: !!workspace?.id,
    staleTime: 60_000,
  });
  const digests = data?.digests || [];

  if (!workspace) return null;

  const toggleStatus = async (d) => {
    setBusyId(d.id);
    const next = d.status === 'active' ? 'paused' : 'active';
    const res = await saveDigestViaApi({ id: d.id, status: next });
    setBusyId(null);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`Shared briefing ${next === 'active' ? 'resumed' : 'paused'}`);
    queryClient.invalidateQueries({ queryKey: ['shared-digests'] });
    queryClient.invalidateQueries({ queryKey: ['digests'] });
  };

  return (
    <section aria-labelledby="shared-digests-heading" className="mb-8 border border-stone-800 rounded-xl bg-stone-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-stone-800">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
          <h2 id="shared-digests-heading" className="font-semibold text-stone-200 text-sm truncate">
            Shared with {workspace.name}
          </h2>
          <span className="text-xs text-stone-500">{isLoading ? '' : digests.length}</span>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={onCreate}
            className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold self-start sm:self-auto"
            aria-label="Create a shared briefing"
          >
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
            New shared briefing
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6" role="status" aria-label="Loading shared briefings">
          <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
        </div>
      ) : digests.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-500">
          {canManage
            ? 'No shared briefings yet. Create one, or turn on "Share with team" when editing a digest.'
            : 'No shared briefings yet. Your team’s editors can create them.'}
        </p>
      ) : (
        <ul className="divide-y divide-stone-800" aria-label="Shared briefings">
          {digests.map(d => (
            <li key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-stone-200 truncate">{d.name}</p>
                  {d.status === 'paused' && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">Paused</span>
                  )}
                </div>
                <p className="text-xs text-stone-500 flex items-center gap-1 flex-wrap">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {scheduleLabel(d)}
                  {' · '}{d.feed_ids?.length ? `${d.feed_ids.length} source${d.feed_ids.length === 1 ? '' : 's'}` : 'all shared sources'}
                  {' · '}{d.is_mine ? 'yours' : d.created_by}
                  {d.last_sent ? ` · last sent ${new Date(d.last_sent).toLocaleDateString()}` : ''}
                </p>
              </div>
              {d.can_edit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => onEdit(d)}
                    className="h-8 text-stone-400 hover:text-stone-100"
                    aria-label={`Edit ${d.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Edit</span>
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => toggleStatus(d)}
                    disabled={busyId === d.id}
                    className="h-8 text-stone-400 hover:text-stone-100"
                    aria-label={d.status === 'active' ? `Pause ${d.name}` : `Resume ${d.name}`}
                  >
                    {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : d.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => onSendNow(d)}
                    disabled={sendingId === d.id}
                    className="h-8 text-stone-400 hover:text-stone-100"
                    aria-label={`Send ${d.name} to the team now`}
                  >
                    {sendingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span className="hidden sm:inline ml-1">Send now</span>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-2 text-xs text-stone-600 border-t border-stone-800">
        Shared briefings go to every member by email and inbox
        {data?.team_channels_active ? ', plus the team channel.' : '. Team channel posts need the Team plan.'}{' '}
        <Link to={createPageUrl('Team')} className="text-stone-400 hover:text-[hsl(var(--primary))]">Manage team</Link>
      </p>
    </section>
  );
}
