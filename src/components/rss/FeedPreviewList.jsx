import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';

function safeDate(str) {
    if (!str) return null;
    try {
        const d = new Date(str);
        if (isNaN(d.getTime())) return null;
        return format(d, 'MMM d, yyyy');
    } catch { return null; }
}

export default function FeedPreviewList({ items }) {
    if (!items?.length) return null;

    return (
        <Card className="border-slate-100">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">
                    Feed Preview — {Math.min(items.length, 10)} of {items.length} items
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="divide-y divide-slate-50">
                    {items.slice(0, 10).map((item, i) => (
                        <div key={i} className="py-3 first:pt-0 last:pb-0">
                            <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group block"
                            >
                                <div className="flex items-start gap-2">
                                    <span className="text-xs text-slate-300 mt-0.5 w-5 flex-shrink-0 font-mono select-none">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1 leading-snug">
                                            {item.title}
                                        </p>
                                        {(item.pubDate || item.author) && (
                                            <div className="flex flex-wrap items-center gap-3 mt-1">
                                                {item.pubDate && (
                                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                                        <Calendar className="w-3 h-3" />
                                                        {safeDate(item.pubDate) || item.pubDate}
                                                    </span>
                                                )}
                                                {item.author && (
                                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                                        <User className="w-3 h-3" />
                                                        {item.author}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {item.description && (
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                                {item.description}
                                            </p>
                                        )}
                                    </div>
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" />
                                </div>
                            </a>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}