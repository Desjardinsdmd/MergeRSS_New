import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  ArrowRight, CheckCircle, MailPlus, SlidersHorizontal, Send, FileText, Users, TrendingUp,
  Mail, Inbox, Hash, MessagesSquare, LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ProductPreview from '@/components/landing/ProductPreview';
import Reveal, { useInView, useCountUp } from '@/components/landing/Reveal';
import SiteFooter from '@/components/landing/SiteFooter';
import { PLAN_LIMITS } from '@/lib/planLimits';

const FREE_SOURCES = Number.isFinite(PLAN_LIMITS?.free?.feeds) ? PLAN_LIMITS.free.feeds : 50;
const FREE_BRIEFINGS = Number.isFinite(PLAN_LIMITS?.free?.digests) ? PLAN_LIMITS.free.digests : 5;

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0910]';

const STEPS = [
  {
    title: 'Add sources',
    desc: 'Paste any site or RSS feed, import an OPML file, or forward newsletters to your private @mergerss.com address.',
  },
  {
    title: 'Set your lens',
    desc: 'Describe your work in a sentence. Every story is scored against it, so the deal that affects you sits above the headline that does not.',
  },
  {
    title: 'Get the briefing',
    desc: 'On the schedule you choose, by email and in your inbox. Premium adds Slack, Discord and Microsoft Teams.',
  },
];

const FEATURES = [
  {
    icon: MailPlus,
    title: 'Newsletter inbox',
    desc: 'Forward the newsletters you already get to a private @mergerss.com address. They are read and ranked with your other sources, and your own inbox stays clear.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Lenses and ranking',
    desc: 'A lens tells MergeRSS what matters to you. Stories close to your lens and covered by several of your sources rise to the top.',
  },
  {
    icon: Send,
    title: 'Delivery channels',
    desc: 'Email and the in-app inbox on every plan. Slack, Discord and Microsoft Teams on Premium and Team.',
  },
  {
    icon: FileText,
    title: 'Reports with PDF export',
    desc: 'Pick a date range and MergeRSS turns those briefings into an intelligence report. Export the PDF for a meeting or a committee pack.',
  },
  {
    icon: Users,
    title: 'Team sharing',
    desc: 'Share sources and briefings across a workspace. Everyone reads the same ranked view, and shared briefings can post to your team channel.',
  },
  {
    icon: TrendingUp,
    title: 'Change over time',
    desc: 'Stories are tracked across days. Rising and falling topics are flagged, so a quiet issue that starts to build gets noticed early.',
  },
];

const CHANNELS = [
  { icon: Mail, name: 'Email' },
  { icon: Inbox, name: 'In-app inbox' },
  { icon: Hash, name: 'Slack' },
  { icon: MessagesSquare, name: 'Discord' },
  { icon: LayoutGrid, name: 'Microsoft Teams' },
];

function Stat({ value, label, delay }) {
  const [ref, inView] = useInView();
  const n = useCountUp(value, inView);
  return (
    <div
      ref={ref}
      className={cn('min-w-0 px-4 py-5 text-center sm:px-6', inView ? 'animate-fade-up' : 'opacity-0')}
      style={inView ? { animationDelay: `${delay}ms` } : undefined}
    >
      <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-stone-100 sm:text-4xl">{n.toLocaleString()}</p>
      <p className="micro-label mt-2">{label}</p>
    </div>
  );
}

function SectionHeader({ eyebrow, title, sub, center = false }) {
  return (
    <Reveal className={cn('mb-10 max-w-2xl', center && 'mx-auto text-center')}>
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h2 className="font-display text-3xl font-semibold leading-tight tracking-[-0.025em] text-stone-100 sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-stone-400">{sub}</p>}
    </Reveal>
  );
}

