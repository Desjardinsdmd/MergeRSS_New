import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Rss, Bookmark, Inbox, AlertTriangle, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';

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

            {/* High Importance Alerts */}
            {highImportanceItems.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">High Signal</h3>
                    </div>
                    <div className="space-y-3">
                        {highImportanceItems.slice(0, 4).map(item => (
                            <a
                                key={item.id}
                                href={safeUrl(item.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block group"
                            >
                                <p className="text-xs text-stone-300 leading-snug line-clamp-2 group-hover:text-[hsl(var(--primary))] transition-colors">
                                    {decodeHtml(item.title)}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1">
                                    {item.importance_score != null && (
                                        <span className="text-[10px] text-red-500 font-bold">{item.importance_score}</span>
                                    )}
                                    {item.intelligence_tag === 'Risk' && (
                                        <span className="text-[10px] text-red-400">Risk</span>
                                    )}
                                    {item.published_date && (
                                        <span className="text-[10px] text-stone-600">
                                            {formatDistanceToNow(new Date(item.published_date), { addSuffix: true })}
                                        </span>
                                    )}
                                </div>
                            </a>
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