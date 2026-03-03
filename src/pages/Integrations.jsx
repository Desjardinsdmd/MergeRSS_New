import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Slack,
  MessageCircle,
  Check,
  X,
  Plus,
  ExternalLink,
  Loader2,
  Crown,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export default function Integrations() {
  const [user, setUser] = useState(null);
  const [showSlackDialog, setShowSlackDialog] = useState(false);
  const [showDiscordDialog, setShowDiscordDialog] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
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
  const isPremium = user?.plan === 'premium';
  
  const checkIntegrationLimit = () => {
    if (!isPremium) {
      toast.error('Integrations are premium only. Upgrade to connect Slack, Discord, and Email.');
      return false;
    }
    return true;
  };

  const handleConnectSlack = async () => {
    if (!isPremium || !slackWebhook) return;
    if (!slackWebhook.includes('hooks.slack.com')) {
      toast.error('Invalid Slack webhook URL');
      return;
    }
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
    setLoading(true);

    try {
      // Validate webhook URL format
      if (!discordWebhook.includes('api/webhooks/')) {
        toast.error('Invalid Discord webhook URL');
        setLoading(false);
        return;
      }

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

  const handleSendTestMessage = async (type) => {
    setLoading(true);
    if (type === 'Discord' && discordIntegration?.webhook_url) {
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
      {/* Header */}
       <div className="mb-8">
         <h1 className="text-2xl font-bold text-stone-100">Integrations</h1>
         <p className="text-stone-500">
           Connect your favorite apps to deliver digests
         </p>
       </div>

      {/* Premium Notice */}
      {!isPremium && (
        <div className="mb-6 p-4 rounded-xl bg-amber-900/20 border border-amber-700 flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-stone-900" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-stone-200">Upgrade to Premium</p>
            <p className="text-sm text-stone-500">Unlock Slack and Discord integrations</p>
          </div>
          <Link to={createPageUrl('Pricing')}>
            <Button className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold rounded-lg text-sm">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Integration Cards */}
      <div className="space-y-4">
        {/* Slack */}
        <Card className="border-stone-800 bg-stone-900">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#4A154B] rounded-xl flex items-center justify-center">
                <Slack className="w-6 h-6 text-white" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-stone-200">Slack</h3>
                    {!isPremium && (
                      <Badge variant="secondary" className="text-xs gap-1 bg-stone-800 text-amber-400">
                        <Crown className="w-3 h-3" /> Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-stone-400 mb-4">
                  Post digests directly to your Slack channels
                </p>

                {slackIntegration?.status === 'connected' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-900/30 text-green-400">
                        <Check className="w-3 h-3 mr-1" /> Connected
                      </Badge>
                      <span className="text-sm text-stone-500">Webhook configured</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendTestMessage('Slack')}
                        disabled={loading}
                      >
                        Send Test
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectConfirm(slackIntegration)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowSlackDialog(true)}
                    disabled={!isPremium}
                    className={cn(
                      isPremium ? "bg-[#4A154B] hover:bg-[#3e1140]" : ""
                    )}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Connect Slack
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Discord */}
        <Card className="border-stone-800 bg-stone-900">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#5865F2] rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-stone-200">Discord</h3>
                    {!isPremium && (
                      <Badge variant="secondary" className="text-xs gap-1 bg-stone-800 text-amber-400">
                        <Crown className="w-3 h-3" /> Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-stone-400 mb-4">
                  Send digests to your Discord server via webhook
                </p>

                {discordIntegration?.status === 'connected' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-900/30 text-green-400">
                        <Check className="w-3 h-3 mr-1" /> Connected
                      </Badge>
                      <span className="text-sm text-stone-500">
                        Webhook configured
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendTestMessage('Discord')}
                        disabled={loading}
                      >
                        Send Test
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectConfirm(discordIntegration)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowDiscordDialog(true)}
                    disabled={!isPremium}
                    className={cn(
                      isPremium ? "bg-[#5865F2] hover:bg-[#4752c4]" : ""
                    )}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Connect Discord
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Slack Dialog */}
      <Dialog open={showSlackDialog} onOpenChange={setShowSlackDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Slack className="w-5 h-5 text-[#4A154B]" />
              Connect Slack
            </DialogTitle>
            <DialogDescription>
              Connect your Slack workspace to receive digests in your channels
            </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="slackWebhook" className="text-stone-300">Incoming Webhook URL</Label>
              <Input
                id="slackWebhook"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="mt-1 bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-600"
              />
            </div>
            <div className="bg-stone-800 rounded-lg p-4 text-sm text-stone-400">
              <p className="font-medium text-stone-300 mb-2">How to get a webhook:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-amber-400 underline">api.slack.com/apps</a></li>
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
              className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
              <MessageCircle className="w-5 h-5 text-[#5865F2]" />
              Connect Discord
            </DialogTitle>
            <DialogDescription>
              Add a Discord webhook to receive digests in your server
            </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="webhook" className="text-stone-300">Webhook URL</Label>
              <Input
                id="webhook"
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-600"
              />
            </div>

            <div className="bg-stone-800 rounded-lg p-4 text-sm text-stone-400">
              <p className="font-medium text-stone-300 mb-2">How to get a webhook:</p>
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
              className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect Discord
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation */}
      <AlertDialog open={!!disconnectConfirm} onOpenChange={() => setDisconnectConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect this integration? Digests will no longer be delivered to this channel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-red-600 hover:bg-red-700">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}