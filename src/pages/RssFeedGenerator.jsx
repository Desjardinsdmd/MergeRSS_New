import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Rss, Globe, Wand2, AlertCircle, Info, Trash2, RefreshCw, Loader2,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/brand/Brand';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AddFeedDialog from '@/components/feeds/AddFeedDialog';
import AdvancedOptions from '@/components/rss/AdvancedOptions';
import GenerateProgress from '@/components/rss/GenerateProgress';
import GenerateResultCard from '@/components/rss/GenerateResultCard';
import FeedPreviewList from '@/components/rss/FeedPreviewList';
import SocialGuidance from '@/components/rss/SocialGuidance';

// Progress simulation: advances through 5 steps roughly matching real backend phases
function useProgressSim(active) {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (!active) { setStep(0); return; }
        setStep(1);
        const DELAYS = [800, 1600, 2800, 4500];
        const timers = DELAYS.map((d, i) => setTimeout(() => setStep(i + 2), d));
        return () => timers.forEach(clearTimeout);
    }, [active]);
    return step;
}

export default function RssFeedGenerator() {
    const queryClient = useQueryClient();
    const [user, setUser] = useState(null);
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null); // {message, suggestions, guidance, is_social, social_platform}
    const [addFeedOpen, setAddFeedOpen] = useState(false);
    const [feedType, setFeedType] = useState('auto');
    const [options, setOptions] = useState({
        refresh_frequency: '1hour',
        item_limit: 25,
        include_full_content: false,
        utm_params: '',
    });
    const [deletingFeedId, setDeletingFeedId] = useState(null);

    const progressStep = useProgressSim(loading);

    useEffect(() => {
        base44.auth.me().then(setUser).catch(() => {});
    }, []);

    const { data: myFeeds = [], refetch: refetchMyFeeds } = useQuery({
        queryKey: ['generatedFeeds'],
        queryFn: () => base44.entities.GeneratedFeed.filter({ created_by: user?.email }, '-created_date', 200),
        enabled: !!user,
    });

    const handleGenerate = async (e) => {
        e?.preventDefault();
        if (!url.trim()) return;
        setError(null);
        setResult(null);
        setLoading(true);

        try {
            const res = await base44.functions.invoke('generateRssFeed', {
                url: url.trim(),
                feed_type: feedType,
                ...options,
            });

            const data = res.data;
            if (data.error) {
                setError({
                    message: data.error,
                    suggestions: data.suggestions || [],
                    guidance: data.guidance || null,
                    is_social: data.is_social || false,
                    social_platform: data.social_platform || null,
                });
            } else {
                setResult(data);
                refetchMyFeeds();
            }
        } catch (err) {
            setError({
                message: err.message || 'Unexpected error. Please try again.',
                suggestions: ['Try a different URL or format'],
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (feedId) => {
        await base44.entities.GeneratedFeed.delete(feedId);
        refetchMyFeeds();
        toast.success('RSS feed removed');
        setDeletingFeedId(null);
    };

    const handleRegenerate = (feed) => {
        setUrl(feed.source_url);
        setResult(null);
        setError(null);
        setFeedType('auto');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleRetry = (feed) => {
        setUrl(feed.source_url);
        setResult(null);
        setError(null);
        setFeedType('auto');
        // Trigger generation automatically
        setTimeout(() => {
            const form = document.querySelector('form');
            if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
        }, 100);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="p-6 lg:p-8 max-w-3xl mx-auto">
            {/* Header */}
            <PageHeader
                eyebrow={<span className="inline-flex items-center gap-1.5"><Rss className="h-3 w-3" aria-hidden="true" />Tools</span>}
                title="RSS feed generator"
                subtitle="Paste any public website URL and we'll discover or generate an RSS feed. Existing RSS feeds are auto-detected, sites without one are scraped, and social platforms get guidance."
            />

            {/* URL Input Form */}
            <div className="panel mb-5">
                <div className="p-5">
                    <form onSubmit={handleGenerate} className="space-y-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" aria-hidden="true" />
                                <Input
                                    className="rounded-xl pl-9 font-mono text-[13px]"
                                    placeholder="https://example.com/blog"
                                    aria-label="Website URL"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={feedType} onValueChange={setFeedType}>
                                <SelectTrigger className="w-full rounded-xl text-sm sm:flex-1">
                                    <SelectValue placeholder="Source type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">🔍 Auto-detect (recommended)</SelectItem>
                                    <SelectItem value="page">📄 Website page → RSS</SelectItem>
                                    <SelectItem value="domain">🌐 Website domain → find existing RSS feed</SelectItem>
                                    <SelectItem value="social_profile">👤 Social profile</SelectItem>
                                    <SelectItem value="social_page">📣 Social page / group</SelectItem>
                                    <SelectItem value="social_post">🧵 Social post / thread</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                type="submit"
                                disabled={loading || !url.trim()}
                                className="btn-brand w-full flex-shrink-0 gap-2 sm:w-auto"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                {loading ? 'Generating…' : 'Generate RSS feed'}
                            </Button>
                        </div>

                        <AdvancedOptions options={options} onChange={setOptions} />

                        <div className="flex items-start gap-2 text-xs text-stone-500">
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span>
                                We first check for a native RSS/Atom feed. If none exists, we extract story links as a static snapshot.
                                Social platforms (Twitter, Instagram, LinkedIn) require API access.
                            </span>
                        </div>
                    </form>
                </div>
            </div>

            {/* Progress Steps */}
            {loading && (
                <div className="panel mb-5 p-5">
                    <GenerateProgress step={progressStep} />
                </div>
            )}

            {/* Error State */}
             {error && !loading && (
                 <div className="mb-5 space-y-3">
                     {error.is_social ? (
                         <SocialGuidance
                             error={error.message}
                             guidance={error.guidance}
                             platform={error.social_platform}
                         />
                     ) : (
                         <div className="rounded-xl border border-red-400/25 bg-red-400/10 p-4" role="alert">
                             <div className="flex items-start gap-3">
                                 <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                                 <div className="space-y-3 flex-1">
                                     <div>
                                         <p className="text-sm font-medium text-red-300">{error.message}</p>
                                         <p className="text-xs text-red-300/80 mt-1">This generation does not count toward your quota.</p>
                                     </div>
                                     {error.suggestions?.length > 0 && (
                                         <div>
                                             <p className="micro-label mb-1 text-red-300/80">Suggestions</p>
                                             <ul className="text-xs text-red-300 space-y-1">
                                                 {error.suggestions.map((s, i) => (
                                                     <li key={i} className="flex items-start gap-1.5">
                                                         <span className="text-red-400 flex-shrink-0">→</span>
                                                         {s}
                                                     </li>
                                                 ))}
                                             </ul>
                                         </div>
                                     )}
                                     <div className="flex gap-2 pt-2">
                                         <Button
                                             size="sm"
                                             onClick={() => handleGenerate()}
                                             className="btn-soft h-auto gap-1.5 text-xs"
                                         >
                                             <RefreshCw className="w-3 h-3" />
                                             Retry
                                         </Button>
                                         <Button
                                             size="sm"
                                             variant="outline"
                                             className="btn-ghost h-auto text-xs"
                                             onClick={() => setError(null)}
                                         >
                                             Dismiss
                                         </Button>
                                     </div>
                                 </div>
                             </div>
                         </div>
                     )}
                 </div>
             )}

            {/* Result */}
            {result && !loading && (
                <div className="space-y-4 mb-8">
                    <GenerateResultCard
                        result={result}
                        onAddToFeeds={() => setAddFeedOpen(true)}
                    />
                    {result.items?.length > 0 && (
                        <FeedPreviewList items={result.items} />
                    )}
                </div>
            )}

            {/* My Generated Feeds */}
             {myFeeds.length > 0 && (
                 <div className="mt-8">
                     <h2 className="mb-3 font-display text-lg font-semibold text-stone-100">
                         Your generated RSS feeds
                         <span className="ml-2 font-mono text-xs font-normal text-stone-500">
                             {myFeeds.filter(f => !f.last_error).length} active / {myFeeds.length} total
                         </span>
                     </h2>
                     <div className="space-y-2">
                         {myFeeds.map(feed => {
                             const hasFailed = feed.last_error || feed.is_disabled;
                             return (
                             <div key={feed.id} className={cn(
                                 "panel transition-opacity",
                                 hasFailed && "border-red-400/25 bg-red-400/[0.05]"
                             )}>
                                 <div className="p-4">
                                     <div className="flex items-start justify-between gap-3">
                                         <div className="flex-1 min-w-0">
                                             <div className="flex flex-wrap items-center gap-2 mb-1">
                                                 <p className={cn("truncate text-sm font-semibold", hasFailed ? "text-red-300" : "text-stone-100")}>
                                                     {feed.title || feed.source_url}
                                                 </p>
                                                 {feed.is_native_feed
                                                     ? <span className="chip border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">Live RSS</span>
                                                     : <span className="chip-neutral">Scraped</span>
                                                 }
                                                 {feed.last_error && <span className="chip border border-red-400/25 bg-red-400/10 text-red-300">Error</span>}
                                                 {feed.is_disabled && <span className="chip border border-amber-400/25 bg-amber-400/10 text-amber-300">Disabled</span>}
                                             </div>
                                             <p className="truncate font-mono text-[11px] text-stone-500">{feed.source_url}</p>
                                             {feed.last_error ? (
                                                 <p className="text-xs text-red-300 mt-1.5 leading-relaxed">
                                                     <strong>Error:</strong> {feed.last_error}
                                                 </p>
                                             ) : feed.last_success ? (
                                                 <p className="meta mt-0.5">
                                                     Last success: {format(new Date(feed.last_success), 'MMM d, h:mm a')}
                                                 </p>
                                             ) : null}
                                         </div>
                                         <div className="flex items-center gap-1 flex-shrink-0">
                                             {hasFailed && (
                                                 <Button
                                                     variant="ghost" size="icon"
                                                     className="h-8 w-8 rounded-lg text-[#C4A5FD] hover:text-[#D9C7FE]"
                                                     title="Retry generation"
                                                     onClick={() => handleRetry(feed)}
                                                     aria-label="Retry RSS feed generation"
                                                 >
                                                     <RefreshCw className="w-3.5 h-3.5" />
                                                 </Button>
                                             )}
                                             <Button
                                                 variant="ghost" size="icon"
                                                 className={cn(
                                                     "h-8 w-8 rounded-lg",
                                                     hasFailed ? "text-red-400 hover:text-red-300" : "text-stone-500 hover:text-red-400"
                                                 )}
                                                 title={hasFailed ? "Remove failed RSS feed" : "Delete"}
                                                 onClick={() => setDeletingFeedId(feed.id)}
                                                 aria-label={hasFailed ? "Remove failed RSS feed" : "Delete RSS feed"}
                                             >
                                                 <Trash2 className="w-3.5 h-3.5" />
                                             </Button>
                                             {!hasFailed && (
                                                 <Button
                                                     variant="ghost" size="icon"
                                                     className="h-8 w-8 rounded-lg text-stone-500 hover:text-[#C4A5FD]"
                                                     title="Regenerate"
                                                     onClick={() => handleRegenerate(feed)}
                                                     aria-label="Regenerate RSS feed"
                                                 >
                                                     <RefreshCw className="w-3.5 h-3.5" />
                                                 </Button>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         );
                         })}
                     </div>
                 </div>
             )}

            {/* Add Feed dialog */}
            <AddFeedDialog
                open={addFeedOpen}
                onOpenChange={setAddFeedOpen}
                onSuccess={() => {
                    toast.success('Added to your sources');
                    queryClient.invalidateQueries({ queryKey: ['feeds'] });
                }}
                editFeed={null}
                prefillUrl={result?.feed_url}
                prefillName={result?.title}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingFeedId} onOpenChange={(open) => !open && setDeletingFeedId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-stone-100">Delete RSS feed</AlertDialogTitle>
                        <AlertDialogDescription className="text-stone-400">
                            This will permanently remove this RSS feed from your generated RSS feeds. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex gap-3 justify-end">
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingFeedId && handleDelete(deletingFeedId)}
                            className="rounded-xl bg-red-500 text-white hover:bg-red-600"
                        >
                            Delete
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
            </div>
            );
            }