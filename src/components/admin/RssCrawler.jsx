import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Search, CheckCircle2, XCircle, AlertCircle, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        toast.success(`Added ${res.data.added} new feeds to the directory!`);
      } else if (dryRun) {
        toast.success(`Found ${res.data?.validated || 0} valid feeds — toggle off dry run to save them`);
      }
    } catch (e) {
      toast.error('Discovery failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-700/30 bg-gradient-to-br from-amber-900/20 to-stone-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-stone-200">
          <Sparkles className="w-4 h-4 text-amber-400" />
          AI-Powered RSS Discovery
        </CardTitle>
        <CardDescription className="text-xs text-stone-500">
          Search the internet for popular RSS feeds on any topic and add them to the directory automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick queries */}
         <div>
           <p className="text-xs font-medium text-stone-500 mb-2">Quick searches:</p>
           <div className="flex flex-wrap gap-2">
             {QUICK_QUERIES.map(q => (
               <button
                 key={q.label}
                 onClick={() => {
                   setQuery(q.query);
                   setCategory(q.category);
                 }}
                 className="px-2.5 py-1 rounded-full border border-amber-700/30 text-xs text-amber-300 bg-stone-800 hover:bg-stone-700 transition"
               >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs text-stone-300">Search Topic</Label>
            <Input
              placeholder='e.g. "climate change science" or "day trading stocks"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              className="mt-1 text-sm rounded-lg bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-600"
            />
          </div>
          <div>
            <Label className="text-xs text-stone-300">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 text-sm h-9 rounded-lg bg-stone-800 border-stone-700 text-stone-100">
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
            <span className="text-xs text-stone-500">
              {dryRun ? 'Dry run (preview only)' : 'Live (saves to directory)'}
            </span>
          </div>
          <Button
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
            className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching...</>
              : <><Search className="w-4 h-4 mr-2" />Discover Feeds</>
            }
          </Button>
        </div>

        {/* Results */}
        {results && (
          <div className="border-t border-stone-800 pt-4 space-y-3">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="bg-amber-900/30 text-amber-400">
                {results.discovered} discovered
              </Badge>
              <Badge className="bg-green-900/30 text-green-400">
                {results.validated} valid
              </Badge>
              {!dryRun && results.added > 0 && (
                <Badge className="bg-emerald-900/30 text-emerald-400">
                  {results.added} added to directory
                </Badge>
              )}
              {results.skipped > 0 && (
                <Badge variant="outline" className="border-stone-700 text-stone-400">
                  {results.skipped} duplicates skipped
                </Badge>
              )}
              {results.failed > 0 && (
                <Badge className="bg-red-900/30 text-red-400">
                  {results.failed} unreachable
                </Badge>
              )}
            </div>

            {/* Validated feeds */}
            {results.validated_feeds?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Valid feeds {dryRun ? '(not saved yet)' : '(saved!)'}
                </p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {results.validated_feeds.map((f, i) => (
                    <div key={i} className="flex items-start justify-between px-3 py-2 bg-green-900/20 rounded-lg gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-stone-200">{f.name}</p>
                        <p className="text-[10px] text-stone-500 truncate">{f.url}</p>
                        {f.description && <p className="text-[10px] text-stone-600 mt-0.5 line-clamp-1">{f.description}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1 flex-shrink-0">
                        {f.tags?.slice(0, 2).map(t => (
                          <Badge key={t} variant="outline" className="text-[9px] py-0">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {dryRun && results.validated_feeds.length > 0 && (
                  <Button
                    onClick={() => runSearch(query, category)}
                    size="sm"
                    className="mt-2 w-full text-xs bg-green-900/20 border border-green-700 text-green-400 hover:bg-green-900/30"
                    disabled={loading}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Save {results.validated_feeds.length} feeds to directory (turn off dry run)
                  </Button>
                )}
              </div>
            )}

            {/* Failed feeds */}
            {results.failed_feeds?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Unreachable (not added)
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {results.failed_feeds.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-red-900/20 rounded-lg gap-2">
                      <p className="text-xs text-stone-500 truncate">{f.name}</p>
                      <span className="text-[10px] text-red-400 flex-shrink-0">{f.reason}</span>
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