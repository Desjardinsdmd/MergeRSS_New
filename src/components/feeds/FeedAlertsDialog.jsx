import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slack, MessageCircle, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function FeedAlertsDialog({ feed, open, onOpenChange }) {
  const [channelType, setChannelType] = useState('slack');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [urlError, setUrlError] = useState('');
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['feedAlerts', feed?.id],
    queryFn: () => base44.entities.FeedAlert.filter({ feed_id: feed.id }),
    enabled: !!feed?.id && open,
  });

  const validateUrl = (url, type) => {
    if (type === 'slack' && !url.includes('hooks.slack.com')) {
      return 'Must be a valid Slack webhook URL (hooks.slack.com/…)';
    }
    if (type === 'discord' && !url.includes('discord.com/api/webhooks')) {
      return 'Must be a valid Discord webhook URL';
    }
    return '';
  };

  const handleAdd = async () => {
    const err = validateUrl(webhookUrl, channelType);
    if (err) { setUrlError(err); return; }
    setUrlError('');
    setAdding(true);
    await base44.entities.FeedAlert.create({
      feed_id: feed.id,
      channel_type: channelType,
      webhook_url: webhookUrl,
      label: label || undefined,
      is_active: true,
    });
    queryClient.invalidateQueries({ queryKey: ['feedAlerts', feed.id] });
    setWebhookUrl('');
    setLabel('');
    setAdding(false);
    toast.success('Alert added — new articles will be posted automatically');
  };

  const handleDelete = async (alertId) => {
    await base44.entities.FeedAlert.delete(alertId);
    queryClient.invalidateQueries({ queryKey: ['feedAlerts', feed.id] });
    toast.success('Alert removed');
  };

  const handleToggle = async (alert) => {
    await base44.entities.FeedAlert.update(alert.id, { is_active: !alert.is_active });
    queryClient.invalidateQueries({ queryKey: ['feedAlerts', feed.id] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0d0a06] border-stone-800">
        <DialogHeader>
          <DialogTitle className="text-stone-100">Feed Alerts — {feed?.name}</DialogTitle>
          <DialogDescription className="text-stone-500">
            Post new articles from this feed directly to Slack or Discord.
          </DialogDescription>
        </DialogHeader>

        {/* Existing alerts */}
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
        ) : alerts.length > 0 ? (
          <div className="space-y-2 mb-2">
            {alerts.map(alert => (
              <div key={alert.id} className="flex items-center gap-3 p-3 border border-stone-800 rounded-lg bg-stone-900">
                {alert.channel_type === 'slack'
                  ? <Slack className="w-4 h-4 text-[#E01E5A] flex-shrink-0" />
                  : <MessageCircle className="w-4 h-4 text-[#5865F2] flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-300 truncate">
                    {alert.label || alert.channel_type.charAt(0).toUpperCase() + alert.channel_type.slice(1)}
                  </p>
                  <p className="text-xs text-stone-600 truncate">{alert.webhook_url}</p>
                </div>
                <Switch checked={alert.is_active !== false} onCheckedChange={() => handleToggle(alert)} />
                <Button variant="ghost" size="icon" onClick={() => handleDelete(alert.id)} className="text-red-500 hover:text-red-400 h-7 w-7 flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-600 text-center py-2">No alerts configured yet.</p>
        )}

        {/* Add new */}
        <div className="border border-stone-800 rounded-lg p-4 space-y-3 bg-stone-900/50">
          <p className="text-sm font-semibold text-stone-300">Add new alert</p>
          <div className="flex gap-2">
            <Select value={channelType} onValueChange={setChannelType}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">
                  <span className="flex items-center gap-2"><Slack className="w-3.5 h-3.5" /> Slack</span>
                </SelectItem>
                <SelectItem value="discord">
                  <span className="flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5" /> Discord</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="flex-1"
            />
          </div>
          <div>
            <Input
              value={webhookUrl}
              onChange={(e) => { setWebhookUrl(e.target.value); setUrlError(''); }}
              placeholder={channelType === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://discord.com/api/webhooks/…'}
              className={cn(urlError && 'border-red-500')}
            />
            {urlError && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {urlError}
              </p>
            )}
          </div>
          <Button
            onClick={handleAdd}
            disabled={!webhookUrl || adding}
            className="w-full bg-amber-400 hover:bg-amber-300 text-stone-900 font-bold"
          >
            {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Alert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}