import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Aggressive stopwords — includes all HTML/CSS artifacts + common web noise
const STOP_WORDS = new Set([
    // Common English
    'the','and','for','that','this','with','from','have','been','will','are','was','were','not','but',
    'they','their','them','what','when','where','which','who','how','can','could','would','should',
    'more','also','than','into','over','about','just','your','our','its','has','had','said','news',
    'after','before','under','each','between','other','some','very','most','such','even','only','while',
    'there','here','time','year','make','like','know','take','need','used','says','new','report',
    'share','data','week','month','show','says','amid','first','plan','million','billion',
    // HTML / CSS artifact terms — the main offenders
    'https','http','class','style','width','height','margin','padding','border','float','clear',
    'color','font','image','images','block','inline','display','position','relative','absolute',
    'background','opacity','table','tbody','thead','tbody','thead','tfoot','colspan','rowspan',
    'align','valign','thead','tbody','href','attr','span','nbsp','html','body','head','meta','link',
    'script','noscript','iframe','button','input','label','select','option','textarea','form',
    // CSS values / units
    'pixel','pixels','solid','dashed','dotted','auto','none','flex','grid','hidden','visible','scroll',
    // Generic web/article noise
    'click','read','more','full','article','story','source','content','loading','search','view',
    'click','login','signup','subscribe','follow','share','like','comment','reply','posted',
    'updated','published','author','editor','staff','media','press','outlet','wire',
    // Generic numbers / short terms already caught by length filter
    'said','says','will','would','could','should','have','been','were','this','that','from','with',
]);

// A topic must also be a real-world term — not look like a code artifact or CSS property
// Reject terms that look like: camelCase tokens, hex codes, url fragments, css-like patterns
const ARTIFACT_RE = /^(https?|www|com|org|net|edu|gov|px|em|rem|rgb|rgba|url|src|alt|rel|id|var|let|const|def|div|img|nav|svg|xml|json|css|html|php|asp|jsx|tsx|null|true|false|undefined)$/i;

// Only allow topics that look like real English words/phrases used in editorial content
const VALID_TOPIC_RE = /^[a-z][a-z]+$/; // lowercase letters only, min natural word

const MIN_ARTICLES = 4; // higher bar — only show if 4+ articles mention this term

function extractKeywords(text) {
    return text
        .toLowerCase()
        // Strip HTML tags fully
        .replace(/<[^>]+>/g, ' ')
        // Strip URLs
        .replace(/https?:\/\/\S+/g, ' ')
        // Strip CSS-like patterns (property: value)
        .replace(/[a-z-]+\s*:\s*[^;,\n]+[;,]/g, ' ')
        // Strip numbers, punctuation
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(w =>
            w.length > 4 &&
            w.length < 20 &&
            VALID_TOPIC_RE.test(w) &&
            !STOP_WORDS.has(w) &&
            !ARTIFACT_RE.test(w)
        );
}

// Final quality gate: reject the whole module if top terms look like artifacts
const QUALITY_BLOCKLIST = new Set([
    'https','width','class','margin','images','float','style','height','color','border',
    'padding','display','position','background','opacity','inline','block','script',
    'noscript','iframe','button','input','label','select','option','textarea','form',
]);

function topicsLookClean(topics) {
    // If any of the top-5 topics are in the blocklist, the data is dirty — hide the module
    return !topics.slice(0, 5).some(t => QUALITY_BLOCKLIST.has(t.word));
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
                // Only use title + ai_summary, not full description (which may contain HTML)
                const text = (item.title || '') + ' ' + (item.ai_summary || '');
                const words = extractKeywords(text);
                const unique = [...new Set(words)];
                unique.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
            });
            return freq;
        };

        const freq24 = countFreq(last24);
        const freqPrev = countFreq(prev24);

        const candidates = Object.entries(freq24)
            .filter(([, n]) => n >= MIN_ARTICLES)
            .map(([word, current]) => {
                const previous = freqPrev[word] || 0;
                const delta = previous > 0 ? ((current - previous) / previous) : 1;
                return { word, current, previous, delta };
            })
            .sort((a, b) => b.current - a.current)
            .slice(0, 8);

        // Quality gate — hide if data looks dirty
        if (!topicsLookClean(candidates)) return [];

        return candidates;
    }, [recentItems]);

    // Hide entirely if no quality topics
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