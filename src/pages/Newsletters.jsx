import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Copy, Check, Pause, Play, Trash2, RotateCcw, ExternalLink, AlertTriangle,
  Inbox, Loader2, X, MailCheck, Info, ChevronDown, ChevronRight, Pencil,
} from 'lucide-react';
import { PageHeader, MicroLabel } from '@/components/brand/Brand';
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
        className="mt-3 inline-flex items-center gap-1 rounded-md text-xs font-medium text-[#C4A5FD] hover:text-white"
      >
        <Pencil className="w-3 h-3" aria-hidden="true" /> Change address
      </button>
    );
  }

  return (
    <form onSubmit={save} className="panel-raised mt-3 p-3">
      <label htmlFor="newsletter-alias" className="micro-label mb-1.5">New address</label>
      <div className="flex items-center rounded-xl bg-stone-950/70 border border-white/[0.08] focus-within:border-[hsl(var(--primary))] overflow-hidden">
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
          className="flex-1 min-w-0 bg-transparent px-3 py-2 font-mono text-sm text-stone-100 outline-none placeholder:text-stone-600"
          placeholder="yourname.reads"
        />
        <span className="px-3 py-2 font-mono text-sm text-stone-500 border-l border-white/[0.08] flex-shrink-0">@{domain}</span>
      </div>
      <div id="newsletter-alias-help" className="mt-2 space-y-1">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <p className="text-xs text-stone-500">3 to 30 characters: letters, numbers, and single dots, hyphens or underscores.</p>
        )}
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{current ? <>Your current address <span className="font-mono">{address}</span> will stop receiving immediately.</> : 'Your previous address will stop receiving immediately.'} Update any newsletter subscriptions and forwarding rules. You can change it up to 3 times a day.</span>
        </p>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button type="submit" disabled={saving || unchanged || !!localError}
          className="btn-soft disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save address
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving}
          className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

