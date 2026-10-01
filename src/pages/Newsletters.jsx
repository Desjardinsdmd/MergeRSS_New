import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Mail, Copy, Check, Pause, Play, Trash2, RotateCcw, ExternalLink, AlertTriangle,
  Inbox, Loader2, X, MailCheck, Info, ChevronDown, ChevronRight, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function fmtDate(d) {
  if (!d) return 'Never';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'Never';
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function safeHttpUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null;
  } catch {
    return null;
  }
}

async function callInbox(payload) {
  try {
    const res = await base44.functions.invoke('newsletterInbox', payload);
    return res?.data || {};
  } catch (e) {
    const data = e?.response?.data;
    if (data) return { ...data, _failed: true };
    throw e;
  }
}

// Mirrors validateAlias() in base44/functions/newsletterInbox (the server is authoritative).
const RESERVED_ALIASES = new Set([
  'support', 'postmaster', 'abuse', 'admin', 'administrator', 'root', 'hostmaster', 'webmaster',
  'security', 'info', 'hello', 'contact', 'billing', 'noreply', 'no-reply', 'mailer-daemon', 'relay',
  'inbox-test', 'pipeline-test', 'team', 'help', 'sales', 'privacy', 'legal',
]);
function validateAlias(alias) {
  if (!alias) return 'Enter an address.';
  if (alias !== alias.toLowerCase()) return 'Use lowercase letters only.';
  if (alias.length < 3 || alias.length > 30) return 'Use 3 to 30 characters.';
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(alias)) return 'Use letters and numbers, with single dots, hyphens or underscores between them.';
  if (RESERVED_ALIASES.has(alias) || alias.startsWith('newsletter-')) return 'That address is reserved.';
  return null;
}

function ChangeAddress({ address, domain, onSaved }) {
  const current = address ? address.split('@')[0] : '';
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  const alias = value.trim().toLowerCase();
  const localError = alias === current ? null : validateAlias(alias);
  const unchanged = alias === current;
  const error = serverError || (value ? localError : null);

  const start = () => { setValue(current); setServerError(null); setOpen(true); };
  const save = async (e) => {
    e.preventDefault();
    if (unchanged || localError || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await callInbox({ action: 'set_alias', alias });
      if (res?.success === false || res?._failed || res?.error) {
        setServerError(res?.error || 'Could not change your address.');
      } else {
        toast.success(`Your address is now ${res.address || `${alias}@${domain}`}`);
        setOpen(false);
        onSaved?.(res);
      }
    } catch (err) {
      setServerError(err?.message || 'Could not change your address.');
    } finally {
      setSaving(false);
    }
  };

  if (!domain) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400 hover:text-amber-300"
      >
        <Pencil className="w-3 h-3" /> Change address
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-3 rounded-lg border border-stone-800 bg-stone-950/60 p-3">
      <label htmlFor="newsletter-alias" className="block text-xs text-stone-400 mb-1.5">New address</label>
      <div className="flex items-center rounded-lg bg-stone-950 border border-stone-800 focus-within:border-amber-600 overflow-hidden">
        <input
          id="newsletter-alias"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
          value={value}
          onChange={(e) => { setValue(e.target.value.toLowerCase()); setServerError(null); }}
          aria-invalid={!!error}
          aria-describedby="newsletter-alias-help"
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-amber-300 outline-none placeholder:text-stone-600"
          placeholder="yourname.reads"
        />
        <span className="px-3 py-2 text-sm text-stone-500 border-l border-stone-800 flex-shrink-0">@{domain}</span>
      </div>
      <div id="newsletter-alias-help" className="mt-2 space-y-1">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <p className="text-xs text-stone-600">3 to 30 characters: letters, numbers, and single dots, hyphens or underscores.</p>
        )}
        <p className="text-xs text-amber-400/90 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{current ? <>Your current address <span className="text-amber-300">{address}</span> will stop receiving immediately.</> : 'Your previous address will stop receiving immediately.'} Update any newsletter subscriptions and forwarding rules. You can change it up to 3 times a day.</span>
        </p>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button type="submit" size="sm" disabled={saving || unchanged || !!localError}
          className="bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Save address
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}
          className="text-stone-400 hover:text-stone-200 hover:bg-stone-800">
          Cancel
        </Button>
      </div>
    </form>
  );
}

