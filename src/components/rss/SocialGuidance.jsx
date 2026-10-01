import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';

export default function SocialGuidance({ error, guidance, platform }) {
    const btn = 'mt-2 inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 px-3 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/15';
    return (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-5" role="alert">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" aria-hidden="true" />
                <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-300">
                        {platform} requires authenticated API access
                    </p>
                    <p className="text-sm leading-relaxed text-amber-200/80">{guidance}</p>
                    {platform === 'YouTube' && (
                        <button type="button" className={btn}
                            onClick={() => window.open('https://studio.youtube.com', '_blank')}>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Open YouTube Studio
                        </button>
                    )}
                    {(platform === 'Twitter/X') && (
                        <button type="button" className={btn}
                            onClick={() => window.open('https://developer.twitter.com', '_blank')}>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Twitter Developer Portal
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
