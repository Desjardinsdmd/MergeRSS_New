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
    <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          AI-Powered RSS Discovery
        </CardTitle>
        <CardDescription className="text-xs">
          Search the internet for popular RSS feeds on any topic and add them to the directory automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick queries */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">Quick searches:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_QUERIES.map(q => (
              <button
                key={q.label}
                onClick={() => {
                  setQuery(q.query);
                  setCategory(q.category);
                }}
                className="px-2.5 py-1 rounded-full border border-indigo-200 text-xs text-indigo-700 bg-white hover:bg-indigo-50 transition"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Search Topic</Label>
            <Input
              placeholder='e.g. "climate change science" or "day trading stocks"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 text-sm h-9">
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
            <span className="text-xs text-slate-600">
              {dryRun ? 'Dry run (preview only)' : 'Live (saves to directory)'}
            </span>
          </div>
          <Button
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching...</>
              : <><Search className="w-4 h-4 mr-2" />Discover Feeds</>
            }
          </Button>
        </div>

        {/* Results */}
        {results && (
          <div className="border-t pt-4 space-y-3">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="bg-indigo-100 text-indigo-700">
                {results.discovered} discovered
              </Badge>
              <Badge className="bg-green-100 text-green-700">
                {results.validated} valid
              </Badge>
              {!dryRun && results.added > 0 && (
                <Badge className="bg-emerald-100 text-emerald-700">
                  {results.added} added to directory
                </Badge>
              )}
              {results.skipped > 0 && (
                <Badge variant="outline">
                  {results.skipped} duplicates skipped
                </Badge>
              )}
              {results.failed > 0 && (
                <Badge className="bg-red-100 text-red-700">
                  {results.failed} unreachable
                </Badge>
              )}
            </div>

            {/* Validated feeds */}
            {results.validated_feeds?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Valid feeds {dryRun ? '(not saved yet)' : '(saved!)'}
                </p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {results.validated_feeds.map((f, i) => (
                    <div key={i} className="flex items-start justify-between px-3 py-2 bg-green-50 rounded-lg gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900">{f.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{f.url}</p>
                        {f.description && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{f.description}</p>}
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
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full text-xs border-green-300 text-green-700 hover:bg-green-50"
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
                <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Unreachable (not added)
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {results.failed_feeds.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-red-50 rounded-lg gap-2">
                      <p className="text-xs text-slate-600 truncate">{f.name}</p>
                      <span className="text-[10px] text-red-500 flex-shrink-0">{f.reason}</span>
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