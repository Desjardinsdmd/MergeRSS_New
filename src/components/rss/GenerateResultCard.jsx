import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Download, ChevronDown, ChevronUp, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const METHOD_LABELS = {
    direct_rss: { label: 'Direct RSS/Atom', cls: 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    discovered_rss: { label: 'Auto-detected RSS', cls: 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    scraped: { label: 'Scraped (static snapshot)', cls: 'border border-amber-400/25 bg-amber-400/10 text-amber-300' },
    social_native: { label: 'Native social RSS', cls: 'border border-sky-400/25 bg-sky-400/10 text-sky-300' },
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
        <div className="panel overflow-hidden">
            <div className="border-b border-white/[0.07] p-5 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h3 className="truncate font-display text-lg font-semibold leading-snug text-stone-100">{result.title}</h3>
                        {result.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-stone-400">{result.description}</p>
                        )}
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        <span className={`chip ${methodMeta.cls}`}>{methodMeta.label}</span>
                        {result.item_count > 0 && (
                            <span className="chip-neutral">{result.item_count} stories</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-5">
                {/* Feed URL display */}
                {result.feed_url && (
                    <div className="panel-raised flex items-center gap-2 p-2.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs text-stone-300">{result.feed_url}</code>
                        <a href={result.feed_url} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 text-stone-500 transition-colors hover:text-[#C4A5FD]"
                            aria-label="Open RSS feed in a new tab">
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
                    <button type="button" onClick={copyUrl} className="btn-ghost w-full sm:w-auto">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy RSS feed URL'}
                    </button>
                    {result.rss_xml && (
                        <button type="button" onClick={downloadXml} className="btn-ghost w-full sm:w-auto">
                            <Download className="h-3.5 w-3.5" />
                            Download XML
                        </button>
                    )}
                    <button type="button" onClick={onAddToFeeds} className="btn-brand w-full sm:ml-auto sm:w-auto">
                        <Plus className="h-3.5 w-3.5" />
                        Add to my sources
                    </button>
                </div>

                {/* Scraped note */}
                {result.method === 'scraped' && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        <p>
                            This is a static snapshot. Links are extracted from the page at generation time. To keep it fresh, add it to your sources and MergeRSS will re-check periodically.
                        </p>
                    </div>
                )}

                {/* Raw XML toggle */}
                {result.rss_xml && (
                    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                        <button
                            type="button"
                            onClick={() => setXmlOpen(v => !v)}
                            aria-expanded={xmlOpen}
                            className="flex w-full items-center justify-between px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-stone-500 transition-colors hover:bg-white/[0.03] hover:text-stone-300"
                        >
                            <span>View raw RSS/XML</span>
                            {xmlOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {xmlOpen && (
                            <pre className="max-h-72 overflow-x-auto whitespace-pre-wrap border-t border-white/[0.07] bg-stone-950 p-4 font-mono text-xs text-stone-300">
                                {result.rss_xml.slice(0, 6000)}{result.rss_xml.length > 6000 ? '\n\n... (truncated for display)' : ''}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
