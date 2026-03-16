import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Rss, Globe, Wand2, AlertCircle, Info, Trash2, RefreshCw, Loader2,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
        toast.success('Feed removed');
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
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 bg-[hsl(var(--primary))] rounded-lg flex items-center justify-center flex-shrink-0">
                        <Rss className="w-5 h-5 text-stone-900" />
                    </div>
                    <h1 className="text-2xl font-bold text-stone-100">RSS Feed Generator</h1>
                </div>
                <p className="text-stone-500 text-sm leading-relaxed">
                    Paste any public website URL and we'll discover or generate an RSS feed. Supports auto-detection of existing feeds, scraping for sites without one, and social platform guidance.
                </p>
            </div>

            {/* URL Input Form */}
            <Card className="border-stone-800 bg-stone-900 mb-5">
                <CardContent className="pt-5">
                    <form onSubmit={handleGenerate} className="space-y-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600" />
                                <Input
                                    className="pl-9 text-sm bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-600"
                                    placeholder="https://example.com/blog"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={feedType} onValueChange={setFeedType}>
                                <SelectTrigger className="text-sm w-full sm:flex-1">
                                    <SelectValue placeholder="Feed type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">🔍 Auto-detect (recommended)</SelectItem>
                                    <SelectItem value="page">📄 Website page → RSS</SelectItem>
                                    <SelectItem value="domain">🌐 Website domain → find existing feed</SelectItem>
                                    <SelectItem value="social_profile">👤 Social profile</SelectItem>
                                    <SelectItem value="social_page">📣 Social page / group</SelectItem>
                                    <SelectItem value="social_post">🧵 Social post / thread</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                type="submit"
                                disabled={loading || !url.trim()}
                                className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-semibold gap-2 w-full sm:w-auto flex-shrink-0"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                {loading ? 'Generating…' : 'Generate Feed'}
                            </Button>
                        </div>

                        <AdvancedOptions options={options} onChange={setOptions} />

                        <div className="flex items-start gap-2 text-xs text-stone-500">
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>
                                We first check for a native RSS/Atom feed. If none exists, we extract article links as a static snapshot.
                                Social platforms (Twitter, Instagram, LinkedIn) require API access.
                            </span>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Progress Steps */}
            {loading && (
                <Card className="border-stone-800 bg-stone-900 mb-5">
                    <CardContent className="pt-5">
                        <GenerateProgress step={progressStep} />
                    </CardContent>
                </Card>
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
                         <div className="p-4 bg-red-900/20 border border-red-700 rounded-xl">
                             <div className="flex items-start gap-3">
                                 <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                 <div className="space-y-3 flex-1">
                                     <div>
                                         <p className="text-sm font-medium text-red-400">{error.message}</p>
                                         <p className="text-xs text-red-300 mt-1">This generation does not count toward your quota.</p>
                                     </div>
                                     {error.suggestions?.length > 0 && (
                                         <div>
                                             <p className="text-xs text-red-300 font-medium mb-1">Suggestions:</p>
                                             <ul className="text-xs text-red-400 space-y-1">
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
                                             className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-medium text-xs gap-1.5"
                                         >
                                             <RefreshCw className="w-3 h-3" />
                                             Retry
                                         </Button>
                                         <Button
                                             size="sm"
                                             variant="outline"
                                             className="text-xs"
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
                     <h2 className="text-base font-semibold text-stone-200 mb-3">
                         Your Generated Feeds
                         <span className="ml-2 text-xs text-stone-500 font-normal">
                             {myFeeds.filter(f => !f.last_error).length} active / {myFeeds.length} total
                         </span>
                     </h2>
                     <div className="space-y-2">
                         {myFeeds.map(feed => {
                             const hasFailed = feed.last_error || feed.is_disabled;
                             return (
                             <Card key={feed.id} className={cn(
                                 "border-stone-800 bg-stone-900 transition-opacity",
                                 hasFailed && "border-red-900/50 bg-red-950/30"
                             )}>
                                 <CardContent className="p-4">
                                     <div className="flex items-start justify-between gap-3">
                                         <div className="flex-1 min-w-0">
                                             <div className="flex flex-wrap items-center gap-2 mb-1">
                                                 <p className={cn("text-sm font-medium truncate", hasFailed ? "text-red-400" : "text-stone-200")}>
                                                     {feed.title || feed.source_url}
                                                 </p>
                                                 {feed.is_native_feed
                                                     ? <Badge className="bg-green-900/30 text-green-400 border-0 text-xs">Live RSS</Badge>
                                                     : <Badge className="bg-amber-900/30 text-amber-400 border-0 text-xs">Scraped</Badge>
                                                 }
                                                 {feed.last_error && <Badge className="bg-red-900/30 text-red-400 border-0 text-xs">Error</Badge>}
                                                 {feed.is_disabled && <Badge className="bg-stone-800 text-stone-500 border-0 text-xs">Disabled</Badge>}
                                             </div>
                                             <p className="text-xs text-stone-600 truncate">{feed.source_url}</p>
                                             {feed.last_error ? (
                                                 <p className="text-xs text-red-400 mt-1.5 leading-relaxed">
                                                     <strong>Error:</strong> {feed.last_error}
                                                 </p>
                                             ) : feed.last_success ? (
                                                 <p className="text-xs text-stone-600 mt-0.5">
                                                     Last success: {format(new Date(feed.last_success), 'MMM d, h:mm a')}
                                                 </p>
                                             ) : null}
                                         </div>
                                         <div className="flex items-center gap-1 flex-shrink-0">
                                             {hasFailed && (
                                                 <Button
                                                     variant="ghost" size="icon"
                                                     className="h-8 w-8 text-orange-600 hover:text-orange-400"
                                                     title="Retry generation"
                                                     onClick={() => handleRetry(feed)}
                                                     aria-label="Retry feed generation"
                                                 >
                                                     <RefreshCw className="w-3.5 h-3.5" />
                                                 </Button>
                                             )}
                                             <Button
                                                 variant="ghost" size="icon"
                                                 className={cn(
                                                     "h-8 w-8",
                                                     hasFailed ? "text-red-600 hover:text-red-400" : "text-stone-600 hover:text-red-400"
                                                 )}
                                                 title={hasFailed ? "Remove error feed" : "Delete"}
                                                 onClick={() => setDeletingFeedId(feed.id)}
                                                 aria-label={hasFailed ? "Remove error feed" : "Delete feed"}
                                             >
                                                 <Trash2 className="w-3.5 h-3.5" />
                                             </Button>
                                             {!hasFailed && (
                                                 <Button
                                                     variant="ghost" size="icon"
                                                     className="h-8 w-8 text-stone-600 hover:text-[hsl(var(--primary))]"
                                                     title="Regenerate"
                                                     onClick={() => handleRegenerate(feed)}
                                                     aria-label="Regenerate feed"
                                                 >
                                                     <RefreshCw className="w-3.5 h-3.5" />
                                                 </Button>
                                             )}
                                         </div>
                                     </div>
                                 </CardContent>
                             </Card>
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
                    toast.success('Feed added to My Feeds!');
                    queryClient.invalidateQueries({ queryKey: ['feeds'] });
                }}
                editFeed={null}
                prefillUrl={result?.feed_url}
                prefillName={result?.title}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingFeedId} onOpenChange={(open) => !open && setDeletingFeedId(null)}>
                <AlertDialogContent className="bg-stone-900 border-stone-800">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-stone-100">Delete Feed</AlertDialogTitle>
                        <AlertDialogDescription className="text-stone-400">
                            This will permanently remove this feed from your generated feeds. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex gap-3 justify-end">
                        <AlertDialogCancel className="border-stone-700 text-stone-200 hover:bg-stone-800">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingFeedId && handleDelete(deletingFeedId)}
                            className="bg-red-900 hover:bg-red-800 text-red-100"
                        >
                            Delete
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
            </div>
            );
            }