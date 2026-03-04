import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Check, ExternalLink, Download, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { toast } from 'sonner';

const METHOD_LABELS = {
    direct_rss: { label: 'Direct RSS/Atom', cls: 'bg-green-100 text-green-700' },
    discovered_rss: { label: 'Auto-detected RSS', cls: 'bg-emerald-100 text-emerald-700' },
    scraped: { label: 'Scraped (static snapshot)', cls: 'bg-amber-100 text-amber-700' },
    social_native: { label: 'Native social RSS', cls: 'bg-blue-100 text-blue-700' },
};

export default function GenerateResultCard({ result, onAddToFeeds }) {
    const [copied, setCopied] = useState(false);
    const [xmlOpen, setXmlOpen] = useState(false);

    const methodMeta = METHOD_LABELS[result.method] || METHOD_LABELS['scraped'];

    const copyUrl = () => {
        navigator.clipboard.writeText(result.feed_url || result.rss_xml?.slice(0, 100));
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadXml = () => {
        if (!result.rss_xml) return;
        const blob = new Blob([result.rss_xml], { type: 'application/rss+xml' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: 'feed.xml',
        });
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <Card className="border-slate-100">
            <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base leading-snug truncate">{result.title}</CardTitle>
                        {result.description && (
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{result.description}</p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <Badge className={`${methodMeta.cls} border-0 text-xs`}>{methodMeta.label}</Badge>
                        {result.item_count > 0 && (
                            <Badge variant="secondary" className="text-xs">{result.item_count} items</Badge>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
                {/* Feed URL display */}
                {result.feed_url && (
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <code className="text-xs text-slate-600 flex-1 min-w-0 truncate">{result.feed_url}</code>
                        <a href={result.feed_url} target="_blank" rel="noopener noreferrer"
                            className="text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0">
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5 w-full sm:w-auto">
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied!' : 'Copy Feed URL'}
                    </Button>
                    {result.rss_xml && (
                        <Button variant="outline" size="sm" onClick={downloadXml} className="gap-1.5 w-full sm:w-auto">
                            <Download className="w-3.5 h-3.5" />
                            Download XML
                        </Button>
                    )}
                    <Button size="sm" onClick={onAddToFeeds}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5 w-full sm:w-auto sm:ml-auto">
                        <Plus className="w-3.5 h-3.5" />
                        Add to My Feeds
                    </Button>
                </div>

                {/* Scraped note */}
                {result.method === 'scraped' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        This is a static snapshot — links are extracted from the page at generation time. To keep it fresh, add it to My Feeds and MergeRSS will re-check periodically.
                    </p>
                )}

                {/* Raw XML toggle */}
                {result.rss_xml && (
                    <div className="border border-slate-100 rounded-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setXmlOpen(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                            <span>View raw RSS/XML</span>
                            {xmlOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {xmlOpen && (
                            <pre className="bg-slate-900 text-slate-100 text-xs p-4 overflow-x-auto max-h-72 whitespace-pre-wrap border-t border-slate-700">
                                {result.rss_xml.slice(0, 6000)}{result.rss_xml.length > 6000 ? '\n\n... (truncated for display)' : ''}
                            </pre>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}