import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Rss, Globe, Wand2, AlertCircle, Info, Trash2, RefreshCw, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
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
    const [options, setOptions] = useState({
        refresh_frequency: '1hour',
        item_limit: 25,
        include_full_content: false,
        utm_params: '',
    });

    const progressStep = useProgressSim(loading);

    useEffect(() => {
        base44.auth.me().then(setUser).catch(() => {});
    }, []);

    const { data: myFeeds = [], refetch: refetchMyFeeds } = useQuery({
        queryKey: ['generatedFeeds'],
        queryFn: () => base44.entities.GeneratedFeed.filter({ created_by: user?.email }, '-created_date', 20),
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
    };

    const handleRegenerate = (feed) => {
        setUrl(feed.source_url);
        setResult(null);
        setError(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="p-6 lg:p-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Rss className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">RSS Feed Generator</h1>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">
                    Paste any public website URL and we'll discover or generate an RSS feed. Supports auto-detection of existing feeds, scraping for sites without one, and social platform guidance.
                </p>
            </div>

            {/* URL Input Form */}
            <Card className="border-slate-100 mb-5">
                <CardContent className="pt-5">
                    <form onSubmit={handleGenerate} className="space-y-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    className="pl-9 text-sm"
                                    placeholder="https://example.com/blog"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    required
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={loading || !url.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700 gap-2 flex-shrink-0"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                {loading ? 'Generating…' : 'Generate'}
                            </Button>
                        </div>

                        <AdvancedOptions options={options} onChange={setOptions} />

                        <div className="flex items-start gap-2 text-xs text-slate-400">
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
                <Card className="border-slate-100 mb-5">
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
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-red-800">{error.message}</p>
                                    {error.suggestions?.length > 0 && (
                                        <ul className="text-xs text-red-700 space-y-1">
                                            {error.suggestions.map((s, i) => (
                                                <li key={i} className="flex items-start gap-1.5">
                                                    <span className="text-red-400 flex-shrink-0">→</span>
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
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
                    <h2 className="text-base font-semibold text-slate-800 mb-3">
                        Your Generated Feeds
                        <span className="ml-2 text-xs text-slate-400 font-normal">
                            {myFeeds.length} / 20 used
                        </span>
                    </h2>
                    <div className="space-y-2">
                        {myFeeds.map(feed => (
                            <Card key={feed.id} className={cn("border-slate-100", feed.is_disabled && "opacity-50")}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <p className="text-sm font-medium text-slate-800 truncate">
                                                    {feed.title || feed.source_url}
                                                </p>
                                                {feed.is_native_feed
                                                    ? <Badge className="bg-green-100 text-green-700 border-0 text-xs">Live RSS</Badge>
                                                    : <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Scraped</Badge>
                                                }
                                                {feed.is_disabled && <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">Disabled</Badge>}
                                                {feed.error_count > 2 && <Badge className="bg-red-100 text-red-600 border-0 text-xs">{feed.error_count} errors</Badge>}
                                            </div>
                                            <p className="text-xs text-slate-400 truncate">{feed.source_url}</p>
                                            {feed.last_success && (
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    Last success: {format(new Date(feed.last_success), 'MMM d, h:mm a')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                                                title="Regenerate"
                                                onClick={() => handleRegenerate(feed)}
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-red-500"
                                                title="Delete"
                                                onClick={() => handleDelete(feed.id)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
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
        </div>
    );
}