const STATUS_LABEL = {
  active: { text: 'Active', cls: 'bg-emerald-900/40 text-emerald-300' },
  paused: { text: 'Paused', cls: 'bg-stone-800 text-stone-400' },
  over_limit: { text: 'Over plan limit', cls: 'bg-amber-900/40 text-amber-300' },
  removed: { text: 'Removed', cls: 'bg-stone-800 text-stone-500' },
};

function EmailReader({ emailId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['newsletter-email', emailId],
    queryFn: () => callInbox({ action: 'get_email', email_id: emailId }),
    enabled: !!emailId,
  });
  const email = data?.email;
  const srcDoc = useMemo(() => {
    if (!email) return '';
    const body = email.html_content
      ? email.html_content
      : `<pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif">${String(email.text_content || '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:16px;background:#fff;color:#111;font-family:system-ui,sans-serif}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${body}</body></html>`;
  }, [email]);
  const viewUrl = email?.view_url ? safeHttpUrl(email.view_url) : null;

  return (
    <Dialog open={!!emailId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] bg-stone-950 border-stone-800 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-stone-800">
          <DialogTitle className="text-stone-100 text-base leading-snug pr-6">
            {isLoading ? 'Loading...' : (email?.subject || 'Newsletter')}
          </DialogTitle>
          <DialogDescription className="text-stone-500 text-xs">
            {email ? `${email.from_name || email.from_email} · ${fmtDate(email.received_at)}` : data?.error || ''}
          </DialogDescription>
          {viewUrl && (
            <a href={viewUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 mt-1">
              <ExternalLink className="w-3 h-3" /> Open web version
            </a>
          )}
        </DialogHeader>
        <div className="h-[70vh] bg-white">
          {isLoading ? (
            <div className="h-full flex items-center justify-center bg-stone-950">
              <Loader2 className="w-5 h-5 animate-spin text-stone-500" />
            </div>
          ) : email ? (
            <iframe
              title={email.subject || 'Newsletter'}
              srcDoc={srcDoc}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-stone-950 text-stone-500 text-sm">Email not found.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Newsletters() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [readerId, setReaderId] = useState(null);

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('email');
      if (id) setReaderId(id);
    } catch { /* ignore */ }
  }, []);

  const closeReader = () => {
    setReaderId(null);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('email')) {
        url.searchParams.delete('email');
        window.history.replaceState({}, '', url.pathname + (url.search || ''));
      }
    } catch { /* ignore */ }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['newsletter-inbox'],
    queryFn: () => callInbox({ action: 'get_or_create' }),
    staleTime: 30000,
  });

  const act = useMutation({
    mutationFn: (payload) => callInbox(payload),
    onSuccess: (res, payload) => {
      if (res?.success === false || res?._failed) {
        toast.error(res?.error || 'Something went wrong');
      } else if (payload.action === 'pause') {
        toast.success('Sender paused. New issues are kept but won\'t reach your feeds.');
      } else if (payload.action === 'unpause' || payload.action === 'restore') {
        toast.success(res?.backfilled ? `Sender active. Added ${res.backfilled} stored issue${res.backfilled === 1 ? '' : 's'}.` : 'Sender active.');
      } else if (payload.action === 'remove') {
        toast.success('Sender removed. Future emails from it will be ignored.');
      }
      queryClient.invalidateQueries({ queryKey: ['newsletter-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
    onError: (e) => toast.error(e?.message || 'Something went wrong'),
  });

  const address = data?.address || null;
  const configured = data?.configured !== false;
  const senders = data?.senders || [];
  const visible = senders.filter(s => s.status !== 'removed');
  const removed = senders.filter(s => s.status === 'removed');
  const overLimit = visible.filter(s => s.status === 'over_limit');
  const confirmations = data?.confirmations || [];

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Select the address and copy it manually.');
    }
  };

  const busyId = act.isPending ? (act.variables?.subscription_id || act.variables?.email_id) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[hsl(var(--primary))] rounded-xl flex items-center justify-center flex-shrink-0">
          <Mail className="w-5 h-5 text-stone-900" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-stone-100">Newsletters</h1>
          <p className="text-sm text-stone-500">Newsletters sent to your private address show up in your sources, search and briefings.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-stone-600">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
        </div>
      ) : error ? (
        <Card className="border-red-900/50 bg-stone-900">
          <CardContent className="p-4 text-sm text-red-300">Could not load your newsletter inbox. {error.message}</CardContent>
        </Card>
      ) : (
        <>
          {/* Address */}
          {!configured ? (
            <Card className="border-stone-800 bg-stone-900 mb-6">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-stone-200 font-medium">Newsletter inbox isn't set up yet</p>
                    <p className="text-sm text-stone-500 mt-1">
                      Private newsletter addresses are coming soon. Once the inbox is switched on, your address will appear here.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-stone-800 bg-stone-900 mb-6">
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wide text-stone-500 mb-2">Your newsletter address</p>
                {address ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-lg bg-stone-950 border border-stone-800 px-3 py-2 text-sm text-amber-300 select-all">
                      {address}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copy}
                      aria-label={copied ? 'Address copied' : 'Copy newsletter address'}
                      className="flex-shrink-0 border-stone-700 bg-stone-900 hover:bg-stone-800"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-stone-300" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-stone-400">We couldn't create your address right now. Refresh the page to try again.</p>
                )}
                {address && (
                  <ChangeAddress
                    key={address}
                    address={address}
                    domain={data?.domain || address.split('@')[1]}
                    onSaved={(res) => {
                      queryClient.setQueryData(['newsletter-inbox'], (old) => ({ ...(old || {}), ...res }));
                      queryClient.invalidateQueries({ queryKey: ['newsletter-inbox'] });
                    }}
                  />
                )}
                <ul className="mt-4 space-y-1.5 text-sm text-stone-400 list-disc pl-5">
                  <li>Subscribe to newsletters with this address, or</li>
                  <li>set a forwarding rule in Gmail or Outlook that forwards newsletters to it.</li>
                </ul>
                <p className="mt-3 text-xs text-stone-600">
                  Keep this address private: anything sent to it lands in your sources. Confirmation emails (including Gmail/Outlook forwarding checks) appear below so you can approve them.
                </p>
                {data?.route_error && (
                  <p className="mt-3 text-xs text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {data.route_error}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pending confirmations */}
          {confirmations.length > 0 && (
            <section className="mb-6" aria-labelledby="confirmations-heading">
              <h2 id="confirmations-heading" className="text-sm font-semibold text-amber-300 mb-2 flex items-center gap-2">
                <MailCheck className="w-4 h-4" /> Waiting for your confirmation ({confirmations.length})
              </h2>
              <div className="space-y-2">
                {confirmations.map(c => {
                  const link = c.confirm_url ? safeHttpUrl(c.confirm_url) : null;
                  return (
                    <Card key={c.id} className="border-amber-900/60 bg-amber-950/20">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-200 font-medium line-clamp-2">{c.subject}</p>
                            <p className="text-xs text-stone-500 mt-0.5 truncate">{c.from_name || c.from_email} · {fmtDate(c.received_at)}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              {link ? (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => act.mutate({ action: 'dismiss_confirmation', email_id: c.id, done: true })}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-stone-900 text-xs font-semibold px-3 py-1.5"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" /> Open confirmation link
                                </a>
                              ) : (
                                <span className="text-xs text-stone-500">No link found, open the email to confirm.</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setReaderId(c.id)}
                                className="text-xs text-stone-400 hover:text-stone-200 underline-offset-2 hover:underline"
                              >
                                View email
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Dismiss confirmation from ${c.from_name || c.from_email}`}
                            onClick={() => act.mutate({ action: 'dismiss_confirmation', email_id: c.id })}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-200 hover:bg-stone-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Plan limit warning */}
          {overLimit.length > 0 && (
            <Card className="border-amber-900/60 bg-stone-900 mb-4">
              <CardContent className="p-4 text-sm text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {overLimit.length} sender{overLimit.length === 1 ? ' is' : 's are'} over your plan's {data?.limit || 50}-source limit.
                  Their emails are saved but won't appear in your feeds until you remove a source or upgrade to Premium, then resume the sender.
                </span>
              </CardContent>
            </Card>
          )}

          {/* Senders */}
          <section aria-labelledby="senders-heading">
            <div className="flex items-baseline justify-between mb-2">
              <h2 id="senders-heading" className="text-sm font-semibold text-stone-300">Senders</h2>
              {data?.limit && data?.source_count != null && (
                <span className="text-xs text-stone-600">{data.source_count}/{data.limit} sources used</span>
              )}
            </div>
            {visible.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-stone-800 rounded-xl">
                <Inbox className="w-10 h-10 text-stone-700 mx-auto mb-3" />
                <p className="text-stone-400 font-medium">No newsletters yet</p>
                <p className="text-stone-600 text-sm mt-1 px-6">
                  {configured ? 'Each sender that emails your address becomes a source here.' : 'Senders will appear here once your inbox is live.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map(s => {
                  const st = STATUS_LABEL[s.status] || STATUS_LABEL.active;
                  const busy = busyId === s.id;
                  return (
                    <Card key={s.id} className="border-stone-800 bg-stone-900">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-stone-200 truncate max-w-full">{s.name}</p>
                              <Badge className={`text-[10px] border-0 ${st.cls}`}>{st.text}</Badge>
                            </div>
                            <p className="text-xs text-stone-500 truncate mt-0.5">{s.from_email}</p>
                            <p className="text-xs text-stone-600 mt-1">
                              Last received {fmtDate(s.last_email_date)} · {s.email_count} email{s.email_count === 1 ? '' : 's'}
                              {s.item_count != null ? ` · ${s.item_count} item${s.item_count === 1 ? '' : 's'}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin text-stone-500 m-1.5" />
                            ) : s.status === 'active' ? (
                              <button
                                type="button"
                                aria-label={`Pause ${s.name}`}
                                title="Pause"
                                onClick={() => act.mutate({ action: 'pause', subscription_id: s.id })}
                                className="p-2 rounded-lg text-stone-500 hover:text-amber-400 hover:bg-stone-800"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Resume ${s.name}`}
                                title="Resume"
                                onClick={() => act.mutate({ action: 'unpause', subscription_id: s.id })}
                                className="p-2 rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-stone-800"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Remove ${s.name}`}
                              title="Remove"
                              disabled={busy}
                              onClick={() => setConfirmRemove(s)}
                              className="p-2 rounded-lg text-stone-500 hover:text-red-400 hover:bg-stone-800 disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {removed.length > 0 && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowRemoved(v => !v)}
                  aria-expanded={showRemoved}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300"
                >
                  {showRemoved ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  Removed senders ({removed.length})
                </button>
                {showRemoved && (
                  <div className="mt-2 space-y-1">
                    {removed.map(s => (
                      <div key={s.id} className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900/60 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-400 truncate">{s.name}</p>
                          <p className="text-xs text-stone-600 truncate">{s.from_email}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Restore ${s.name}`}
                          title="Restore"
                          disabled={busyId === s.id}
                          onClick={() => act.mutate({ action: 'restore', subscription_id: s.id })}
                          className="p-2 rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-stone-800 disabled:opacity-40"
                        >
                          {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent className="bg-stone-950 border-stone-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-100">Remove {confirmRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This deletes the source and its items from your feeds. Future emails from {confirmRemove?.from_email} will be ignored.
              To stop them entirely, unsubscribe from the newsletter itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => { if (confirmRemove) act.mutate({ action: 'remove', subscription_id: confirmRemove.id }); setConfirmRemove(null); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmailReader emailId={readerId} onClose={closeReader} />
    </div>
  );
}
