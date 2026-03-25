import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Mail, Trash2, Plus, Loader2, CheckCircle2, XCircle, WifiOff, Wifi, ExternalLink, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

function NewsletterEmailCard({ email, onMarkRead }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border transition-colors ${email.is_read ? 'border-stone-800 bg-stone-900/50' : 'border-stone-700 bg-stone-900'}`}>
      <CardContent className="py-0">
        {/* Header row */}
        <button
          className="w-full text-left py-4 flex items-start gap-3"
          onClick={() => {
            setExpanded(!expanded);
            if (!email.is_read) onMarkRead(email.id);
          }}
        >
          <div className="flex-shrink-0 mt-0.5">
            {!email.is_read
              ? <Circle className="w-2 h-2 text-[hsl(var(--primary))] fill-current" />
              : <div className="w-2 h-2" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${email.is_read ? 'text-stone-400' : 'text-stone-100'}`}>
                {email.subject}
              </span>
              <span className="text-xs text-stone-600 flex-shrink-0">
                {email.received_at ? formatDistanceToNow(new Date(email.received_at), { addSuffix: true }) : ''}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">{email.from_name || email.from_email}</p>
          </div>
          <div className="flex-shrink-0 text-stone-600 mt-0.5">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="pb-4 border-t border-stone-800 pt-4 space-y-4">
            {/* Text preview */}
            {email.text_content && (
              <p className="text-sm text-stone-400 leading-relaxed whitespace-pre-wrap line-clamp-[12]">
                {email.text_content.slice(0, 1500)}
                {email.text_content.length > 1500 ? '…' : ''}
              </p>
            )}

            {/* Extracted links */}
            {email.links?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Links in this email</p>
                <div className="space-y-1.5">
                  {email.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 group text-sm text-stone-300 hover:text-[hsl(var(--primary))] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-stone-600 group-hover:text-[hsl(var(--primary))]" />
                      <span className="line-clamp-1">{link.text || link.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

  const { data: syncStates = [] } = useQuery({
    queryKey: ['gmail-sync-state'],
    queryFn: () => base44.entities.SyncState.filter({ key: 'gmail_newsletters' }),
    enabled: !!user,
    refetchInterval: 10000,
  });
  const syncRecord = syncStates[0] || null;
  const isConnected = syncRecord ? syncRecord.enabled !== false : false;

  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ['email-subscriptions'],
    queryFn: () => base44.entities.EmailSubscription.filter({}, '-created_date', 100),
    enabled: !!user,
  });

  const { data: emails = [], isLoading: loadingEmails } = useQuery({
    queryKey: ['newsletter-emails'],
    queryFn: () => base44.entities.NewsletterEmail.filter({}, '-received_at', 100),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const handleConnect = async () => {
    setTogglingConnection(true);
    try {
      if (!syncRecord) {
        await base44.entities.SyncState.create({ key: 'gmail_newsletters', enabled: true });
      } else {
        await base44.entities.SyncState.update(syncRecord.id, { enabled: true });
      }
      queryClient.invalidateQueries({ queryKey: ['gmail-sync-state'] });
      toast.success('Gmail watcher connected');
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
      toast.success('Gmail watcher paused');
    } catch (e) {
      toast.error(e.message || 'Failed to disconnect');
    } finally {
      setTogglingConnection(false);
    }
  };

  const handleAddSubscription = async () => {
    if (!newFeedName.trim() || !newFeedSenders.trim()) {
      toast.error('Please enter a name and at least one sender email');
      return;
    }
    const senderEmails = newFeedSenders.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!senderEmails.length) { toast.error('Enter valid email addresses'); return; }
    setAddingFeed(true);
    try {
      await base44.entities.EmailSubscription.create({
        name: newFeedName.trim(),
        sender_emails: senderEmails,
        category: newFeedCategory.trim() || 'Newsletter',
        is_active: true,
        email_count: 0,
      });
      toast.success(`"${newFeedName}" added`);
      setNewFeedName(''); setNewFeedSenders(''); setNewFeedCategory('');
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ['email-subscriptions'] });
    } catch (e) {
      toast.error(e.message || 'Failed to add');
    } finally {
      setAddingFeed(false);
    }
  };

  const handleDeleteSubscription = async (sub) => {
    setDeletingId(sub.id);
    try {
      await base44.entities.EmailSubscription.delete(sub.id);
      toast.success(`"${sub.name}" removed`);
      queryClient.invalidateQueries({ queryKey: ['email-subscriptions'] });
    } catch { toast.error('Failed to delete'); }
    finally { setDeletingId(null); }
  };

  const handleMarkRead = async (id) => {
    await base44.entities.NewsletterEmail.update(id, { is_read: true });
    queryClient.invalidateQueries({ queryKey: ['newsletter-emails'] });
  };

  const unreadCount = emails.filter(e => !e.is_read).length;

  if (loadingUser) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
          <Mail className="w-8 h-8 text-[hsl(var(--primary))]" />
          Email Feeds
        </h1>
        <p className="text-stone-500 mt-1">Connect Gmail to watch for newsletters from specific senders.</p>
      </div>

      {/* Gmail Connection */}
      <Card className={`border ${isConnected ? 'border-emerald-700/50 bg-stone-900' : 'border-stone-700 bg-stone-900'}`}>
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isConnected ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-stone-800 border border-stone-700'}`}>
              {isConnected ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-stone-500" />}
            </div>
            <div>
              <p className="font-semibold text-stone-100 text-sm">Gmail Inbox</p>
              <p className="text-xs text-stone-500">
                {isConnected ? 'Watching for incoming newsletters in real-time' : 'Paused — no new emails will be ingested'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={`text-xs border ${isConnected ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800' : 'bg-stone-800 text-stone-500 border-stone-700'}`}>
              {isConnected ? 'Active' : 'Paused'}
            </Badge>
            {isConnected ? (
              <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={togglingConnection}
                className="border-red-800 text-red-400 hover:bg-red-900/30">
                {togglingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4 mr-1" />}
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect} disabled={togglingConnection}
                className="bg-[hsl(var(--primary))] text-stone-900 font-semibold hover:opacity-90">
                {togglingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-stone-100">
            Watched Senders
            <span className="ml-2 text-sm font-normal text-stone-500">({subscriptions.length})</span>
          </h2>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}
            className="bg-[hsl(var(--primary))] text-stone-900 font-semibold hover:opacity-90">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        {showAddForm && (
          <Card className="mb-3 border-[hsl(var(--primary))]/40 bg-stone-900">
            <CardContent className="py-4 space-y-3">
              <div>
                <label className="text-xs text-stone-400 mb-1 block">Newsletter Name</label>
                <Input value={newFeedName} onChange={e => setNewFeedName(e.target.value)}
                  placeholder="e.g. RENX Daily" className="bg-stone-800 border-stone-700 text-stone-100" />
              </div>
              <div>
                <label className="text-xs text-stone-400 mb-1 block">Sender Email(s)</label>
                <Input value={newFeedSenders} onChange={e => setNewFeedSenders(e.target.value)}
                  placeholder="newsletter@renx.ca, news@example.com" className="bg-stone-800 border-stone-700 text-stone-100" />
                <p className="text-xs text-stone-600 mt-1">Separate multiple with commas</p>
              </div>
              <div>
                <label className="text-xs text-stone-400 mb-1 block">Category (optional)</label>
                <Input value={newFeedCategory} onChange={e => setNewFeedCategory(e.target.value)}
                  placeholder="e.g. CRE, Finance" className="bg-stone-800 border-stone-700 text-stone-100" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddSubscription} disabled={addingFeed}
                  className="bg-[hsl(var(--primary))] text-stone-900 font-semibold hover:opacity-90">
                  {addingFeed && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} className="text-stone-400">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingSubs ? (
          <div className="h-10 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-stone-600" /></div>
        ) : subscriptions.length === 0 ? (
          <p className="text-stone-600 text-sm">No senders configured yet. Add one above to start watching.</p>
        ) : (
          <div className="space-y-2">
            {subscriptions.map(sub => (
              <div key={sub.id} className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-md bg-stone-900 border border-stone-800">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-200">{sub.name}</p>
                  <p className="text-xs text-stone-500 truncate">{(sub.sender_emails || []).join(', ')}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {sub.email_count > 0 && (
                    <span className="text-xs text-stone-600">{sub.email_count} received</span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteSubscription(sub)}
                    disabled={deletingId === sub.id} className="text-stone-600 hover:text-red-400 h-7 w-7 p-0">
                    {deletingId === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inbox */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-stone-100">Inbox</h2>
          {unreadCount > 0 && (
            <span className="bg-[hsl(var(--primary))] text-stone-900 text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>

        {loadingEmails ? (
          <div className="flex items-center gap-2 text-stone-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : emails.length === 0 ? (
          <Card className="border-stone-800 bg-stone-900/50">
            <CardContent className="py-10 text-center">
              <Mail className="w-10 h-10 text-stone-700 mx-auto mb-3" />
              <p className="text-stone-500 font-medium">No emails yet</p>
              <p className="text-stone-600 text-sm mt-1">Add a sender above — the next email from them will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {emails.map(email => (
              <NewsletterEmailCard key={email.id} email={email} onMarkRead={handleMarkRead} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}