import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Slack,
  MessageCircle,
  Check,
  Plus,
  Loader2,
  Crown,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';


import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';

export default function Integrations() {
  const [user, setUser] = useState(null);
  const [showSlackDialog, setShowSlackDialog] = useState(false);
  const [showDiscordDialog, setShowDiscordDialog] = useState(false);
  const [showTeamsDialog, setShowTeamsDialog] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [teamsWebhook, setTeamsWebhook] = useState('');
  const [slackError, setSlackError] = useState('');
  const [discordError, setDiscordError] = useState('');
  const [teamsError, setTeamsError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations', user?.email],
    queryFn: () => base44.entities.Integration.filter({ created_by: user?.email }),
    enabled: !!user?.email,
  });

  const slackIntegration = integrations.find(i => i.type === 'slack');
  const discordIntegration = integrations.find(i => i.type === 'discord');
  const teamsIntegration = integrations.find(i => i.type === 'teams');
  const isPremium = user?.plan === 'premium';
  
  const checkIntegrationLimit = () => {
    if (!isPremium) {
      toast.error('Integrations are premium only. Upgrade to connect Slack, Discord, and Microsoft Teams.');
      return false;
    }
    return true;
  };

  const handleConnectSlack = async () => {
    if (!isPremium || !slackWebhook) return;
    if (!slackWebhook.includes('hooks.slack.com')) {
      setSlackError('URL must be a valid Slack webhook (hooks.slack.com/…)');
      return;
    }
    setSlackError('');
    setLoading(true);

    try {
      await base44.entities.Integration.create({
        type: 'slack',
        status: 'connected',
        workspace_name: 'Slack Workspace',
        webhook_url: slackWebhook,
      });

      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setLoading(false);
      setShowSlackDialog(false);
      setSlackWebhook('');
      toast.success('Slack connected successfully!');
    } catch (error) {
      setLoading(false);
      toast.error(error.message || 'Failed to connect Slack');
    }
  };

  const handleConnectDiscord = async () => {
    if (!isPremium || !discordWebhook) return;
    if (!discordWebhook.includes('api/webhooks/')) {
      setDiscordError('URL must be a valid Discord webhook (discord.com/api/webhooks/…)');
      return;
    }
    setDiscordError('');
    setLoading(true);

    try {

      await base44.entities.Integration.create({
        type: 'discord',
        status: 'connected',
        webhook_url: discordWebhook,
        workspace_name: 'Discord Server',
      });

      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setLoading(false);
      setShowDiscordDialog(false);
      setDiscordWebhook('');
      toast.success('Discord connected successfully!');
    } catch (error) {
      setLoading(false);
      toast.error(error.message || 'Failed to connect Discord');
    }
  };

  const handleDisconnect = async () => {
    if (disconnectConfirm) {
      await base44.entities.Integration.delete(disconnectConfirm.id);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setDisconnectConfirm(null);
      toast.success('Integration disconnected');
    }
  };

  const handleUpdateChannel = async (channelId) => {
    if (!slackIntegration) return;
    const channel = slackIntegration.channels?.find(c => c.id === channelId);
    await base44.entities.Integration.update(slackIntegration.id, {
      selected_channel_id: channelId,
      selected_channel_name: channel?.name,
    });
    queryClient.invalidateQueries({ queryKey: ['integrations'] });
    toast.success('Channel updated');
  };

  const handleConnectTeams = async () => {
    if (!isPremium || !teamsWebhook) return;
    if (!teamsWebhook.includes('webhook.office.com') && !teamsWebhook.includes('office365.com')) {
      setTeamsError('URL must be a valid Microsoft Teams webhook (webhook.office.com/…)');
      return;
    }
    setTeamsError('');
    setLoading(true);
    try {
      await base44.entities.Integration.create({
        type: 'teams',
        status: 'connected',
        workspace_name: 'Microsoft Teams',
        webhook_url: teamsWebhook,
      });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setShowTeamsDialog(false);
      setTeamsWebhook('');
      toast.success('Microsoft Teams connected!');
    } catch (error) {
      toast.error(error.message || 'Failed to connect Teams');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestMessage = async (type) => {
    setLoading(true);
    if (type === 'Teams' && teamsIntegration?.webhook_url) {
      const body = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: '✅ MergeRSS test message — your Teams integration is working!' }] } }] };
      const res = await fetch(teamsIntegration.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setLoading(false);
      if (res.ok || res.status === 202) {
        toast.success('Test message sent to Teams!');
      } else {
        toast.error('Failed to send test message');
      }
    } else if (type === 'Discord' && discordIntegration?.webhook_url) {
      const res = await base44.functions.invoke('sendDiscordTest', { webhook_url: discordIntegration.webhook_url });
      setLoading(false);
      if (res.data?.success) {
        toast.success('Test message sent to Discord!');
      } else {
        toast.error(res.data?.error || 'Failed to send test message');
      }
    } else if (type === 'Slack' && slackIntegration?.webhook_url) {
      const res = await base44.functions.invoke('sendSlackMessage', {
        webhook_url: slackIntegration.webhook_url,
        text: '✅ *MergeRSS test message* — your Slack integration is working!',
      });
      setLoading(false);
      if (res.data?.success) {
        toast.success('Test message sent to Slack!');
      } else {
        toast.error(res.data?.error || 'Failed to send test message');
      }
    } else {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Integrations"
        subtitle="Deliver briefings to Slack, Discord and Microsoft Teams"
      />

      {/* Premium Notice */}
      {!isPremium && (
        <div className="panel-accent mb-6 flex flex-wrap items-center gap-4 p-5">
          <div className="logo-mark h-10 w-10 flex-shrink-0 rounded-lg">
            <Crown className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-stone-100">Upgrade to Premium</p>
            <p className="text-sm text-stone-400">Unlock Slack, Discord and Microsoft Teams delivery</p>
          </div>
          <Link to={createPageUrl('Pricing')} className="btn-brand">
            Upgrade
          </Link>
        </div>
      )}

      {/* Integration cards */}
      <MicroLabel className="mb-3">Delivery channels</MicroLabel>
      <div className="space-y-4">
        {/* Microsoft Teams */}
        <section className="panel p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="h-6 w-6 text-stone-200" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display text-base font-semibold text-stone-100">Microsoft Teams</h3>
                  {!isPremium && (
                    <span className="chip-brand gap-1"><Crown className="h-3 w-3" aria-hidden="true" /> Premium</span>
                  )}
                </div>
                <p className="text-sm text-stone-400 mb-4">Post briefings to your Microsoft Teams channels</p>
                {teamsIntegration?.status === 'connected' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="chip gap-1 border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><Check className="h-3 w-3" aria-hidden="true" /> Connected</span>
                      <span className="meta">Webhook configured</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => handleSendTestMessage('Teams')} disabled={loading}>Send test</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDisconnectConfirm(teamsIntegration)} className="text-red-400 hover:bg-red-400/10 hover:text-red-300"
                        aria-label="Disconnect"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => { if (checkIntegrationLimit()) setShowTeamsDialog(true); }} disabled={!isPremium} className={cn(isPremium && "bg-none bg-[#6264A7] shadow-none hover:bg-[#4f5196]")}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Connect Teams
                  </Button>
                )}
              </div>
            </div>
        </section>
        {/* Slack */}
        <section className="panel p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Slack className="h-6 w-6 text-stone-200" aria-hidden="true" />
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-base font-semibold text-stone-100">Slack</h3>
                    {!isPremium && (
                      <span className="chip-brand gap-1"><Crown className="h-3 w-3" aria-hidden="true" /> Premium</span>
                    )}
                  </div>
                  <p className="text-sm text-stone-400 mb-4">
                  Post briefings directly to your Slack channels
                </p>

                {slackIntegration?.status === 'connected' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="chip gap-1 border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><Check className="h-3 w-3" aria-hidden="true" /> Connected</span>
                      <span className="meta">Webhook configured</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendTestMessage('Slack')}
                        disabled={loading}
                      >
                        Send test
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectConfirm(slackIntegration)}
                        className="text-red-400 hover:bg-red-400/10 hover:text-red-300"
                        aria-label="Disconnect"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowSlackDialog(true)}
                    disabled={!isPremium}
                    className={cn(
                      isPremium && "bg-none bg-[#4A154B] shadow-none hover:bg-[#3e1140]"
                    )}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Connect Slack
                  </Button>
                )}
              </div>
            </div>
        </section>

        {/* Discord */}
        <section className="panel p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="h-6 w-6 text-stone-200" aria-hidden="true" />
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-base font-semibold text-stone-100">Discord</h3>
                    {!isPremium && (
                      <span className="chip-brand gap-1"><Crown className="h-3 w-3" aria-hidden="true" /> Premium</span>
                    )}
                  </div>
                  <p className="text-sm text-stone-400 mb-4">
                  Send briefings to your Discord server via webhook
                </p>

                {discordIntegration?.status === 'connected' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="chip gap-1 border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><Check className="h-3 w-3" aria-hidden="true" /> Connected</span>
                      <span className="meta">Webhook configured</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendTestMessage('Discord')}
                        disabled={loading}
                      >
                        Send test
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectConfirm(discordIntegration)}
                        className="text-red-400 hover:bg-red-400/10 hover:text-red-300"
                        aria-label="Disconnect"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowDiscordDialog(true)}
                    disabled={!isPremium}
                    className={cn(
                      isPremium && "bg-none bg-[#5865F2] shadow-none hover:bg-[#4752c4]"
                    )}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Connect Discord
                  </Button>
                )}
              </div>
            </div>
        </section>
      </div>

      {/* Teams Dialog */}
      <Dialog open={showTeamsDialog} onOpenChange={setShowTeamsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#8B8DD6]" aria-hidden="true" />
              Connect Microsoft Teams
            </DialogTitle>
            <DialogDescription>Add an incoming webhook to post briefings to a Teams channel</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="teamsWebhook" className="micro-label mb-1.5 block">Incoming webhook URL <span className="text-[hsl(var(--primary))]">*</span></Label>
              <Input
                id="teamsWebhook"
                value={teamsWebhook}
                onChange={(e) => { setTeamsWebhook(e.target.value); setTeamsError(''); }}
                placeholder="https://xxx.webhook.office.com/webhookb2/..."
                className={cn(teamsError && 'border-red-400/60')}
              />
              {teamsError
                ? <p className="mt-1 text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{teamsError}</p>
                : <p className="mt-1 text-xs text-stone-500">Paste the webhook URL from your Teams channel connector settings</p>
              }
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-sm text-stone-400">
              <MicroLabel className="mb-2">How to get a webhook</MicroLabel>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Open the Teams channel → click "…" → Connectors</li>
                <li>Search for "Incoming Webhook" → Configure</li>
                <li>Give it a name and click Create</li>
                <li>Copy the webhook URL and paste it above</li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeamsDialog(false)}>Cancel</Button>
            <Button onClick={handleConnectTeams} disabled={loading || !teamsWebhook}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Connect Teams
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slack Dialog */}
      <Dialog open={showSlackDialog} onOpenChange={setShowSlackDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Slack className="h-5 w-5 text-[#E01E5A]" aria-hidden="true" />
              Connect Slack
            </DialogTitle>
            <DialogDescription>
              Connect your Slack workspace to receive briefings in your channels
            </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="slackWebhook" className="micro-label mb-1.5 block">Incoming webhook URL <span className="text-[hsl(var(--primary))]" aria-hidden="true">*</span></Label>
              <Input
                id="slackWebhook"
                value={slackWebhook}
                onChange={(e) => { setSlackWebhook(e.target.value); setSlackError(''); }}
                placeholder="https://hooks.slack.com/services/T.../B.../..."
                aria-invalid={!!slackError}
                aria-describedby={slackError ? 'slack-error' : 'slack-hint'}
                className={cn(slackError && 'border-red-400/60')}
              />
              {slackError
                ? <p id="slack-error" role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" aria-hidden="true" />{slackError}</p>
                : <p id="slack-hint" className="mt-1 text-xs text-stone-500">Paste the full webhook URL from your Slack app settings</p>
              }
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-sm text-stone-400">
              <MicroLabel className="mb-2">How to get a webhook</MicroLabel>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-[#C4A5FD] underline underline-offset-2">api.slack.com/apps</a></li>
                <li>Create an app → Incoming Webhooks</li>
                <li>Enable and add a new webhook to your channel</li>
                <li>Copy the webhook URL and paste it above</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSlackDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConnectSlack}
              disabled={loading || !slackWebhook}
             
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Connect Slack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discord Dialog */}
      <Dialog open={showDiscordDialog} onOpenChange={setShowDiscordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#5865F2]" aria-hidden="true" />
              Connect Discord
            </DialogTitle>
            <DialogDescription>
              Add a Discord webhook to receive briefings in your server
            </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="webhook" className="micro-label mb-1.5 block">Webhook URL <span className="text-[hsl(var(--primary))]" aria-hidden="true">*</span></Label>
              <Input
                id="webhook"
                value={discordWebhook}
                onChange={(e) => { setDiscordWebhook(e.target.value); setDiscordError(''); }}
                placeholder="https://discord.com/api/webhooks/123456789/..."
                aria-invalid={!!discordError}
                aria-describedby={discordError ? 'discord-error' : 'discord-hint'}
                className={cn(discordError && 'border-red-400/60')}
              />
              {discordError
                ? <p id="discord-error" role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" aria-hidden="true" />{discordError}</p>
                : <p id="discord-hint" className="mt-1 text-xs text-stone-500">Paste the webhook URL from your Discord server settings → Integrations</p>
              }
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-sm text-stone-400">
              <MicroLabel className="mb-2">How to get a webhook</MicroLabel>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Open Discord server settings</li>
                <li>Go to Integrations → Webhooks</li>
                <li>Click "New Webhook" and copy URL</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscordDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConnectDiscord}
              disabled={loading || !discordWebhook}
             
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Connect Discord
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation */}
      <AlertDialog open={!!disconnectConfirm} onOpenChange={() => setDisconnectConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect this integration? Briefings will no longer be delivered to this channel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-none bg-red-500 text-white shadow-none hover:bg-red-600">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}