import React from 'react';
import { ExternalLink, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { MicroLabel } from '@/components/brand/Brand';

import { safeUrl } from '@/components/utils/htmlUtils';
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
        <div className="panel p-5">
            <MicroLabel as="h3" className="mb-3">
                RSS feed preview · {Math.min(items.length, 10)} of {items.length} stories
            </MicroLabel>
            <div className="divide-y divide-white/[0.05]">
                {items.slice(0, 10).map((item, i) => (
                    <div key={i} className="py-3 first:pt-0 last:pb-0">
                        <a
                            href={safeUrl(item.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group block"
                        >
                            <div className="flex items-start gap-3">
                                <span className={`mt-0.5 w-6 flex-shrink-0 select-none font-display text-base font-semibold tabular-nums ${i === 0 ? 'text-[hsl(var(--primary))]' : 'text-stone-500'}`}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="line-clamp-1 text-sm font-semibold leading-snug text-stone-100 transition-colors group-hover:text-[#C4A5FD]">
                                        {item.title}
                                    </p>
                                    {(item.pubDate || item.author) && (
                                        <div className="meta mt-1 flex flex-wrap items-center gap-3">
                                            {item.pubDate && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" aria-hidden="true" />
                                                    {safeDate(item.pubDate) || item.pubDate}
                                                </span>
                                            )}
                                            {item.author && (
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3 w-3" aria-hidden="true" />
                                                    {item.author}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {item.description && (
                                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-stone-400">
                                            {item.description}
                                        </p>
                                    )}
                                </div>
                                <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stone-500 transition-colors group-hover:text-[#C4A5FD]" aria-hidden="true" />
                            </div>
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );
}
