import React from 'react';
import { Rss } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MergeRSS brand primitives (design system v3, see BRAND.md).
 * Use these instead of hand-rolling logos, page headers, panels and labels so every
 * surface stays in sync.
 */

const MARK_SIZES = {
  sm: { box: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5' },
  md: { box: 'w-9 h-9', icon: 'w-4 h-4' },
  lg: { box: 'w-11 h-11', icon: 'w-5 h-5' },
};

export function LogoMark({ size = 'md', className }) {
  const s = MARK_SIZES[size] || MARK_SIZES.md;
  return (
    <span className={cn('logo-mark flex-shrink-0', s.box, className)} aria-hidden="true">
      <Rss className={cn(s.icon, 'text-white')} strokeWidth={2.5} />
    </span>
  );
}

/** Logo lockup: mark, wordmark, optional "briefing studio" tagline in mono. */
export function Logo({ size = 'md', tagline = true, className }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className={cn('font-display font-semibold tracking-tight text-stone-100', size === 'lg' ? 'text-lg' : 'text-[15px]')}>
          MergeRSS
        </span>
        {tagline && <span className="mt-1 font-mono text-[11px] text-stone-500">briefing studio</span>}
      </span>
    </span>
  );
}

/** Page title + subtitle, optional right-side actions. */
export function PageHeader({ title, subtitle, actions, eyebrow, className }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-stone-100">{title}</h1>
        {subtitle && <div className="mt-1 text-[15px] text-stone-400">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MicroLabel({ children, className, as: Tag = 'p' }) {
  return <Tag className={cn('micro-label', className)}>{children}</Tag>;
}

export function Panel({ children, className, accent = false, hover = false, as: Tag = 'div', ...rest }) {
  return (
    <Tag className={cn(accent ? 'panel-accent' : 'panel', hover && 'panel-hover', className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Small mono chip for categories and tags. */
export function Chip({ children, tone = 'brand', className }) {
  return <span className={cn(tone === 'brand' ? 'chip-brand' : 'chip-neutral', className)}>{children}</span>;
}

/** Signal / importance pill: HIGH (emerald), MED (neutral), LOW (faint). */
export function SignalPill({ level = 'med', className }) {
  const map = {
    high: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    med: 'border-white/15 bg-white/[0.03] text-stone-300',
    low: 'border-white/10 text-stone-500',
  };
  return (
    <span className={cn('inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', map[level] || map.med, className)}>
      {level === 'med' ? 'Med' : level}
    </span>
  );
}

/** Product vocabulary. Use these labels everywhere (UI, email, PDF, Slack). */
export const TERMS = {
  briefing: 'Briefing',
  briefings: 'Briefings',
  source: 'Source',
  sources: 'Sources',
  story: 'Story',
  stories: 'Stories',
  report: 'Report',
  tagline: 'briefing studio',
};