export default function Landing() {
  const [user, setUser] = React.useState(null);
  const [userLoaded, setUserLoaded] = React.useState(false);
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setUserLoaded(true); }).catch(() => setUserLoaded(true));
  }, []);

  React.useEffect(() => {
    base44.functions.invoke('publicStats', {})
      .then(res => {
        const d = res.data;
        if (d && !d.error) setStats({ users: Number(d.users) || 0, feeds: Number(d.feeds) || 0, digests: Number(d.digests) || 0 });
      })
      .catch(() => {});
  }, []);

  const handleCTA = (location) => {
    base44.analytics.track({ eventName: 'cta_clicked', properties: { location } });
    if (user) window.location.href = createPageUrl('Dashboard');
    else base44.auth.redirectToLogin(createPageUrl('Dashboard'));
  };

  // Only show stats with a real, non-zero value.
  const statItems = stats
    ? [
        { key: 'users', value: stats.users, label: 'Users' },
        { key: 'feeds', value: stats.feeds, label: 'Sources tracked' },
        { key: 'digests', value: stats.digests, label: 'Briefings delivered' },
      ].filter(s => s.value > 0)
    : [];

  return (
    <div className="overflow-x-clip" style={{ colorScheme: 'dark' }}>

      {/* Hero */}
      <section className="relative pb-16 pt-10 sm:pt-16 lg:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="min-w-0">
            <p className="eyebrow mb-5 inline-flex animate-fade-up items-center gap-2">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--brand))] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand))]" />
              </span>
              Briefing studio
            </p>
            <h1 className="animate-fade-up font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] text-stone-100 [animation-delay:60ms] sm:text-5xl lg:text-[60px]">
              Every source you follow, ranked into one{' '}
              <span className="bg-gradient-to-br from-[#C4A5FD] via-[#9B5CF6] to-[#7C3AED] bg-clip-text text-transparent">briefing</span>.
            </h1>
            <p className="mt-6 max-w-lg animate-fade-up text-base leading-relaxed text-stone-400 [animation-delay:120ms] sm:text-[17px]">
              MergeRSS reads your sites, RSS feeds and newsletters, ranks what changed against the work you care about, and delivers a short briefing on your schedule.
            </p>

            <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:180ms]">
              <button type="button" onClick={() => handleCTA('hero')} className={cn('btn-brand group h-11 px-5 text-[15px]', FOCUS)}>
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
              <Link to={createPageUrl('Pricing')} className={cn('btn-ghost h-11 px-5 text-[15px]', FOCUS)}>
                See pricing
              </Link>
            </div>

            <p className="meta mt-5 animate-fade-up [animation-delay:240ms]">
              First briefing in about two minutes · No credit card
            </p>

            {userLoaded && user && (
              <div className="panel-raised mt-6 inline-flex max-w-full flex-wrap items-center gap-2 px-3 py-2 text-xs text-stone-300">
                <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-brand-light" aria-hidden="true" />
                <span className="min-w-0 truncate">Signed in as {user.full_name || user.email}</span>
                <button
                  type="button"
                  onClick={() => handleCTA('hero-logged-in')}
                  className={cn('rounded-sm font-semibold text-brand-light underline underline-offset-2 hover:text-stone-100', FOCUS)}
                >
                  Open Today
                </button>
              </div>
            )}
          </div>

          {/* Product preview */}
          <figure className="relative min-w-0 animate-fade-up [animation-delay:200ms]">
            <div
              className="pointer-events-none absolute -inset-6 animate-glow-pulse rounded-[40px] bg-[radial-gradient(closest-side,hsl(var(--brand)/0.45),transparent)] blur-2xl sm:-inset-10"
              aria-hidden="true"
            />
            <ProductPreview className="relative shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]" />
            <figcaption className="meta mt-3 text-center">Example · the Today view</figcaption>
          </figure>
        </div>
      </section>

      {/* Live stats */}
      {statItems.length > 0 && (
        <section aria-label="MergeRSS in numbers" className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className={cn('panel grid divide-white/[0.06]', statItems.length === 1 ? 'grid-cols-1' : statItems.length === 2 ? 'grid-cols-2 divide-x' : 'grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0')}>
            {statItems.map((s, i) => <Stat key={s.key} value={s.value} label={s.label} delay={i * 80} />)}
          </div>
        </section>
      )}

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 sm:px-6">
        <SectionHeader eyebrow="How it works" title="Three steps to a ranked morning." sub="Set it up once. MergeRSS does the reading from then on." />
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 90} className="panel panel-hover card-hover relative overflow-hidden p-6">
              <span className={cn('font-display text-5xl font-semibold leading-none tabular-nums', i === 0 ? 'text-[hsl(var(--brand))]' : 'text-stone-600')} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-stone-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{s.desc}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
        <SectionHeader
          eyebrow="Inside the studio"
          title="Built for people who brief others."
          sub="Each piece answers one question: what changed, and does it matter to you."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={(i % 3) * 80} className="group panel panel-hover card-hover p-6">
              <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] transition group-hover:bg-[hsl(var(--brand)/0.22)]" aria-hidden="true">
                <Icon className="h-[18px] w-[18px] text-brand-light" />
              </span>
              <h3 className="font-display text-base font-semibold tracking-tight text-stone-100">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Channel strip */}
      <section aria-labelledby="channels-heading" className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <Reveal className="panel flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="micro-label mb-1.5">Delivery</p>
            <h2 id="channels-heading" className="font-display text-lg font-semibold tracking-tight text-stone-100">One briefing, wherever you read.</h2>
          </div>
          <ul className="flex flex-wrap gap-2">
            {CHANNELS.map(({ icon: Icon, name }) => (
              <li key={name} className="panel-raised inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-300 transition hover:border-[hsl(var(--brand)/0.35)] hover:text-stone-100">
                <Icon className="h-4 w-4 text-brand-light" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <Reveal className="panel-accent relative overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16">
          <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-[36rem] max-w-full -translate-x-1/2 -translate-y-1/2 animate-glow-pulse rounded-full bg-[hsl(var(--brand)/0.35)] blur-3xl" aria-hidden="true" />
          <p className="eyebrow relative mb-4">Start today</p>
          <h2 className="relative mx-auto max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.03em] text-stone-100 sm:text-[44px]">
            Know what changed before your first meeting.
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-[15px] text-stone-300">
            Free for up to {FREE_SOURCES} sources and {FREE_BRIEFINGS} briefings. Your first briefing lands in about two minutes.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => handleCTA('bottom')} className={cn('btn-brand group h-11 px-5 text-[15px]', FOCUS)}>
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
            <Link to={createPageUrl('Pricing')} className={cn('btn-ghost h-11 px-5 text-[15px]', FOCUS)}>
              See pricing
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
