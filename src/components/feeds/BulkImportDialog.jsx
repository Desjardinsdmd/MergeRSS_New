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
import { Upload, FileText, Link, Rss, LayoutList, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MODES = [
  {
    id: 'feeds',
    icon: Rss,
    label: 'Individual Feeds',
    description: 'Add each URL as a separate feed you can manage independently.',
  },
  {
    id: 'digest',
    icon: LayoutList,
    label: 'Consolidated Digest',
    description: 'Bundle all sources into one digest delivered on a schedule.',
  },
];

export default function BulkImportDialog({ open, onOpenChange, onSuccess }) {
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
      toast.error('Please enter a name for the digest.');
      return;
    }

    setLoading(true);
    const invokeMode = mode === 'directory' ? 'feeds' : mode;
    const response = await base44.functions.invoke('bulkImportFeeds', {
      content,
      format,
      mode: invokeMode,
      digest_name: digestName,
      add_to_directory: mode === 'directory',
    });
    setLoading(false);

    if (response.data?.error) {
      toast.error(response.data.error);
      return;
    }

    setResult(response.data);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-[hsl(var(--primary))]" />
            Bulk Import Feeds
          </DialogTitle>
          <DialogDescription>
            Upload an OPML file or paste a list of RSS URLs to import multiple feeds at once.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          /* Success screen */
          <div className="py-4 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            {result.mode === 'feeds' ? (
              <>
                <p className="text-lg font-semibold text-stone-100">Import complete!</p>
                <p className="text-stone-400 text-sm">
                  <span className="font-bold text-stone-100">{result.created}</span> feeds added
                  {result.skipped > 0 && (
                    <>, <span className="font-bold">{result.skipped}</span> already existed and were skipped</>
                  )}.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-stone-100">Digest created!</p>
                <p className="text-stone-400 text-sm">
                  "<span className="font-bold">{result.digest_name}</span>" was created with{' '}
                  <span className="font-bold">{result.feeds_count}</span> feeds.
                </p>
              </>
            )}
            <Button onClick={() => handleClose(false)} className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Format toggle */}
            <div>
              <p className="text-sm font-medium text-stone-300 mb-2">Import format</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFormat('opml')}
                  className={cn(
                    'flex items-center gap-2.5 p-3 rounded-lg border-2 text-sm font-medium transition-all',
                    format === 'opml'
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                      : 'border-stone-700 text-stone-400 hover:border-stone-600'
                  )}
                >
                  <FileText className="w-4 h-4" />
                  OPML file
                </button>
                <button

                  onClick={() => setFormat('urls')}
                  className={cn(
                    'flex items-center gap-2.5 p-3 rounded-lg border-2 text-sm font-medium transition-all',
                    format === 'urls'
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                      : 'border-stone-700 text-stone-400 hover:border-stone-600'
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
                <p className="text-sm font-medium text-slate-700 mb-2">OPML file</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-stone-700 rounded-xl p-6 text-center cursor-pointer hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 transition-all"
                >
                  <Upload className="w-6 h-6 text-stone-500 mx-auto mb-2" />
                  {opmlContent ? (
                    <p className="text-sm text-emerald-600 font-medium flex items-center justify-center gap-1">
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
                <p className="text-sm font-medium text-stone-300 mb-2">RSS URLs</p>
                <textarea
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  placeholder={"https://feeds.example.com/rss\nhttps://blog.example.com/feed\n..."}
                  className="w-full h-32 text-sm border border-stone-700 rounded-lg p-3 resize-none bg-stone-800 text-stone-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent placeholder:text-stone-500"
                />
                <p className="text-xs text-stone-500 mt-1">One URL per line, or comma-separated.</p>
              </div>
            )}

            {/* Mode */}
            <div>
              <p className="text-sm font-medium text-stone-300 mb-2">How to import</p>
              <div className="grid grid-cols-1 gap-2">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        'flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all',
                        mode === m.id
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                          : 'border-stone-700 hover:border-stone-600 hover:bg-stone-800'
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                        mode === m.id ? 'bg-[hsl(var(--primary))]/20' : 'bg-stone-800'
                      )}>
                        <Icon className={cn('w-4 h-4', mode === m.id ? 'text-[hsl(var(--primary))]' : 'text-stone-500')} />
                      </div>
                      <div>
                        <p className="font-semibold text-stone-200 text-sm">{m.label}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{m.description}</p>
                      </div>
                    </button>
                  );
                })}
                <button
                  onClick={() => setMode('directory')}
                  className={cn(
                    'flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all',
                    mode === 'directory'
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                          : 'border-stone-700 hover:border-stone-600 hover:bg-stone-800'
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    mode === 'directory' ? 'bg-[hsl(var(--primary))]/20' : 'bg-stone-800'
                  )}>
                    <Rss className={cn('w-4 h-4', mode === 'directory' ? 'text-[hsl(var(--primary))]' : 'text-stone-500')} />
                  </div>
                  <div>
                    <p className="font-semibold text-stone-200 text-sm">Add to Directory</p>
                    <p className="text-xs text-stone-500 mt-0.5">Make feeds available in the public repository.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Digest name */}
            {mode === 'digest' && (
              <div>
                <p className="text-sm font-medium text-stone-300 mb-2">Digest name</p>
                <Input
                  value={digestName}
                  onChange={(e) => setDigestName(e.target.value)}
                  placeholder="e.g. My Tech Digest"
                />
              </div>
            )}

            {/* Action */}
            <Button
              onClick={handleImport}
              disabled={loading}
              className="w-full bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900"
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