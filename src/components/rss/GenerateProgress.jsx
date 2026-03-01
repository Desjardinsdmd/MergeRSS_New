import React from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
    'Validating URL',
    'Checking for existing feed',
    'Probing common feed paths',
    'Extracting page content',
    'Building RSS 2.0',
];

export default function GenerateProgress({ step }) {
    const current = Math.min(step, STEPS.length - 1);
    return (
        <div className="space-y-2.5 py-2">
            {STEPS.map((label, i) => {
                const done = i < step;
                const active = i === current && step < STEPS.length;
                return (
                    <div key={i} className={cn("flex items-center gap-3 text-sm transition-all", done ? 'text-slate-500' : active ? 'text-slate-900 font-medium' : 'text-slate-300')}>
                        {done ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : active ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
                        ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                        )}
                        {label}
                    </div>
                );
            })}
        </div>
    );
}