import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Rss, Bookmark, Inbox, Zap, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { decisionState, confidenceFromCluster, generateInsight, inferTag } from './intelligenceUtils';
import { MicroLabel } from '@/components/brand/Brand';

function HighSignalItem({ item }) {
    const clusterSize = item._clusterSize ?? 1;
    const decision = decisionState(item, clusterSize);
    const confidence = confidenceFromCluster(clusterSize);
    const insight = generateInsight(item);
    const tag = item.intelligence_tag || inferTag((item.title || '') + ' ' + (item.description || ''));

    // Only use specific insights — skip generic fallbacks
    const isGenericInsight = !insight ||
        insight.startsWith('Downside signal') ||
        insight.startsWith('Upside signal') ||
        insight.startsWith('Broad coverage');

    return (
        <a
            href={safeUrl(item.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="group block border-b border-white/[0.05] py-2.5 last:border-0"
        >
            {/* Decision + Confidence badges */}
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 border ${decision.style}`}>
                    {decision.label}
                </span>
                <span className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${confidence.class}`}>
                    <span className={`w-1 h-1 rounded-full inline-block ${confidence.dot}`} />
                    {confidence.label}
                </span>
                {item.published_date && (
                    <span className="ml-auto font-mono text-[9px] text-stone-500">
                        {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                    </span>
                )}
            </div>

            {/* Headline */}
            <p className="mb-1 line-clamp-1 text-[13px] font-semibold leading-snug text-stone-100 transition-colors group-hover:text-[#C4A5FD]">
                {decodeHtml(item.title)}
            </p>

            {/* Specific insight only */}
            {!isGenericInsight && (
                <p className={`text-[10px] leading-snug line-clamp-1 ${
                    tag === 'Risk' ? 'text-red-400/70' :
                    tag === 'Opportunity' ? 'text-emerald-400/70' :
                    'text-stone-500'
                }`}>↳ {insight}</p>
            )}
        </a>
    );
}

export default function IntelligenceSidebar({ digests = [], stats = {}, highImportanceItems = [] }) {
    return (
        <div className="space-y-4">
            {/* Quick Stats */}
            <div className="panel p-4">
                <MicroLabel as="h3" className="mb-3">Today at a glance</MicroLabel>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-stone-400">
                            <Rss className="w-3.5 h-3.5 text-stone-500" />
                            New today
                        </div>
                        <span className="font-display text-base font-semibold tabular-nums text-stone-100">{stats.newToday ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <Link to={createPageUrl('Inbox')} className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 transition">
                            <Inbox className="w-3.5 h-3.5 text-stone-500" />
                            Unread briefings
                        </Link>
                        <span className="font-display text-base font-semibold tabular-nums text-stone-100">{stats.unreadDigests ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <Link to={createPageUrl('Bookmarks')} className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 transition">
                            <Bookmark className="w-3.5 h-3.5 text-stone-500" />
                            Saved
                        </Link>
                        <span className="font-display text-base font-semibold tabular-nums text-stone-100">{stats.savedCount ?? 0}</span>
                    </div>
                </div>
            </div>

            {/* High Signal — upgraded intelligence list */}
            {highImportanceItems.length > 0 && (
                <div className="panel p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                        <MicroLabel as="h3">High signal</MicroLabel>
                        <span className="meta ml-auto">{highImportanceItems.slice(0, 5).length} stories</span>
                    </div>
                    <div>
                        {highImportanceItems.slice(0, 5).map(item => (
                            <HighSignalItem key={item.id} item={item} />
                        ))}
                    </div>
                </div>
            )}

            {/* Digests */}
            <div className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                    <MicroLabel as="h3">Your briefings</MicroLabel>
                    <Link to={createPageUrl('Digests')} className="font-mono text-[10px] uppercase tracking-wider text-[#C4A5FD] transition hover:opacity-80">
                        Manage →
                    </Link>
                </div>
                {digests.length === 0 ? (
                    <Link to={createPageUrl('Digests')} className="flex items-center gap-2 text-xs text-stone-400 transition hover:text-[#C4A5FD]">
                        <FileText className="w-3.5 h-3.5" />
                        Create your first briefing
                        <ChevronRight className="w-3 h-3 ml-auto" />
                    </Link>
                ) : (
                    <div className="space-y-2">
                        {digests.slice(0, 6).map(digest => (
                            <Link
                                key={digest.id}
                                to={createPageUrl('Digests')}
                                className="flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                                    <span className="truncate text-xs text-stone-300 transition group-hover:text-stone-100">
                                        {digest.name}
                                    </span>
                                </div>
                                <span className="meta ml-2 flex-shrink-0">{digest.frequency}</span>
                            </Link>
                        ))}
                        {digests.length > 6 && (
                            <Link to={createPageUrl('Digests')} className="font-mono text-[10px] text-stone-500 transition hover:text-stone-300">
                                +{digests.length - 6} more
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}