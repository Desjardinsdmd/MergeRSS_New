import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { X, Zap, Link2, Search, Globe, Sparkles, Lightbulb, ChevronRight } from 'lucide-react';

const TIPS = [
  {
    id: 'ai_curator',
    icon: Zap,
    title: 'Try the AI Curator',
    description: 'Let AI discover and recommend new sources tailored to your interests — no manual searching required.',
    cta: 'Open AI Curator',
    href: 'FeedCurator',
    color: 'text-brand-light',
    bg: 'bg-[hsl(var(--brand)/0.14)]',
    condition: (ctx) => ctx.feedCount >= 1,
  },
  {
    id: 'create_digest',
    icon: Sparkles,
    title: 'Create your first briefing',
    description: 'Turn your sources into a scheduled AI summary delivered to Slack, Discord, email or your inbox.',
    cta: 'Create briefing',
    href: 'Digests',
    color: 'text-brand-light',
    bg: 'bg-[hsl(var(--brand)/0.14)]',
    condition: (ctx) => ctx.feedCount >= 1 && ctx.digestCount === 0,
  },
  {
    id: 'slack_connect',
    icon: Link2,
    title: 'Send briefings to Slack',
    description: 'Connect Slack to automatically push your briefings to a channel — no more checking the inbox.',
    cta: 'Connect Slack',
    href: 'Integrations',
    color: 'text-brand-light',
    bg: 'bg-[hsl(var(--brand)/0.14)]',
    condition: (ctx) => ctx.digestCount >= 1 && !ctx.hasSlack,
  },
  {
    id: 'article_search',
    icon: Search,
    title: 'Search across all stories',
    description: 'Use Search to find any story from your sources by keyword, category or author.',
    cta: 'Search stories',
    href: 'ArticleSearch',
    color: 'text-brand-light',
    bg: 'bg-[hsl(var(--brand)/0.14)]',
    condition: (ctx) => ctx.feedCount >= 2,
  },
  {
    id: 'directory',
    icon: Globe,
    title: 'Discover curated sources',
    description: 'Browse the public source directory to add popular sources in finance, tech, crypto, CRE and more.',
    cta: 'Browse Directory',
    href: 'Directory',
    color: 'text-brand-light',
    bg: 'bg-[hsl(var(--brand)/0.14)]',
    condition: (ctx) => ctx.feedCount >= 1,
  },
];

const FIRST_VISIT_KEY = 'mergerss_tips_shown';
const DISMISSED_KEY = 'mergerss_dismissed_tips';

export default function ContextualTips({ feedCount, digestCount, hasSlack }) {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(FIRST_VISIT_KEY); } catch { return false; }
  });

  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
  });

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  const closeAll = () => {
    localStorage.setItem(FIRST_VISIT_KEY, '1');
    setOpen(false);
  };

  const ctx = { feedCount, digestCount, hasSlack };
  const visible = TIPS.filter(t => !dismissed.includes(t.id) && t.condition(ctx));

  if (!open || !visible.length) return null;

  const tip = visible[0];
  const Icon = tip.icon;

  return (
    <div className="panel fixed top-20 right-4 z-50 w-80 bg-stone-900/95 shadow-2xl shadow-black/60 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
          <span className="micro-label">Tip</span>
          {visible.length > 1 && (
            <span className="font-mono text-[10px] text-stone-600 ml-1">{visible.length} remaining</span>
          )}
        </div>
        <button onClick={closeAll} aria-label="Close tips" className="rounded-lg p-1 text-stone-500 hover:text-stone-300 transition">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tip content */}
      <div className="p-4">
        <div className={`inline-flex rounded-xl p-2 mb-3 ${tip.bg}`}>
          <Icon className={`w-4 h-4 ${tip.color}`} />
        </div>
        <p className="font-display text-sm font-semibold text-stone-100 mb-1">{tip.title}</p>
        <p className="text-xs text-stone-400 leading-relaxed mb-4">{tip.description}</p>
        <div className="flex items-center gap-2">
          <Link
            to={createPageUrl(tip.href)}
            onClick={closeAll}
            className="btn-soft text-xs"
          >
            {tip.cta}
            <ChevronRight className="w-3 h-3" />
          </Link>
          {visible.length > 1 && (
            <button
              onClick={() => dismiss(tip.id)}
              className="rounded-xl text-xs text-stone-500 hover:text-stone-300 transition px-2 py-1.5"
            >
              Next tip →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}