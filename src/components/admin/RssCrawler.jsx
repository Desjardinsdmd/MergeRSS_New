import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Search, CheckCircle2, XCircle, Plus, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const QUICK_QUERIES = [
  { label: 'Tech News', query: 'technology news blogs', category: 'Tech' },
  { label: 'AI & ML', query: 'artificial intelligence machine learning', category: 'AI' },
  { label: 'Finance', query: 'personal finance investing stock market', category: 'Finance' },
  { label: 'Crypto', query: 'cryptocurrency bitcoin blockchain news', category: 'Crypto' },
  { label: 'CRE', query: 'commercial real estate news', category: 'CRE' },
  { label: 'Markets', query: 'financial markets trading economics', category: 'Markets' },
  { label: 'Startups', query: 'startup news venture capital founders', category: 'Tech' },
  { label: 'Science', query: 'science research discoveries', category: 'Other' },
];

export default function RssCrawler() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Other');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const runSearch = async (overrideQuery = null, overrideCategory = null) => {
    const q = overrideQuery || query;
    const cat = overrideCategory || category;
    if (!q.trim()) {
      toast.error('Enter a search topic first');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const res = await base44.functions.invoke('discoverRssFeeds', {
        query: q,
        category: cat,
        dry_run: dryRun,
      });
      setResults(res.data);
      if (!dryRun && res.data?.added > 0) {
        toast.success(`Added ${res.data.added} new sources to the directory`);
      } else if (dryRun) {
        toast.success(`Found ${res.data?.validated || 0} valid sources. Turn off dry run to save them`);
      }
    } catch (e) {
      toast.error('Discovery failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="panel-accent border-[hsl(var(--brand)/0.35)] bg-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base font-semibold text-stone-100">
          <Sparkles className="w-4 h-4 text-[#C4A5FD]" />
          AI source discovery
        </CardTitle>
        <CardDescription className="text-xs text-stone-500">
          Search the web for popular RSS feeds on any topic and add them to the source directory.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick queries */}
         <div>
           <p className="micro-label mb-2">Quick searches</p>
           <div className="flex flex-wrap gap-2">
             {QUICK_QUERIES.map(q => (
               <button
                 key={q.label}
                 onClick={() => {
                   setQuery(q.query);
                   setCategory(q.category);
                 }}
                 className="chip-brand border border-[hsl(var(--brand)/0.3)] px-2 py-1 transition hover:bg-[hsl(var(--brand)/0.24)]"
               >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Search topic</Label>
            <Input
              placeholder='e.g. "climate change science" or "day trading stocks"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              className="mt-1.5 text-sm rounded-xl border-white/10 bg-stone-800 text-stone-100"
            />
          </div>
          <div>
            <Label className="block font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5 text-sm h-10 rounded-xl border-white/10 bg-stone-800 text-stone-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CRE">CRE</SelectItem>
                <SelectItem value="Markets">Markets</SelectItem>
                <SelectItem value="Tech">Tech</SelectItem>
                <SelectItem value="News">News</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Crypto">Crypto</SelectItem>
                <SelectItem value="AI">AI</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dry run + button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
            <span className="font-mono text-[11px] text-stone-500">
              {dryRun ? 'Dry run (preview only)' : 'Live (saves to directory)'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
            className="btn-brand disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Searching...</>
              : <><Search className="w-4 h-4" />Discover sources</>
            }
          </button>
        </div>

        {/* Results */}
        {results && (
          <div className="border-t border-white/[0.07] pt-4 space-y-3">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#C4A5FD]">
                {results.discovered} discovered
              </Badge>
              <Badge className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                {results.validated} valid
              </Badge>
              {!dryRun && results.added > 0 && (
                <Badge className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  {results.added} added to directory
                </Badge>
              )}
              {results.skipped > 0 && (
                <Badge variant="outline" className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-white/10 bg-white/[0.03] text-stone-400">
                  {results.skipped} duplicates skipped
                </Badge>
              )}
              {results.failed > 0 && (
                <Badge className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider shadow-none hover:bg-inherit border-red-400/25 bg-red-400/10 text-red-300">
                  {results.failed} unreachable
                </Badge>
              )}
            </div>

            {/* Validated feeds */}
            {results.validated_feeds?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-300 mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Valid sources {dryRun ? '(not saved yet)' : '(saved)'}
                </p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {results.validated_feeds.map((f, i) => (
                    <div key={i} className="flex items-start justify-between px-3 py-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-stone-200">{f.name}</p>
                        <p className="font-mono text-[10px] text-stone-500 truncate">{f.url}</p>
                        {f.description && <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-1">{f.description}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1 flex-shrink-0">
                        {f.tags?.slice(0, 2).map(t => (
                          <span key={t} className="chip-neutral text-[9px]">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {dryRun && results.validated_feeds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => runSearch(query, category)}
                    className="btn-soft mt-2 w-full text-xs disabled:opacity-50"
                    disabled={loading}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Save {results.validated_feeds.length} sources to directory (turn off dry run)
                  </button>
                )}
              </div>
            )}

            {/* Failed feeds */}
            {results.failed_feeds?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-300 mb-2 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Unreachable (not added)
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {results.failed_feeds.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-xl border border-red-400/15 bg-red-400/[0.06] gap-2">
                      <p className="text-xs text-stone-500 truncate">{f.name}</p>
                      <span className="font-mono text-[10px] text-red-300 flex-shrink-0">{f.reason}</span>
                    </div>
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