import React from 'react';
import { Sun, FileText, Inbox, Rss, Search, MailPlus, Bookmark } from 'lucide-react';
import { LogoMark, MicroLabel, SignalPill } from '@/components/brand/Brand';
import { cn } from '@/lib/utils';

// Example content only. Outlet names are invented.
const NAV = [
  { name: 'Today', icon: Sun, active: true },
  { name: 'Briefings', icon: FileText },
  { name: 'Inbox', icon: Inbox, badge: '3' },
  { name: 'Sources', icon: Rss },
  { name: 'Search', icon: Search },
  { name: 'Newsletters', icon: MailPlus },
];

const STORIES = [
  {
    title: 'Ten-year yield falls 18 bps after a soft payroll print',
    summary: 'Lower long rates reopen refinancing math on deals that stalled in the spring. Four of your sources lead with it.',
    meta: ['Harbor Ledger', '2h ago', '4 sources'],
    level: 'high',
  },
  {
    title: 'Multifamily starts down 22% year over year across the Northeast',
    summary: 'Fewer deliveries in 2028 support rent growth for stabilised assets in supply-constrained metros.',
    meta: ['Metro Property Journal', '5h ago', 'Rising'],
    level: 'high',
  },
  {
    title: 'Regional lender tightens covenants on new construction loans',
    summary: 'Debt service coverage floor moves to 1.30x. Expect slower draws on projects already in lease-up.',
    meta: ['Northline Wire', '7h ago'],
    level: 'med',
  },
];

function WindowDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
      <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
      <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
    </div>
  );
}

/**
 * A faithful, static rendering of the Today view, built from the same classes as the app.
 * Decorative: hidden from assistive tech, with a text label provided by the caller.
 */
export default function ProductPreview({ className }) {
  return (
    <div className={cn('panel overflow-hidden bg-[#100E17]/85 text-left', className)} aria-hidden="true">
      {/* Window bar */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <WindowDots />
        <div className="min-w-0 flex-1 truncate text-center font-mono text-[10.5px] text-stone-500">mergerss / today</div>
        <span className="hidden font-mono text-[10px] text-stone-600 sm:inline">7:02 AM</span>
      </div>

      <div className="flex gap-3 p-3">
        {/* Floating sidebar */}
        <div className="panel hidden w-[150px] flex-shrink-0 flex-col bg-[#120F1A]/90 p-2 sm:flex">
          <div className="flex items-center gap-2 px-2 pb-3 pt-2">
            <LogoMark size="sm" />
            <span className="font-display text-[13px] font-semibold text-stone-100">MergeRSS</span>
          </div>
          <MicroLabel className="px-2 pb-1.5 text-[9px]">Workspace</MicroLabel>
          <div className="space-y-0.5">
            {NAV.map((item) => (
              <div
                key={item.name}
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-[12px]',
                  item.active ? 'border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.16)] text-stone-100' : 'text-stone-400'
                )}
              >
                <item.icon className={cn('h-3.5 w-3.5 flex-shrink-0', item.active ? 'text-stone-100' : 'text-stone-500')} />
                <span className="flex-1">{item.name}</span>
                {item.badge && <span className="font-mono text-[10px] text-emerald-300">{item.badge}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Today view */}
        <div className="min-w-0 flex-1 p-1 sm:p-2">
          <p className="font-display text-lg font-semibold leading-tight tracking-tight text-stone-100 sm:text-xl">Good morning, Alex</p>
          <p className="mt-0.5 text-[12px] text-stone-400">Thursday, October 1</p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="panel-accent min-w-0 p-3">
              <MicroLabel className="mb-1 text-[9px] text-brand-light">Next briefing</MicroLabel>
              <p className="truncate font-display text-sm font-semibold text-stone-100">Tomorrow, 7:00 AM</p>
              <p className="mt-0.5 truncate text-[11px] text-stone-400">Markets desk · email · Slack</p>
            </div>
            <div className="panel min-w-0 p-3">
              <MicroLabel className="mb-1 text-[9px]">Last briefing</MicroLabel>
              <p className="truncate font-display text-sm font-semibold text-stone-100">Markets desk</p>
              <p className="mt-0.5 truncate text-[11px] text-stone-400">2h ago · 12 stories</p>
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-2">
            <p className="font-display text-[13px] font-semibold text-stone-100">Most important today</p>
            <span className="hidden font-mono text-[10px] text-stone-500 sm:inline">Lens · CRE capital</span>
          </div>

          <ol className="mt-2 space-y-1.5">
            {STORIES.map((s, i) => (
              <li key={s.title} className="panel flex items-start gap-3 px-3 py-2.5">
                <span
                  className={cn(
                    'w-5 flex-shrink-0 text-right font-display text-xl font-semibold leading-none tabular-nums',
                    i === 0 ? 'text-[hsl(var(--brand))]' : 'text-stone-500'
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-stone-100">{s.title}</p>
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stone-600" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-stone-400">{s.summary}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <SignalPill level={s.level} className="px-1.5 text-[9px]" />
                    <span className="meta min-w-0 truncate text-[9.5px]">{s.meta.join(' · ')}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
