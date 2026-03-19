import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { buildNarratives } from './storyMemory';
import { clusterItems } from './intelligenceUtils';

export default function NarrativeGrouping({ items = [], feeds = [] }) {
    const [expanded, setExpanded] = useState(null);
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const narratives = useMemo(() => {
        if (!items.length) return [];
        const clusters = clusterItems(items, feedMap);
        // Only include clusters with meaningful signal
        const filtered = clusters.filter(c => (c.primary.importance_score ?? 0) >= 40);
        return buildNarratives(filtered);
    }, [items, feeds]);

    if (!narratives.length) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-stone-800">
                <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Key Narratives Today</h2>
                <span className="text-xs text-stone-600 ml-auto">cross-story themes</span>
            </div>
            <div className="divide-y divide-stone-800/60">
                {narratives.map(({ label, stories, count }) => {
                    const isOpen = expanded === label;
                    const topStory = stories[0]?.primary;

                    return (
                        <div key={label}>
                            <button
                                onClick={() => setExpanded(isOpen ? null : label)}
                                className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-stone-800/30 transition-colors text-left"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-sm font-semibold text-stone-100">{label}</span>
                                        <span className="text-[10px] text-stone-500 bg-stone-800 border border-stone-700 px-1.5 py-0.5">
                                            {count} {count === 1 ? 'story' : 'stories'}
                                        </span>
                                    </div>
                                    {topStory && (
                                        <p className="text-xs text-stone-500 line-clamp-1">
                                            Latest: {decodeHtml(topStory.title)}
                                        </p>
                                    )}
                                </div>
                                <span className="text-stone-600 flex-shrink-0">
                                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </span>
                            </button>

                            {isOpen && (
                                <div className="px-5 pb-3 pt-1 space-y-2 bg-stone-950/30">
                                    {stories.map(cluster => (
                                        <a
                                            key={cluster.primary.id}
                                            href={safeUrl(cluster.primary.url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-2 group"
                                        >
                                            <span className="w-1 h-1 rounded-full bg-stone-600 flex-shrink-0 mt-1.5" />
                                            <span className="text-xs text-stone-400 group-hover:text-stone-200 transition line-clamp-1 flex-1">
                                                {decodeHtml(cluster.primary.title)}
                                                {cluster.clusterSize > 1 && (
                                                    <span className="text-stone-600 ml-1">· {cluster.clusterSize} sources</span>
                                                )}
                                            </span>
                                            <ExternalLink className="w-2.5 h-2.5 text-stone-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}