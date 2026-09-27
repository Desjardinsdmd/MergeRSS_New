import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Users, Loader2, Mail, Eye, Edit3, Crown, Check, X, Trash2, LogOut,
  Sparkles, Send, Webhook, UserPlus, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TEAM_PLAN, TEAM_ROLES, teamSeatLimit } from '@/lib/planLimits';
import { useWorkspace, workspaceCall, WORKSPACE_KEY } from '@/components/feeds/workspaceApi';

const ROLE_ICON = { owner: Crown, editor: Edit3, viewer: Eye };
const ROLE_COLOR = {
  owner: 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/50',
  editor: 'bg-stone-800 text-[hsl(var(--primary))] border-stone-700',
  viewer: 'bg-stone-800 text-stone-400 border-stone-700',
};

const CHANNELS = [
  { key: 'slack', field: 'slack_webhook_url', label: 'Slack', placeholder: 'https://hooks.slack.com/services/…' },
  { key: 'discord', field: 'discord_webhook_url', label: 'Discord', placeholder: 'https://discord.com/api/webhooks/…' },
  { key: 'teams', field: 'teams_webhook_url', label: 'Microsoft Teams', placeholder: 'https://….webhook.office.com/…' },
];

function RoleBadge({ role }) {
  const Icon = ROLE_ICON[role] || Eye;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border', ROLE_COLOR[role] || ROLE_COLOR.viewer)}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {TEAM_ROLES[role]?.label || role}
    </span>
  );
}

function Avatar({ email }) {
  return (
    <div
      aria-hidden="true"
      className="w-8 h-8 flex-shrink-0 bg-[hsl(var(--primary))]/20 rounded-full flex items-center justify-center text-xs font-bold text-[hsl(var(--primary))]"
    >
      {(email || '?')[0].toUpperCase()}
    </div>
  );
}

