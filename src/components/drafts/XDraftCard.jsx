import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, Check, SkipForward } from 'lucide-react';
import { toast } from 'sonner';

export default function XDraftCard({ draft, onChange }) {
  const [text, setText] = useState(draft.post_text || '');
  const url = draft.article_url || '';
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
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <div className="border border-stone-800 bg-stone-900 rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-stone-100">{draft.article_title || 'Untitled'}</p>
        <p className="text-xs text-stone-500">{draft.source}{url && <> · <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-stone-300 break-all">{url}</a></>}</p>
      </div>
      <Textarea value={text} onChange={e => setText(e.target.value)} onBlur={saveText} rows={4}
        className="bg-stone-800 border-stone-700 text-stone-100" />
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs mr-auto ${over ? 'text-red-400' : 'text-stone-500'}`}>{count} / 280</span>
        <Button size="sm" variant="outline" onClick={copy}><Copy className="w-4 h-4 mr-1" />Copy</Button>
        <Button size="sm" variant="outline" asChild>
          <a href={intent} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 mr-1" />Open in X</a>
        </Button>
        {draft.status !== 'Posted' && (
          <Button size="sm" onClick={() => setStatus({ status: 'Posted', posted_date: new Date().toISOString() })}
            className="bg-[hsl(var(--primary))] text-stone-900"><Check className="w-4 h-4 mr-1" />Mark Posted</Button>
        )}
        {draft.status !== 'Skipped' && (
          <Button size="sm" variant="ghost" onClick={() => setStatus({ status: 'Skipped' })}><SkipForward className="w-4 h-4 mr-1" />Skip</Button>
        )}
      </div>
    </div>
  );
}