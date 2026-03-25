import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Mail, Trash2, Plus, Loader2, CheckCircle2, XCircle, Rss, WifiOff, Wifi } from 'lucide-react';
import { toast } from 'sonner';

export default function EmailFeeds() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [togglingConnection, setTogglingConnection] = useState(false);
  const [addingFeed, setAddingFeed] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedSenders, setNewFeedSenders] = useState('');
  const [newFeedCategory, setNewFeedCategory] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).finally(() => setLoadingUser(false));
  }, []);

  // SyncState record controls whether Gmail watcher is enabled
  const { data: syncStates = [] } = useQuery({
    queryKey: ['gmail-sync-state'],
    queryFn: () => base44.entities.SyncState.filter({ key: 'gmail_newsletters' }),
    enabled: !!user,
    refetchInterval: 10000,
  });
  const syncRecord = syncStates[0] || null;
  const isConnected = syncRecord ? syncRecord.enabled !== false : false;
  const hasEverConnected = !!syncRecord;

  const { data: emailFeeds = [], isLoading } = useQuery({
    queryKey: ['gmail-email-feeds'],
    queryFn: () => base44.entities.Feed.filter({ source_type: 'email' }, '-created_date', 100),
    enabled: !!user,
  });

  const handleConnect = async () => {
    setTogglingConnection(true);
    try {
      if (!hasEverConnected) {
        // SyncState will be created on first Gmail event — just show instructions
        toast.success('Gmail watcher is active! Add newsletter feeds below and they\'ll be ingested automatically.');
        // Create a placeholder SyncState so we can track enabled state
        await base44.entities.SyncState.create({ key: 'gmail_newsletters', enabled: true });
        queryClient.invalidateQueries({ queryKey: ['gmail-sync-state'] });
      } else {
        await base44.entities.SyncState.update(syncRecord.id, { enabled: true });
        queryClient.invalidateQueries({ queryKey: ['gmail-sync-state'] });
        toast.success('Gmail watcher reconnected');
      }
    } catch (e) {
      toast.error(e.message || 'Failed to connect');
    } finally {
      setTogglingConnection(false);
    }
  };

  const handleDisconnect = async () => {
    if (!syncRecord) return;
    setTogglingConnection(true);
    try {
      await base44.entities.SyncState.update(syncRecord.id, { enabled: false });
      queryClient.invalidateQueries({ queryKey: ['gmail-sync-state'] });
      toast.success('Gmail watcher paused — no new emails will be ingested');
    } catch (e) {
      toast.error(e.message || 'Failed to disconnect');
    } finally {
      setTogglingConnection(false);
    }
  };

  const handleAddFeed = async () => {
    if (!newFeedName.trim() || !newFeedSenders.trim()) {
      toast.error('Please enter a name and at least one sender email');
      return;
    }
    const senderEmails = newFeedSenders.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (senderEmails.length === 0) {
      toast.error('Please enter valid sender email addresses');
      return;
    }
    setAddingFeed(true);
    try {
      await base44.entities.Feed.create({
        name: newFeedName.trim(),
        url: `email://${newFeedName.trim().toLowerCase().replace(/\s+/g, '-')}`,
        source_type: 'email',
        category: newFeedCategory.trim() || 'Newsletter',
        status: 'active',
        metadata_json: JSON.stringify({ sender_emails: senderEmails }),
        tags: ['Newsletter', 'Email'],
      });
      toast.success(`"${newFeedName}" added`);
      setNewFeedName('');
      setNewFeedSenders('');
      setNewFeedCategory('');
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ['gmail-email-feeds'] });
    } catch (e) {
      toast.error(e.message || 'Failed to add feed');
    } finally {
      setAddingFeed(false);
    }
  };

  const handleDelete = async (feed) => {
    setDeletingId(feed.id);
    try {
      await base44.entities.Feed.delete(feed.id);
      toast.success(`"${feed.name}" removed`);
      queryClient.invalidateQueries({ queryKey: ['gmail-email-feeds'] });
    } catch (e) {
      toast.error('Failed to delete feed');
    } finally {
      setDeletingId(null);
    }
  };

  if (loadingUser || isLoading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
          <Mail className="w-8 h-8 text-[hsl(var(--primary))]" />
          Email Feeds
        </h1>
        <p className="text-stone-500 mt-2">
          Connect your Gmail to automatically ingest newsletter emails as feed items.
        </p>
      </div>

      {/* Gmail Connection Card */}
      <Card className={`mb-6 border ${isConnected ? 'border-emerald-700/50 bg-stone-900' : 'border-stone-700 bg-stone-900'}`}>
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isConnected ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-stone-800 border border-stone-700'}`}>
              {isConnected
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                : <XCircle className="w-5 h-5 text-stone-500" />
              }
            </div>
            <div>
              <p className="font-semibold text-stone-100 text-sm">Gmail Inbox</p>
              <p className="text-xs text-stone-500">
                {isConnected
                  ? 'Watching your inbox in real-time for newsletter emails'
                  : 'Paused — new emails will not be ingested'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={`text-xs border ${isConnected ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800' : 'bg-stone-800 text-stone-500 border-stone-700'}`}>
              {isConnected ? 'Active' : 'Paused'}
            </Badge>
            {isConnected ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisconnect}
                disabled={togglingConnection}
                className="border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300"
              >
                {togglingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4 mr-1" />}
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={togglingConnection}
                className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
              >
                {togglingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Feeds List */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-100">
          Newsletter Feeds
          <span className="ml-2 text-sm font-normal text-stone-500">({emailFeeds.length})</span>
        </h2>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Newsletter Feed
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <Card className="mb-4 border-[hsl(var(--primary))]/40 bg-stone-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Add Newsletter Feed</CardTitle>
            <CardDescription className="text-xs">
              Enter the newsletter name and sender email address(es). When a matching email arrives in Gmail, it'll be ingested automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Feed Name</label>
              <Input
                value={newFeedName}
                onChange={e => setNewFeedName(e.target.value)}
                placeholder="e.g. RENX Newsletter"
                className="bg-stone-800 border-stone-700 text-stone-100"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Sender Email(s)</label>
              <Input
                value={newFeedSenders}
                onChange={e => setNewFeedSenders(e.target.value)}
                placeholder="newsletter@renx.ca, news@example.com"
                className="bg-stone-800 border-stone-700 text-stone-100"
              />
              <p className="text-xs text-stone-600 mt-1">Separate multiple addresses with commas</p>
            </div>
            <div>
              <label className="text-xs text-stone-400 mb-1 block">Category (optional)</label>
              <Input
                value={newFeedCategory}
                onChange={e => setNewFeedCategory(e.target.value)}
                placeholder="e.g. CRE, Finance, Tech"
                className="bg-stone-800 border-stone-700 text-stone-100"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleAddFeed}
                disabled={addingFeed}
                className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold"
                size="sm"
              >
                {addingFeed && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Add Feed
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="text-stone-400">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feeds List */}
      {emailFeeds.length === 0 ? (
        <Card className="border-stone-800 bg-stone-900">
          <CardContent className="py-12 text-center">
            <Rss className="w-10 h-10 text-stone-700 mx-auto mb-3" />
            <p className="text-stone-400 font-medium">No newsletter feeds yet</p>
            <p className="text-stone-600 text-sm mt-1">Click "Add Newsletter Feed" above to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {emailFeeds.map(feed => {
            let meta = {};
            try { meta = JSON.parse(feed.metadata_json || '{}'); } catch {}
            const senderEmails = meta.sender_emails || [];
            return (
              <Card key={feed.id} className="border-stone-800 bg-stone-900 hover:border-stone-700 transition-colors">
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded bg-stone-800 border border-stone-700 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-[hsl(var(--primary))]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-stone-100 text-sm">{feed.name}</p>
                        <Badge variant="outline" className="text-xs border-stone-700 text-stone-400">
                          {feed.category || 'Newsletter'}
                        </Badge>
                      </div>
                      {senderEmails.length > 0 ? (
                        <p className="text-xs text-stone-500 mt-0.5 truncate">
                          Watching: {senderEmails.join(', ')}
                        </p>
                      ) : (
                        <p className="text-xs text-stone-600 mt-0.5 italic">No sender emails configured</p>
                      )}
                      <p className="text-xs text-stone-600 mt-0.5">
                        {feed.item_count ? `${feed.item_count} items ingested` : 'No items yet'}
                        {feed.last_successful_fetch_at && ` · Last: ${new Date(feed.last_successful_fetch_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(feed)}
                    disabled={deletingId === feed.id}
                    className="text-stone-500 hover:text-red-400 flex-shrink-0"
                  >
                    {deletingId === feed.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <Card className="mt-8 border-stone-800 bg-stone-900/50">
        <CardContent className="py-5">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">How it works</p>
          <ol className="space-y-2 text-sm text-stone-500">
            <li className="flex gap-2"><span className="text-[hsl(var(--primary))] font-bold">1.</span> Connect Gmail above to start watching your inbox in real-time</li>
            <li className="flex gap-2"><span className="text-[hsl(var(--primary))] font-bold">2.</span> Add a newsletter feed with the sender's email address</li>
            <li className="flex gap-2"><span className="text-[hsl(var(--primary))] font-bold">3.</span> When a matching email arrives, its content is extracted and added as a feed item</li>
            <li className="flex gap-2"><span className="text-[hsl(var(--primary))] font-bold">4.</span> Articles appear in your Feeds and can be included in any Digest</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}