export default function Team() {
  const queryClient = useQueryClient();
  const { workspace, membership, members, invites, role, isOwner, isLoading, error } = useWorkspace();
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(null);
  const [wsName, setWsName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [hooks, setHooks] = useState({ slack_webhook_url: '', discord_webhook_url: '', teams_webhook_url: '' });
  const [confirm, setConfirm] = useState(null); // { kind: 'remove'|'leave', member? }

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  useEffect(() => {
    if (workspace && isOwner) {
      setHooks({
        slack_webhook_url: workspace.slack_webhook_url || '',
        discord_webhook_url: workspace.discord_webhook_url || '',
        teams_webhook_url: workspace.teams_webhook_url || '',
      });
    }
  }, [workspace, isOwner]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast.success('Thanks! Your Team plan will activate as soon as Stripe confirms the payment.');
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    }
  }, [queryClient]);

  const activeMembers = useMemo(() => members.filter(m => m.status === 'active'), [members]);
  const pendingMembers = useMemo(() => members.filter(m => m.status === 'invited'), [members]);
  const seatLimit = teamSeatLimit(workspace);
  const seatsUsed = activeMembers.length + pendingMembers.length;
  const seatsFull = seatsUsed >= seatLimit;
  const isTeamPlan = workspace?.plan === 'team';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    queryClient.invalidateQueries({ queryKey: ['shared-feeds'] });
    queryClient.invalidateQueries({ queryKey: ['shared-digests'] });
  };

  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const out = await fn();
      if (success) toast.success(typeof success === 'function' ? success(out) : success);
      refresh();
      return out;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = (e) => {
    e.preventDefault();
    run('create', () => workspaceCall('create', { name: wsName.trim() }), 'Workspace created');
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    const out = await run('invite', () => workspaceCall('invite', { email, role: inviteRole }),
      (o) => o.emailed ? `Invite sent to ${email}` : `${email} invited. The email could not be sent, so let them know to open the Team page.`);
    if (out) { setInviteEmail(''); setInviteRole('viewer'); }
  };

  const handleUpgrade = async () => {
    setBusy('upgrade');
    try {
      const res = await base44.functions.invoke('createCheckoutSession', { plan: 'team', workspace_id: workspace.id });
      if (res?.data?.url) {
        base44.analytics?.track?.({ eventName: 'upgrade_checkout_opened', properties: { plan: 'team' } });
        window.location.href = res.data.url;
      } else {
        toast.error(res?.data?.error || 'Could not start checkout');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Could not start checkout');
    } finally {
      setBusy(null);
    }
  };

  const saveHooks = (e) => {
    e.preventDefault();
    run('hooks', () => workspaceCall('set_webhooks', hooks), 'Team channels saved');
  };

  const testHook = (channel) =>
    run(`test-${channel}`, () => workspaceCall('test_webhook', { channel }), 'Test message sent');

  const doConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'remove') {
      await run(`remove-${c.member.id}`, () => workspaceCall('remove_member', { member_id: c.member.id }),
        c.member.status === 'invited' ? 'Invite cancelled' : 'Member removed');
    } else if (c.kind === 'leave') {
      await run('leave', () => workspaceCall('leave'), isOwner ? 'Workspace closed' : 'You left the workspace');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Loading team">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Team</h1>
        <p className="text-stone-500 text-sm mt-0.5">
          Share sources and briefings with up to {TEAM_PLAN.seats} people. Your personal sources and briefings stay private.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 border border-red-900/60 bg-red-950/30 rounded-lg text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error.message}
        </div>
      )}

      {/* Invites addressed to me */}
      {invites.length > 0 && (
        <Card className="border-[hsl(var(--primary))]/40 bg-stone-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-stone-100">
              <Mail className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Pending invites
            </CardTitle>
            {workspace && (
              <CardDescription className="text-stone-500">
                You can be in one workspace at a time. Leave {workspace.name} to accept another.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map(inv => (
              <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-stone-800 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-200 truncate">{inv.workspace_name}</p>
                  <p className="text-xs text-stone-500 truncate">From {inv.invited_by || inv.owner_email} · joins as {TEAM_ROLES[inv.role]?.label || inv.role}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    disabled={!!workspace || busy === `accept-${inv.id}`}
                    onClick={() => run(`accept-${inv.id}`, () => workspaceCall('accept', { workspace_id: inv.workspace_id }), `Joined ${inv.workspace_name}`)}
                    className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
                    aria-label={`Accept invite to ${inv.workspace_name}`}
                  >
                    {busy === `accept-${inv.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" aria-hidden="true" />}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `decline-${inv.id}`}
                    onClick={() => run(`decline-${inv.id}`, () => workspaceCall('decline', { workspace_id: inv.workspace_id }), 'Invite declined')}
                    className="border-stone-700 text-stone-300"
                    aria-label={`Decline invite to ${inv.workspace_name}`}
                  >
                    <X className="w-4 h-4 mr-1" aria-hidden="true" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No workspace yet */}
      {!workspace && (
        <Card className="border-stone-800 bg-stone-900">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-stone-100">
              <Users className="w-4 h-4 text-stone-500" aria-hidden="true" />
              Create a team workspace
            </CardTitle>
            <CardDescription className="text-stone-500 leading-relaxed">
              Try it free with one teammate. Shared briefings go to everyone by email and in their inbox.
              Upgrade to Team (${TEAM_PLAN.priceMonthly}/month per workspace) for {TEAM_PLAN.seats} seats and a shared Slack, Discord or Teams channel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
              <Label htmlFor="ws-name" className="sr-only">Workspace name</Label>
              <Input
                id="ws-name"
                value={wsName}
                onChange={e => setWsName(e.target.value)}
                placeholder={user?.full_name ? `${user.full_name}'s team` : 'Workspace name'}
                maxLength={80}
                className="bg-stone-950 border-stone-700 text-stone-100"
              />
              <Button
                type="submit"
                disabled={busy === 'create'}
                className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
                aria-label="Create workspace"
              >
                {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create workspace'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {workspace && (
        <>
          {/* Plan */}
          <Card className="border-stone-800 bg-stone-900">
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-stone-100 truncate">{workspace.name}</h2>
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded',
                    isTeamPlan ? 'bg-[hsl(var(--primary))] text-stone-900' : 'bg-stone-800 text-stone-400')}>
                    {isTeamPlan ? 'Team' : 'Trial'}
                  </span>
                  <RoleBadge role={role} />
                </div>
                <p className="text-sm text-stone-500 mt-1">
                  {seatsUsed} of {seatLimit} seats used
                  {isTeamPlan
                    ? (workspace.subscription_status === 'past_due' ? ' · payment past due' : '')
                    : ' · shared briefings deliver by email and inbox only'}
                </p>
              </div>
              {isOwner && !isTeamPlan && (
                <Button
                  onClick={handleUpgrade}
                  disabled={busy === 'upgrade'}
                  className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold flex-shrink-0"
                  aria-label={`Upgrade to Team for $${TEAM_PLAN.priceMonthly} per month`}
                >
                  {busy === 'upgrade' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />}
                  Upgrade to Team · ${TEAM_PLAN.priceMonthly}/mo
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card className="border-stone-800 bg-stone-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-stone-100">
                <Users className="w-4 h-4 text-stone-500" aria-hidden="true" />
                Members
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-stone-800" aria-label="Workspace members">
                {[...activeMembers, ...pendingMembers].map(m => {
                  const isMe = m.id === membership?.id;
                  const pending = m.status === 'invited';
                  return (
                    <li key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-3.5 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar email={m.user_email} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-200 truncate">{m.user_email}</p>
                          <p className="text-xs text-stone-500">
                            {pending ? 'Invite pending' : m.joined_at ? `Joined ${new Date(m.joined_at).toLocaleDateString()}` : 'Active'}
                            {isMe ? ' · you' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isOwner && m.role !== 'owner' ? (
                          <Select
                            value={m.role}
                            onValueChange={(v) => run(`role-${m.id}`, () => workspaceCall('set_role', { member_id: m.id, role: v }), `Role changed to ${TEAM_ROLES[v].label}`)}
                            disabled={busy === `role-${m.id}`}
                          >
                            <SelectTrigger className="w-28 h-8 bg-stone-950 border-stone-700 text-stone-200" aria-label={`Role for ${m.user_email}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <RoleBadge role={m.role} />
                        )}
                        {pending && <span className="text-xs px-2 py-0.5 rounded-md border border-stone-700 text-stone-400">Invited</span>}
                        {isOwner && m.role !== 'owner' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-stone-500 hover:text-red-400"
                            onClick={() => setConfirm({ kind: 'remove', member: m })}
                            disabled={busy === `remove-${m.id}`}
                            aria-label={pending ? `Cancel invite for ${m.user_email}` : `Remove ${m.user_email}`}
                          >
                            {busy === `remove-${m.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {isOwner && (
                <form onSubmit={handleInvite} className="border-t border-stone-800 p-4 sm:px-6 space-y-2" aria-label="Invite a member">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Label htmlFor="invite-email" className="sr-only">Email address</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      disabled={seatsFull}
                      className="bg-stone-950 border-stone-700 text-stone-100"
                    />
                    <Select value={inviteRole} onValueChange={setInviteRole} disabled={seatsFull}>
                      <SelectTrigger className="sm:w-32 bg-stone-950 border-stone-700 text-stone-200" aria-label="Role for the new member">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="submit"
                      disabled={seatsFull || !inviteEmail.trim() || busy === 'invite'}
                      className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
                      aria-label="Send invite"
                    >
                      {busy === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" />}
                      Invite
                    </Button>
                  </div>
                  <p className="text-xs text-stone-500">
                    {seatsFull
                      ? (isTeamPlan
                        ? `All ${seatLimit} seats are in use. Remove someone to invite another person.`
                        : `The free trial includes one teammate. Upgrade to Team for ${TEAM_PLAN.seats} seats.`)
                      : `${TEAM_ROLES[inviteRole].label}s: ${TEAM_ROLES[inviteRole].description.toLowerCase()}.`}
                  </p>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Team channels */}
          <Card className="border-stone-800 bg-stone-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-stone-100">
                <Webhook className="w-4 h-4 text-stone-500" aria-hidden="true" />
                Team channel
              </CardTitle>
              <CardDescription className="text-stone-500">
                Shared briefings post here once, in addition to each member's email.
                {!isTeamPlan && ' Channel posts start when the workspace is on the Team plan.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isOwner ? (
                <form onSubmit={saveHooks} className="space-y-3">
                  {CHANNELS.map(c => (
                    <div key={c.key} className="space-y-1">
                      <Label htmlFor={`hook-${c.key}`} className="text-xs text-stone-400">{c.label} webhook URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`hook-${c.key}`}
                          type="url"
                          value={hooks[c.field]}
                          onChange={e => setHooks(h => ({ ...h, [c.field]: e.target.value }))}
                          placeholder={c.placeholder}
                          className="bg-stone-950 border-stone-700 text-stone-100 font-mono text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!workspace[c.field] || busy === `test-${c.key}`}
                          onClick={() => testHook(c.key)}
                          className="border-stone-700 text-stone-300 flex-shrink-0"
                          aria-label={`Send a test message to the ${c.label} webhook`}
                        >
                          {busy === `test-${c.key}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden="true" />}
                          <span className="hidden sm:inline ml-2">Test</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <Button
                      type="submit"
                      disabled={busy === 'hooks'}
                      className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
                      aria-label="Save team channels"
                    >
                      {busy === 'hooks' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save channels'}
                    </Button>
                    <span className="text-xs text-stone-500">Save before testing a new URL.</span>
                  </div>
                </form>
              ) : (
                <ul className="text-sm text-stone-400 space-y-1" aria-label="Connected team channels">
                  {CHANNELS.map(c => (
                    <li key={c.key} className="flex items-center gap-2">
                      {workspace[`has_${c.key}`]
                        ? <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                        : <X className="w-4 h-4 text-stone-600" aria-hidden="true" />}
                      {c.label} {workspace[`has_${c.key}`] ? 'connected' : 'not connected'}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => setConfirm({ kind: 'leave' })}
              disabled={busy === 'leave'}
              className="text-stone-500 hover:text-red-400"
              aria-label={isOwner ? 'Close this workspace' : 'Leave this workspace'}
            >
              {busy === 'leave' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />}
              {isOwner ? 'Close workspace' : 'Leave workspace'}
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-100">
              {confirm?.kind === 'remove'
                ? (confirm.member.status === 'invited' ? 'Cancel this invite?' : `Remove ${confirm.member.user_email}?`)
                : isOwner ? 'Close this workspace?' : 'Leave this workspace?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              {confirm?.kind === 'remove'
                ? (confirm.member.status === 'invited'
                  ? 'The invite link will stop working.'
                  : 'They lose access to shared sources and briefings. Sources and briefings they shared go back to being private to them.')
                : isOwner
                  ? 'Everything shared in this workspace goes back to being private to whoever shared it. Remove other members and cancel the Team plan first.'
                  : 'Sources and briefings you shared become private again, and you stop receiving shared briefings.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-stone-700 text-stone-300">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm} className="bg-red-600 hover:bg-red-700 text-white">
              {confirm?.kind === 'remove' ? (confirm.member.status === 'invited' ? 'Cancel invite' : 'Remove') : isOwner ? 'Close' : 'Leave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
