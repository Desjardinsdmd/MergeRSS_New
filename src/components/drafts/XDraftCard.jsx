import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Copy, ExternalLink, Check, SkipForward, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function XDraftCard({ draft, onChange }) {
  const [text, setText] = useState(draft.post_text || '');
  const [linkInput, setLinkInput] = useState('');
  const url = (draft.article_url || '').trim();
  const count = text.length + (url ? (text ? 1 : 0) + 23 : 0);
  const over = count > 280;

  const saveText = async () => {
    if (text !== draft.post_text) await base44.entities.XDraft.update(draft.id, { post_text: text });
  };
  const setStatus = async (data) => {
    await base44.entities.XDraft.update(draft.id, { post_text: text, ...data });
    onChange();
  };
  const copy = async () => {
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    toast.success('Copied');
  };
  const saveLink = async () => {
    const link = linkInput.trim();
    if (!/^https?:\/\//i.test(link)) { toast.error('Enter a full http(s) link'); return; }
    await base44.entities.XDraft.update(draft.id, { post_text: text, article_url: link });
    setLinkInput('');
    toast.success('Link added');
    onChange();
  };
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}${url ? `&url=${encodeURIComponent(url)}` : ''}`;

  return (
    <div className="panel space-y-3 p-5">
      <div>
        <p className="font-display text-[15px] font-semibold text-stone-100">{draft.article_title || 'Untitled'}</p>
        <p className="meta mt-1 normal-case">
          {draft.source}
          {url && <> · <a href={url} target="_blank" rel="noopener noreferrer" className="break-all hover:text-stone-300">{url}</a></>}
        </p>
      </div>
      {!url && (
        <div className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
          <p className="flex items-center gap-1.5 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4" />No story link. Add one before posting.
          </p>
          <div className="flex gap-2">
            <Input value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://publisher.com/story"
              className="rounded-xl border-white/10 bg-stone-800 text-sm text-stone-100" />
            <button type="button" className="btn-ghost disabled:opacity-50" onClick={saveLink} disabled={!linkInput.trim()}>Add link</button>
          </div>
        </div>
      )}
      <div className="panel-raised p-1">
        <Textarea value={text} onChange={e => setText(e.target.value)} onBlur={saveText} rows={4}
          className="rounded-lg border-0 bg-transparent text-[15px] text-stone-100 shadow-none focus-visible:ring-1" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`mr-auto font-mono text-xs ${over ? 'text-red-400' : 'text-stone-500'}`}>{count} / 280</span>
        <button type="button" className="btn-ghost" onClick={copy}><Copy className="h-4 w-4" />Copy</button>
        <a href={intent} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-100 px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white">
          <ExternalLink className="h-4 w-4" />Open in X
        </a>
        {draft.status !== 'Posted' && (
          <button type="button" className="btn-soft" onClick={() => setStatus({ status: 'Posted', posted_date: new Date().toISOString() })}>
            <Check className="h-4 w-4" />Mark posted
          </button>
        )}
        {draft.status !== 'Skipped' && (
          <button type="button" className="btn-ghost border-transparent" onClick={() => setStatus({ status: 'Skipped' })}>
            <SkipForward className="h-4 w-4" />Skip
          </button>
        )}
      </div>
    </div>
  );
}
