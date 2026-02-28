import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wand2, Copy, Check, ExternalLink, Plus, AlertCircle, Globe, Rss, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddFeedDialog from '@/components/feeds/AddFeedDialog';
import { toast } from 'sonner';

export default function RssFeedGenerator() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [xmlExpanded, setXmlExpanded] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await base44.functions.invoke('generateRssFeed', { url });
      if (res.data.error) {
        setError(res.data.error);
      } else {
        setResult(res.data);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copyXml = () => {
    if (!result?.rss_xml) return;
    navigator.clipboard.writeText(result.rss_xml);
    setCopied(true);
    toast.success('RSS XML copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadXml = () => {
    if (!result?.rss_xml) return;
    const blob = new Blob([result.rss_xml], { type: 'application/rss+xml' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'feed.xml';
    a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Rss className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">RSS Feed Generator</h1>
        </div>
        <p className="text-slate-600">
          Enter any public website URL and we'll extract its content and generate an RSS feed you can subscribe to.
        </p>
      </div>

      {/* URL input form */}
      <Card className="border-slate-100 mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleGenerate} className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9 text-sm"
                placeholder="https://example.com/blog"
                value={url}
                onChange={e => setUrl(e.target.value)}
                required
                type="url"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !url}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Generate
            </Button>
          </form>
          <p className="text-xs text-slate-400 mt-2 ml-1">
            Works with blogs, news sites, and any page with multiple article links. If the page already has an RSS feed, we'll detect it automatically.
          </p>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl mb-6 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Summary card */}
          <Card className="border-slate-100">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{result.title}</CardTitle>
                  {result.description && (
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{result.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {result.is_native_feed ? (
                    <Badge className="bg-green-100 text-green-700 border-0">
                      {result.discovered_from ? '🔍 Auto-detected RSS' : 'Native RSS'}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-0">Scraped (static)</Badge>
                  )}
                  <Badge variant="secondary">{result.item_count} items</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyXml} className="gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy XML'}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadXml} className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Download .xml
              </Button>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                onClick={() => setAddFeedOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add to My Feeds
              </Button>
            </CardContent>
          </Card>

          {/* Article list preview */}
          {!result.is_native_feed && result.items?.length > 0 && (
            <Card className="border-slate-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Extracted Articles</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {result.items.map((item, i) => (
                    <a
                      key={i}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-slate-50 group transition"
                    >
                      <span className="text-xs text-slate-400 mt-0.5 w-5 flex-shrink-0">{i + 1}.</span>
                      <span className="text-sm text-slate-700 group-hover:text-indigo-600 line-clamp-1 flex-1">{item.title}</span>
                      <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* XML preview (collapsible) */}
          <Card className="border-slate-100">
            <button
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition rounded-xl"
              onClick={() => setXmlExpanded(v => !v)}
            >
              <span>View raw RSS/XML</span>
              {xmlExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {xmlExpanded && (
              <div className="px-4 pb-4">
                <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto max-h-80 whitespace-pre-wrap">
                  {result.rss_xml}
                </pre>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Add feed dialog pre-filled with the generated feed URL */}
      <AddFeedDialog
        open={addFeedOpen}
        onOpenChange={setAddFeedOpen}
        onSuccess={() => toast.success('Feed added successfully!')}
        editFeed={null}
        prefillUrl={result?.feed_url}
        prefillName={result?.title}
      />
    </div>
  );
}