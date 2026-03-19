import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Rss, Bookmark, Inbox, Zap, ChevronRight, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { decisionState, confidenceFromCluster, generateInsight, inferTag } from './intelligenceUtils';

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
            className="block group py-2.5 border-b border-stone-800/60 last:border-0"
        >
            {/* Decision + Confidence badges */}
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 border ${decision.style}`}>
                    {decision.label}
                </span>
                <span className={`inline-flex items-center gap-1 text-[9px] ${confidence.class}`}>
                    <span className={`w-1 h-1 rounded-full inline-block ${confidence.dot}`} />
                    {confidence.label}
                </span>
                {item.published_date && (
                    <span className="text-[9px] text-stone-700 ml-auto">
                        {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                    </span>
                )}
            </div>

            {/* Headline */}
            <p className="text-xs text-stone-300 leading-snug line-clamp-1 group-hover:text-[hsl(var(--primary))] transition-colors mb-1">
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
            <div className="bg-stone-900 border border-stone-800 p-4">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Today at a Glance</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-stone-400">
                            <Rss className="w-3.5 h-3.5 text-stone-600" />
                            New today
                        </div>
                        <span className="text-sm font-bold text-stone-100">{stats.newToday ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <Link to={createPageUrl('Inbox')} className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 transition">
                            <Inbox className="w-3.5 h-3.5 text-stone-600" />
                            Unread digests
                        </Link>
                        <span className="text-sm font-bold text-stone-100">{stats.unreadDigests ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <Link to={createPageUrl('Bookmarks')} className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 transition">
                            <Bookmark className="w-3.5 h-3.5 text-stone-600" />
                            Saved
                        </Link>
                        <span className="text-sm font-bold text-stone-100">{stats.savedCount ?? 0}</span>
                    </div>
                </div>
            </div>

            {/* High Signal — upgraded intelligence list */}
            {highImportanceItems.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                        <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">High Signal</h3>
                        <span className="text-[9px] text-stone-600 ml-auto">{highImportanceItems.slice(0, 5).length} items</span>
                    </div>
                    <div>
                        {highImportanceItems.slice(0, 5).map(item => (
                            <HighSignalItem key={item.id} item={item} />
                        ))}
                    </div>
                </div>
            )}

            {/* Digests */}
            <div className="bg-stone-900 border border-stone-800 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Your Digests</h3>
                    <Link to={createPageUrl('Digests')} className="text-[10px] text-stone-600 hover:text-[hsl(var(--primary))] transition">
                        Manage →
                    </Link>
                </div>
                {digests.length === 0 ? (
                    <Link to={createPageUrl('Digests')} className="flex items-center gap-2 text-xs text-stone-600 hover:text-stone-400 transition">
                        <FileText className="w-3.5 h-3.5" />
                        Create your first digest
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
                                    <FileText className="w-3.5 h-3.5 text-stone-600 flex-shrink-0" />
                                    <span className="text-xs text-stone-400 group-hover:text-stone-200 transition truncate">
                                        {digest.name}
                                    </span>
                                </div>
                                <span className="text-[10px] text-stone-600 flex-shrink-0 ml-2 capitalize">{digest.frequency}</span>
                            </Link>
                        ))}
                        {digests.length > 6 && (
                            <Link to={createPageUrl('Digests')} className="text-[10px] text-stone-600 hover:text-stone-400 transition">
                                +{digests.length - 6} more
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}