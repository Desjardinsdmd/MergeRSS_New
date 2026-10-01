import React from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
    'Validating URL',
    'Checking for existing RSS feed',
    'Probing common RSS feed paths',
    'Extracting page content',
    'Building RSS 2.0',
];

export default function GenerateProgress({ step }) {
    const current = Math.min(step, STEPS.length - 1);
    return (
        <div className="space-y-2.5 py-2" role="status" aria-live="polite">
            {STEPS.map((label, i) => {
                const done = i < step;
                const active = i === current && step < STEPS.length;
                return (
                    <div key={i} className={cn('flex items-center gap-3 text-sm transition-all', done ? 'text-stone-400' : active ? 'font-medium text-stone-100' : 'text-stone-600')}>
                        {done ? (
                            <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-400" aria-hidden="true" />
                        ) : active ? (
                            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[hsl(var(--primary))]" aria-hidden="true" />
                        ) : (
                            <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-white/10" />
                        )}
                        {label}
                    </div>
                );
            })}
        </div>
    );
}
