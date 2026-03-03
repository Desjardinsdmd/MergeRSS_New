import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { X, Zap, Link2, Search, Globe, Sparkles } from 'lucide-react';

const TIPS = [
  {
    id: 'ai_curator',
    icon: Zap,
    title: 'Try the AI Curator',
    description: 'Let AI discover and recommend new feeds tailored to your interests — no manual searching required.',
    cta: 'Open AI Curator',
    href: 'FeedCurator',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    condition: (ctx) => ctx.feedCount >= 1,
  },
  {
    id: 'create_digest',
    icon: Sparkles,
    title: 'Create your first digest',
    description: 'Turn your feeds into a scheduled AI summary delivered to Slack, Discord, email or your inbox.',
    cta: 'Create Digest',
    href: 'Digests',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    condition: (ctx) => ctx.feedCount >= 1 && ctx.digestCount === 0,
  },
  {
    id: 'slack_connect',
    icon: Link2,
    title: 'Send digests to Slack',
    description: 'Connect Slack to automatically push your digests to a channel — no more checking the inbox.',
    cta: 'Connect Slack',
    href: 'Integrations',
    color: 'text-indigo-400',
    bg: 'bg-indigo-400/10',
    condition: (ctx) => ctx.digestCount >= 1 && !ctx.hasSlack,
  },
  {
    id: 'article_search',
    icon: Search,
    title: 'Search across all articles',
    description: 'Use the Article Search to find any story from your feeds by keyword, category or author.',
    cta: 'Search Articles',
    href: 'ArticleSearch',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    condition: (ctx) => ctx.feedCount >= 2,
  },
  {
    id: 'directory',
    icon: Globe,
    title: 'Discover curated feeds',
    description: 'Browse the public feed directory to add popular sources in finance, tech, crypto, CRE and more.',
    cta: 'Browse Directory',
    href: 'Directory',
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    condition: (ctx) => ctx.feedCount >= 1,
  },
];

export default function ContextualTips({ feedCount, digestCount, hasSlack }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mergerss_dismissed_tips') || '[]'); } catch { return []; }
  });

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem('mergerss_dismissed_tips', JSON.stringify(next));
  };

  const ctx = { feedCount, digestCount, hasSlack };
  const visible = TIPS.filter(t => !dismissed.includes(t.id) && t.condition(ctx));

  if (!visible.length) return null;

  // Show only 1 tip at a time (most relevant)
  const tip = visible[0];
  const Icon = tip.icon;

  return (
    <div className={`mb-6 flex items-start gap-4 p-4 border border-stone-800 bg-stone-900 relative group`}>
      <div className={`p-2 flex-shrink-0 ${tip.bg}`}>
        <Icon className={`w-4 h-4 ${tip.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Sparkles className="w-3 h-3 text-stone-600" />
          <span className="text-[10px] font-semibold text-stone-600 uppercase tracking-widest">Tip</span>
        </div>
        <p className="text-sm font-medium text-stone-200">{tip.title}</p>
        <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{tip.description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to={createPageUrl(tip.href)}
          className={`text-xs font-semibold px-3 py-1.5 ${tip.bg} ${tip.color} hover:opacity-80 transition whitespace-nowrap`}
        >
          {tip.cta}
        </Link>
        <button
          onClick={() => dismiss(tip.id)}
          className="p-1 text-stone-700 hover:text-stone-400 transition"
          title="Dismiss tip"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}