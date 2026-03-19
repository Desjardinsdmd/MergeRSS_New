import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { buildNarratives } from './storyMemory';
import { clusterItems } from './intelligenceUtils';

// Narrative-level insight summaries — mini analyst takes, not grouped tags
const NARRATIVE_SUMMARIES = {
    'Interest Rate Pressure':       'Rising rates are continuing to constrain refinancing and suppress development activity — expect prolonged pressure on leveraged positions.',
    'Capital Markets Activity':     'Deal flow is recovering selectively — capital is chasing quality, not breadth, which signals risk appetite is rebuilding cautiously.',
    'Real Estate Dynamics':         'Institutional positioning in real estate is shifting — select segments are attracting fresh capital while distressed assets remain sidelined.',
    'AI & Technology Shift':        'AI adoption is accelerating faster than incumbents can adapt — watch for margin compression and forced strategic pivots in the near term.',
    'Regulatory & Policy Pressure': 'Regulatory tightening is broad and structural — businesses without proactive compliance postures face outsized operational risk.',
    'Energy & Commodities':         'Energy cost volatility is feeding directly into inflation and operating margins — this is becoming a systemic constraint, not a cyclical blip.',
    'Credit & Banking Risk':        'Credit conditions are tightening at the source — lending pullback will slow growth faster than rate signals alone suggest.',
    'Labor & Employment':           'Labor cost pressure is being met with targeted cuts — watch for second-order effects on consumer demand and sector margin recovery timelines.',
    'Geopolitical Tensions':        'Geopolitical friction is compressing risk premiums and disrupting established supply chains — capital reallocation is already underway.',
    'Crypto & Digital Assets':      'Crypto markets are responding to macro signals with unusual coordination — institutional positioning is the tell to watch.',
};

export default function NarrativeGrouping({ items = [], feeds = [] }) {
    const [expanded, setExpanded] = useState(null);
    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));

    const narratives = useMemo(() => {
        if (!items.length) return [];
        const clusters = clusterItems(items, feedMap);
        const filtered = clusters.filter(c => (c.primary.importance_score ?? 0) >= 40);
        return buildNarratives(filtered);
    }, [items, feeds]);

    if (!narratives.length) return null;

    return (
        <div className="bg-stone-900 border border-stone-800">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-stone-800">
                <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Key Narratives</h2>
                <span className="text-xs text-stone-600 ml-auto">{narratives.length} active theme{narratives.length > 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-stone-800/60">
                {narratives.map(({ label, stories, count }) => {
                    const isOpen = expanded === label;
                    const summary = NARRATIVE_SUMMARIES[label] || `${label} is emerging as a cross-source signal worth monitoring closely.`;

                    return (
                        <div key={label}>
                            <button
                                onClick={() => setExpanded(isOpen ? null : label)}
                                className="w-full px-5 py-4 flex items-start gap-3 hover:bg-stone-800/30 transition-colors text-left"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-sm font-bold text-stone-100">{label}</span>
                                        <span className="text-[10px] text-stone-500 bg-stone-800 border border-stone-700 px-1.5 py-0.5 flex-shrink-0">
                                            {count} {count === 1 ? 'story' : 'stories'}
                                        </span>
                                    </div>
                                    {/* Narrative-level insight summary */}
                                    <p className="text-xs text-stone-400 leading-relaxed line-clamp-2">{summary}</p>
                                </div>
                                <span className="text-stone-600 flex-shrink-0 mt-1">
                                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </span>
                            </button>

                            {isOpen && (
                                <div className="px-5 pb-4 pt-1 space-y-2 bg-stone-950/40 border-t border-stone-800/50">
                                    <p className="text-xs text-stone-600 uppercase tracking-wider mb-2">Contributing stories</p>
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