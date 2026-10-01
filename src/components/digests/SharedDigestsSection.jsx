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
    <section aria-labelledby="shared-digests-heading" className="panel mb-8 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl border border-white/[0.07] bg-white/[0.05] flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          </span>
          <h2 id="shared-digests-heading" className="font-display text-base font-semibold text-stone-100 truncate">
            Shared with {workspace.name}&rsquo;s team
          </h2>
          <span className="font-mono text-xs text-stone-500">{isLoading ? '' : digests.length}</span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onCreate}
            className="btn-soft self-start sm:self-auto"
            aria-label="Create a shared briefing"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New shared briefing
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6" role="status" aria-label="Loading shared briefings">
          <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
        </div>
      ) : digests.length === 0 ? (
        <p className="px-5 py-4 text-sm text-stone-400">
          {canManage
            ? 'No shared briefings yet. Create one, or turn on "Share with team" when editing a briefing.'
            : 'No shared briefings yet. Your team’s editors can create them.'}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]" aria-label="Shared briefings">
          {digests.map(d => (
            <li key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-stone-100 truncate">{d.name}</p>
                  {d.status === 'paused' && (
                    <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-400">Paused</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-stone-400 flex items-center gap-1 flex-wrap">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {scheduleLabel(d)}
                  {' · '}{d.feed_ids?.length ? `${d.feed_ids.length} source${d.feed_ids.length === 1 ? '' : 's'}` : 'all shared sources'}
                  {' · '}{d.is_mine ? 'yours' : d.created_by}
                  {d.last_sent ? <span className="font-mono">{` · last sent ${new Date(d.last_sent).toLocaleDateString()}`}</span> : ''}
                </p>
              </div>
              {d.can_edit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => onEdit(d)}
                    className="h-8 rounded-lg text-stone-400 hover:text-stone-100"
                    aria-label={`Edit ${d.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Edit</span>
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => toggleStatus(d)}
                    disabled={busyId === d.id}
                    className="h-8 rounded-lg text-stone-400 hover:text-stone-100"
                    aria-label={d.status === 'active' ? `Pause ${d.name}` : `Resume ${d.name}`}
                  >
                    {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : d.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => onSendNow(d)}
                    disabled={sendingId === d.id}
                    className="h-8 rounded-lg text-stone-400 hover:text-stone-100"
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
      <p className="px-5 py-3 text-xs text-stone-500 border-t border-white/[0.06]">
        Shared briefings go to every member by email and inbox
        {data?.team_channels_active ? ', plus the team channel.' : '. Team channel posts need the Team plan.'}{' '}
        <Link to={createPageUrl('Team')} className="font-medium text-[hsl(var(--primary))] hover:underline">Manage team</Link>
      </p>
    </section>
  );
}