const STATUS_LABEL = {
  active: { text: 'Active', cls: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
  paused: { text: 'Paused', cls: 'border-amber-400/25 bg-amber-400/10 text-amber-400' },
  over_limit: { text: 'Over plan limit', cls: 'border-amber-400/25 bg-amber-400/10 text-amber-400' },
  removed: { text: 'Removed', cls: 'border-white/10 text-stone-500' },
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
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] bg-stone-950 border-white/[0.08] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="font-display text-stone-100 text-base leading-snug pr-6">
            {isLoading ? 'Loading...' : (email?.subject || 'Newsletter')}
          </DialogTitle>
          <DialogDescription className="font-mono text-stone-500 text-[11px]">
            {email ? `${email.from_name || email.from_email} · ${fmtDate(email.received_at)}` : data?.error || ''}
          </DialogDescription>
          {viewUrl && (
            <a href={viewUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#C4A5FD] hover:text-white mt-1">
              <ExternalLink className="w-3 h-3" aria-hidden="true" /> Open web version
            </a>
          )}
        </DialogHeader>
        {/* Newsletters are designed for white: the preview stays light inside a rounded frame. */}
        <div className="mx-4 mb-4 h-[70vh] overflow-hidden rounded-2xl border border-white/[0.08] bg-white">
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
        toast.success('Sender paused. New issues are kept but won\'t reach your sources.');
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
      <PageHeader
        title="Newsletters"
        subtitle="Send newsletters to your private address and each sender becomes a source. Their stories show up in search and in your briefings."
      />

      {isLoading ? (
        <div className="text-center py-16 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[hsl(var(--primary))]" /> Loading...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-300" role="alert">
          Could not load your newsletter inbox. {error.message}
        </div>
      ) : (
        <>
          {/* Address */}
          {!configured ? (
            <div className="panel mb-6">
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-stone-100 font-medium">Newsletter inbox isn't set up yet</p>
                    <p className="text-sm text-stone-500 mt-1">
                      Private newsletter addresses are coming soon. Once the inbox is switched on, your address will appear here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel-accent mb-6">
              <div className="p-5">
                <MicroLabel className="mb-2 text-[#C4A5FD]">Your newsletter inbox</MicroLabel>
                {address ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-xl bg-stone-950/70 border border-white/[0.08] px-3 py-2 font-mono text-sm text-stone-100 select-all">
                      {address}
                    </code>
                    <button
                      type="button"
                      onClick={copy}
                      aria-label={copied ? 'Address copied' : 'Copy newsletter address'}
                      className="btn-soft flex-shrink-0 py-2"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                    </button>
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
                <ul className="mt-4 space-y-1.5 text-sm text-stone-300 list-disc pl-5 marker:text-[hsl(var(--primary))]">
                  <li>Subscribe to newsletters with this address, or</li>
                  <li>set a forwarding rule in Gmail or Outlook that forwards newsletters to it.</li>
                </ul>
                <p className="mt-3 text-xs text-stone-400">
                  Keep this address private: anything sent to it lands in your sources. Confirmation emails (including Gmail/Outlook forwarding checks) appear below so you can approve them.
                </p>
                {data?.route_error && (
                  <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-400 flex items-start gap-1.5" role="status">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" /> {data.route_error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pending confirmations */}
          {confirmations.length > 0 && (
            <section className="mb-6" aria-labelledby="confirmations-heading">
              <h2 id="confirmations-heading" className="micro-label text-amber-400 mb-2 flex items-center gap-2">
                <MailCheck className="w-3.5 h-3.5" aria-hidden="true" /> Waiting for your confirmation ({confirmations.length})
              </h2>
              <div className="space-y-2">
                {confirmations.map(c => {
                  const link = c.confirm_url ? safeHttpUrl(c.confirm_url) : null;
                  return (
                    <div key={c.id} className="rounded-xl border border-amber-400/25 bg-amber-400/10">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-100 font-medium line-clamp-2">{c.subject}</p>
                            <p className="font-mono text-[11px] text-stone-400 mt-0.5 truncate">{c.from_name || c.from_email} · {fmtDate(c.received_at)}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              {link ? (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => act.mutate({ action: 'dismiss_confirmation', email_id: c.id, done: true })}
                                  className="btn-soft text-xs"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open confirmation link
                                </a>
                              ) : (
                                <span className="text-xs text-stone-400">No link found, open the email to confirm.</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setReaderId(c.id)}
                                className="text-xs font-medium text-[#C4A5FD] hover:text-white underline-offset-2 hover:underline"
                              >
                                View email
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Dismiss confirmation from ${c.from_name || c.from_email}`}
                            onClick={() => act.mutate({ action: 'dismiss_confirmation', email_id: c.id })}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-white/[0.06]"
                          >
                            <X className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Plan limit warning */}
          {overLimit.length > 0 && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 mb-4" role="status">
              <div className="p-4 text-sm text-amber-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>
                  {overLimit.length} sender{overLimit.length === 1 ? ' is' : 's are'} over your plan's {data?.limit || 50}-source limit.
                  Their emails are saved but won't appear in your sources until you remove a source or upgrade to Premium, then resume the sender.
                </span>
              </div>
            </div>
          )}

          {/* Senders */}
          <section aria-labelledby="senders-heading">
            <div className="flex items-baseline justify-between mb-2">
              <h2 id="senders-heading" className="micro-label">Senders</h2>
              {data?.limit && data?.source_count != null && (
                <span className="meta">{data.source_count}/{data.limit} sources used</span>
              )}
            </div>
            {visible.length === 0 ? (
              <div className="panel text-center py-12">
                <Inbox className="w-10 h-10 text-stone-600 mx-auto mb-3" aria-hidden="true" />
                <p className="text-stone-200 font-medium">No newsletters yet</p>
                <p className="text-stone-500 text-sm mt-1 px-6">
                  {configured ? 'Each sender that emails your address becomes a source here.' : 'Senders will appear here once your inbox is live.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map(s => {
                  const st = STATUS_LABEL[s.status] || STATUS_LABEL.active;
                  const busy = busyId === s.id;
                  return (
                    <div key={s.id} className="panel panel-hover">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-stone-100 truncate max-w-full">{s.name}</p>
                              <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${st.cls}`}>{st.text}</span>
                            </div>
                            <p className="font-mono text-xs text-stone-400 truncate mt-0.5">{s.from_email}</p>
                            <p className="meta mt-1.5 normal-case tracking-normal">
                              Last received {fmtDate(s.last_email_date)} · {s.email_count} email{s.email_count === 1 ? '' : 's'}
                              {s.item_count != null ? ` · ${s.item_count} stor${s.item_count === 1 ? 'y' : 'ies'}` : ''}
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
                                className="p-2 rounded-lg text-stone-500 hover:text-stone-100 hover:bg-white/[0.06]"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Resume ${s.name}`}
                                title="Resume"
                                onClick={() => act.mutate({ action: 'unpause', subscription_id: s.id })}
                                className="p-2 rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-white/[0.06]"
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
                              className="p-2 rounded-lg text-stone-500 hover:text-red-400 hover:bg-white/[0.06] disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
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
                  className="flex items-center gap-1 rounded-md text-xs font-medium text-stone-500 hover:text-stone-300"
                >
                  {showRemoved ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  Removed senders ({removed.length})
                </button>
                {showRemoved && (
                  <div className="mt-2 space-y-1">
                    {removed.map(s => (
                      <div key={s.id} className="panel-raised flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-400 truncate">{s.name}</p>
                          <p className="font-mono text-xs text-stone-600 truncate">{s.from_email}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Restore ${s.name}`}
                          title="Restore"
                          disabled={busyId === s.id}
                          onClick={() => act.mutate({ action: 'restore', subscription_id: s.id })}
                          className="p-2 rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-white/[0.06] disabled:opacity-40"
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
        <AlertDialogContent className="bg-stone-950 border-white/[0.08] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-100">Remove {confirmRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This deletes the source and its stories. Future emails from {confirmRemove?.from_email} will be ignored.
              To stop them entirely, unsubscribe from the newsletter itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10 bg-transparent text-stone-300 hover:bg-white/[0.05]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-500 text-white"
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
