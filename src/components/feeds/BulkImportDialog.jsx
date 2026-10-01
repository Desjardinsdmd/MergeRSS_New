import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Upload, FileText, Link, Rss, LayoutList, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PLAN_LIMITS } from '@/lib/planLimits';

const MODES = [
  {
    id: 'feeds',
    icon: Rss,
    label: 'Individual sources',
    description: 'Add each URL as a separate source you can manage independently.',
  },
  {
    id: 'digest',
    icon: LayoutList,
    label: 'One briefing',
    description: 'Bundle all sources into one briefing delivered on a schedule.',
  },
];

export default function BulkImportDialog({ open, onOpenChange, onSuccess, currentFeedCount = 0, isPremium = false }) {
  const [format, setFormat] = useState('opml'); // 'opml' | 'urls'
  const [mode, setMode] = useState('feeds');
  const [opmlContent, setOpmlContent] = useState('');
  const [urlText, setUrlText] = useState('');
  const [digestName, setDigestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const reset = () => {
    setFormat('opml');
    setMode('feeds');
    setOpmlContent('');
    setUrlText('');
    setDigestName('');
    setResult(null);
    setLoading(false);
  };

  const handleClose = (open) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setOpmlContent(ev.target.result);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const content = format === 'opml' ? opmlContent : urlText;
    if (!content.trim()) {
      toast.error('Please provide some content to import.');
      return;
    }
    if (mode === 'digest' && !digestName.trim()) {
      toast.error('Please enter a name for the briefing.');
      return;
    }
    if (mode === 'feeds' && !isPremium) {
      const maxFeeds = PLAN_LIMITS.free.feeds;
      const remaining = maxFeeds - currentFeedCount;
      if (remaining <= 0) {
        toast.error(`You've reached the ${maxFeeds}-source limit on the Free plan. Upgrade to Premium for unlimited sources.`);
        return;
      }
    }

    setLoading(true);
    let response;
    try {
      response = await base44.functions.invoke('bulkImportSources', {
        content,
        format,
        digest_name: mode === 'digest' ? digestName : null,
        add_to_directory: mode === 'directory',
      });
    } catch (err) {
      setLoading(false);
      toast.error(err?.response?.data?.error || err?.message || 'Import failed');
      return;
    }
    setLoading(false);

    if (response.data?.error) {
      toast.error(response.data.error);
      return;
    }

    if (response.data?.digest_error) toast.error(`Sources imported, but the briefing was not created: ${response.data.digest_error}`);
    (response.data?.digest_warnings || []).forEach(w => toast.warning(w));
    setResult(response.data);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-semibold text-stone-100">
            <Upload className="w-5 h-5 text-[hsl(var(--primary))]" />
            Bulk import sources
          </DialogTitle>
          <DialogDescription>
            Upload an OPML file or paste a list of RSS feed URLs to import multiple sources at once.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          /* Success screen */
          <div className="py-4 space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10">
              <CheckCircle className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="font-display text-lg font-semibold text-stone-100">Import complete</p>
              <p className="mt-1 text-sm text-stone-400">
                <span className="font-mono font-semibold text-emerald-400">{result.summary.created}</span> of{' '}
                <span className="font-mono font-semibold">{result.summary.total}</span> sources ingested
              </p>
            </div>
            
            {result.summary.created > 0 && (
              <div className="panel-raised space-y-2 p-3 text-sm">
                {result.summary.rss_native > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-stone-300">Native RSS feeds</span>
                    <span className="font-mono font-semibold text-stone-100">{result.summary.rss_native}</span>
                  </div>
                )}
                {result.summary.rss_discovered > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-stone-300">Discovered RSS feeds</span>
                    <span className="font-mono font-semibold text-stone-100">{result.summary.rss_discovered}</span>
                  </div>
                )}
                {result.summary.generated > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-stone-300">Generated sources</span>
                    <span className="font-mono font-semibold text-stone-100">{result.summary.generated}</span>
                  </div>
                )}
              </div>
            )}

            {result.summary.failed > 0 && (
              <div className="space-y-2 rounded-xl border border-red-400/25 bg-red-400/10 p-3">
                <p className="text-sm font-medium text-red-300">
                  <span className="font-mono font-semibold">{result.summary.failed}</span> sources failed to import
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-red-200">
                  {result.results.filter(r => r.status === 'failed').map((r, idx) => (
                    <div key={idx} className="text-red-300">
                      {r.url}: {r.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.summary.duplicates > 0 && (
              <p className="text-xs text-stone-400 text-center">
                {result.summary.duplicates} source{result.summary.duplicates === 1 ? ' was' : 's were'} already in your library and skipped.
              </p>
            )}

            {result.digest && (
              <div className="panel-raised p-3">
                <p className="text-sm text-stone-300">
                  Briefing created: <span className="font-semibold text-[#C4A5FD]">{result.digest.name}</span>
                </p>
              </div>
            )}

            <Button onClick={() => handleClose(false)} className="btn-brand w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Format toggle */}
            <div>
              <p className="micro-label mb-2">Import format</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={format === 'opml'}
                  onClick={() => setFormat('opml')}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition-all',
                    format === 'opml'
                      ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.14)] text-stone-100'
                      : 'border-white/[0.07] text-stone-400 hover:border-white/[0.12] hover:bg-white/[0.03]'
                  )}
                >
                  <FileText className="w-4 h-4" />
                  OPML file
                </button>
                <button
                  type="button"
                  aria-pressed={format === 'urls'}
                  onClick={() => setFormat('urls')}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition-all',
                    format === 'urls'
                      ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.14)] text-stone-100'
                      : 'border-white/[0.07] text-stone-400 hover:border-white/[0.12] hover:bg-white/[0.03]'
                  )}
                >
                  <Link className="w-4 h-4" />
                  URL list
                </button>
              </div>
            </div>

            {/* Content input */}
            {format === 'opml' ? (
              <div>
                <p className="micro-label mb-2">OPML file</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="cursor-pointer rounded-2xl border border-dashed border-white/[0.12] p-6 text-center transition-all hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.05)]"
                >
                  <Upload className="w-6 h-6 text-stone-500 mx-auto mb-2" />
                  {opmlContent ? (
                    <p className="flex items-center justify-center gap-1 text-sm font-medium text-emerald-400">
                      <CheckCircle className="w-4 h-4" /> File loaded
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-stone-300 font-medium">Click to upload .opml file</p>
                      <p className="text-xs text-stone-500 mt-1">Exported from Feedly, Inoreader, NewsBlur, etc.</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".opml,.xml"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div>
                <p className="micro-label mb-2">RSS feed URLs</p>
                <textarea
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  placeholder={"https://feeds.example.com/rss\nhttps://blog.example.com/feed\n..."}
                  aria-label="RSS feed URLs"
                  className="h-32 w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 font-mono text-[13px] text-stone-100 placeholder:text-stone-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                />
                <p className="text-xs text-stone-500 mt-1">One URL per line, or comma-separated.</p>
              </div>
            )}

            {/* Mode */}
            <div>
              <p className="micro-label mb-2">How to import</p>
              <div className="grid grid-cols-1 gap-2">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                        mode === m.id
                          ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.10)]'
                          : 'border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.03]'
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                        mode === m.id ? 'bg-[hsl(var(--primary)/0.2)]' : 'bg-white/[0.05]'
                      )}>
                        <Icon className={cn('w-4 h-4', mode === m.id ? 'text-[hsl(var(--primary))]' : 'text-stone-500')} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-stone-100">{m.label}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{m.description}</p>
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={mode === 'directory'}
                  onClick={() => setMode('directory')}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                    mode === 'directory'
                      ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.10)]'
                      : 'border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.03]'
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    mode === 'directory' ? 'bg-[hsl(var(--primary)/0.2)]' : 'bg-white/[0.05]'
                  )}>
                    <Rss className={cn('w-4 h-4', mode === 'directory' ? 'text-[hsl(var(--primary))]' : 'text-stone-500')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-100">Add to directory</p>
                    <p className="text-xs text-stone-500 mt-0.5">Make sources available in the public directory.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Digest name */}
            {mode === 'digest' && (
              <div>
                <p className="micro-label mb-2">Briefing name</p>
                <Input
                  value={digestName}
                  onChange={(e) => setDigestName(e.target.value)}
                  placeholder="e.g. Morning tech briefing"
                  aria-label="Briefing name"
                />
              </div>
            )}

            {/* Action */}
            <Button
              onClick={handleImport}
              disabled={loading}
              className="w-full btn-brand"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
              ) : (
                'Import'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}