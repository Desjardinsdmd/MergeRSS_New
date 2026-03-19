import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Zap, LayoutGrid, List, RefreshCw } from 'lucide-react';
import TopFiveToday from './TopFiveToday';
import TrendingTopicsInline from './TrendingTopicsInline';
import RankedFeed from './RankedFeed';
import IntelligenceSidebar from './IntelligenceSidebar';
import WhatChanged from './WhatChanged';
import EmergingSignals from './EmergingSignals';
import NarrativeGrouping from './NarrativeGrouping';
import DailyBriefingSummary from './DailyBriefingSummary';

export default function IntelligenceDashboard({ user, feeds = [], digests = [], unreadDeliveries = [] }) {
    const queryClient = useQueryClient();
    const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
    const [top5Ids, setTop5Ids] = useState(new Set());

    const feedIds = feeds.map(f => f.id);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Main ranked feed — last 48h, sorted by importance then date
    const { data: rankedItems = [], isLoading: loadingRanked } = useQuery({
        queryKey: ['ranked-feed', feedIds.join(',')],
        queryFn: async () => {
            if (!feedIds.length) return [];
            const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const raw = await base44.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since48h } },
                '-importance_score',
                100
            );
            return raw || [];
        },
        enabled: !!feedIds.length,
        staleTime: 3 * 60 * 1000,
    });

    // Today's new items count
    const newTodayCount = rankedItems.filter(i =>
        i.published_date && new Date(i.published_date) >= new Date(since24h)
    ).length;

    // High importance/risk items for sidebar — only Watch+ decision state, cluster size tracked
    const highImportanceItems = (() => {
        const { clusterItems: ci, decisionState: ds } = require ? null : null; // no-op, use inline logic
        return rankedItems
            .filter(i => (i.importance_score != null && i.importance_score >= 65) || i.intelligence_tag === 'Risk')
            .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
            .slice(0, 6);
    })();

    // Bookmarks
    const { data: bookmarks = [] } = useQuery({
        queryKey: ['bookmarks-ids', user?.email],
        queryFn: () => base44.entities.Bookmark.filter({ created_by: user?.email }, '-created_date', 200),
        enabled: !!user,
        staleTime: 60000,
    });

    useEffect(() => {
        const ids = new Set(bookmarks.map(b => b.feed_item_id).filter(Boolean));
        setBookmarkedIds(ids);
    }, [bookmarks]);

    const handleBookmark = async (item) => {
        if (bookmarkedIds.has(item.id)) return;
        setBookmarkedIds(prev => new Set([...prev, item.id]));
        await base44.entities.Bookmark.create({
            feed_item_id: item.id,
            title: item.title,
            url: item.url,
            description: item.description,
            category: item.category,
            published_date: item.published_date,
            is_read: false,
        });
        queryClient.invalidateQueries({ queryKey: ['bookmarks-ids'] });
    };

    const sidebarStats = {
        newToday: newTodayCount,
        unreadDigests: unreadDeliveries.length,
        savedCount: bookmarks.length,
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
                {/* Daily Intelligence Briefing — top anchor */}
                <DailyBriefingSummary items={rankedItems} feeds={feeds} />

                {/* What Changed Since Last Visit */}
                <WhatChanged feedIds={feedIds} feeds={feeds} />

                {/* Top 5 Today */}
                <TopFiveToday feedIds={feedIds} feeds={feeds} onItemsLoaded={setTop5Ids} />

                {/* Emerging Signals */}
                <EmergingSignals feedIds={feedIds} feeds={feeds} top5Ids={top5Ids} />

                {/* Trending Topics */}
                <TrendingTopicsInline feedIds={feedIds} />

                {/* Ranked Feed */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-stone-500" />
                            <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Intelligence Feed</h2>
                            <span className="text-xs text-stone-600">ranked by importance</span>
                        </div>
                        <button
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['ranked-feed'] })}
                            className="p-1 text-stone-600 hover:text-stone-300 transition"
                            title="Refresh"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    {loadingRanked ? (
                        <div className="bg-stone-900 border border-stone-800 p-6 text-center text-stone-600 text-sm">Loading ranked feed...</div>
                    ) : (
                        <RankedFeed
                            items={rankedItems}
                            feeds={feeds}
                            bookmarkedIds={bookmarkedIds}
                            onBookmark={handleBookmark}
                        />
                    )}
                </div>
            </div>

            {/* Right sidebar */}
            <div className="lg:col-span-1">
                <IntelligenceSidebar
                    digests={digests}
                    stats={sidebarStats}
                    highImportanceItems={highImportanceItems}
                />
            </div>
        </div>
    );
}