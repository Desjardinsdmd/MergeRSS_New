import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const STOP_WORDS = new Set([
    'the','and','for','that','this','with','from','have','been','will','are','was','were','not','but',
    'they','their','them','what','when','where','which','who','how','can','could','would','should',
    'more','also','than','into','over','about','just','your','our','its','has','had','said','news',
    'after','before','under','each','between','other','some','very','most','such','even','only','while',
    'there','here','time','year','make','like','know','take','need','used','says','new','report',
    'share','data','week','month','show','says','amid','first','plan','million','billion',
]);

const MIN_ARTICLES = 3; // minimum article count to show a topic

function extractKeywords(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4 && !STOP_WORDS.has(w));
}

export default function TrendingTopicsInline({ feedIds }) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: recentItems = [] } = useQuery({
        queryKey: ['trending-inline', feedIds?.join(',')],
        queryFn: () => base44.entities.FeedItem.filter(
            { feed_id: { $in: feedIds }, published_date: { $gte: since48h } },
            '-published_date',
            300
        ),
        enabled: !!feedIds?.length,
        staleTime: 10 * 60 * 1000,
    });

    const topics = useMemo(() => {
        if (!recentItems.length) return [];

        const last24 = recentItems.filter(i => i.published_date >= since24h);
        const prev24 = recentItems.filter(i => i.published_date < since24h);

        const countFreq = (items) => {
            const freq = {};
            items.forEach(item => {
                const words = extractKeywords((item.title || '') + ' ' + (item.description || ''));
                const unique = [...new Set(words)];
                unique.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
            });
            return freq;
        };

        const freq24 = countFreq(last24);
        const freqPrev = countFreq(prev24);

        return Object.entries(freq24)
            .filter(([, n]) => n >= MIN_ARTICLES) // only topics with strong clustering
            .map(([word, current]) => {
                const previous = freqPrev[word] || 0;
                const delta = previous > 0 ? ((current - previous) / previous) : 1;
                return { word, current, previous, delta };
            })
            .sort((a, b) => b.current - a.current)
            .slice(0, 8);
    }, [recentItems]);

    // Hide entirely if no topics meet the quality threshold
    if (!topics.length) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-800">
                <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Trending Topics</h2>
                <span className="text-xs text-stone-600 ml-auto">≥{MIN_ARTICLES} articles · last 24h</span>
            </div>
            <div className="flex flex-wrap gap-2 p-4">
                {topics.map(({ word, current, delta }) => {
                    const isUp = delta > 0.2;
                    const isDown = delta < -0.2;
                    return (
                        <div
                            key={word}
                            className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 px-3 py-1.5 hover:border-stone-600 transition-colors"
                        >
                            <span className="text-sm font-medium text-stone-200 capitalize">{word}</span>
                            <span className="text-xs text-stone-500 font-mono">{current}</span>
                            {isUp && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                            {isDown && <TrendingDown className="w-3 h-3 text-red-400" />}
                            {!isUp && !isDown && <Minus className="w-3 h-3 text-stone-600" />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}