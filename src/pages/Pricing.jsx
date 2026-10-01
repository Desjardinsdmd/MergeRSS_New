import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Check, Loader2, ArrowRight } from 'lucide-react';
import * as planLimits from '@/lib/planLimits';
import { cn } from '@/lib/utils';
import Reveal from '@/components/landing/Reveal';
import SiteFooter from '@/components/landing/SiteFooter';

// Read limits defensively: planLimits may gain keys or change shape.
const LIMITS = planLimits?.PLAN_LIMITS || {};
const TEAM = planLimits?.TEAM_PLAN || {};
const FREE_SOURCES = Number.isFinite(LIMITS?.free?.feeds) ? LIMITS.free.feeds : 50;
const FREE_BRIEFINGS = Number.isFinite(LIMITS?.free?.digests) ? LIMITS.free.digests : 5;
const TEAM_MEMBERS = Number.isFinite(TEAM?.seats) ? TEAM.seats : 5;
const TEAM_TRIAL_SEATS = Number.isFinite(TEAM?.trialSeats) ? TEAM.trialSeats : 2;
const TEAM_PRICE = Number.isFinite(TEAM?.priceMonthly) ? TEAM.priceMonthly : 20;

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0910]';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    unit: '/month',
    description: 'A daily briefing on your field',
    features: [
      `Up to ${FREE_SOURCES} sources`,
      `Up to ${FREE_BRIEFINGS} briefings`,
      'Email and web inbox delivery',
      'AI importance ranking for what you care about',
      'Daily scheduling',
    ],
    cta: 'Start free',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 5,
    unit: '/month',
    description: 'For people who live in their briefing',
    features: [
      'Unlimited sources',
      'Unlimited briefings',
      'Slack, Discord and Microsoft Teams delivery',
      'Daily, weekly and monthly scheduling',
      'Everything in Free',
    ],
    cta: 'Upgrade to Premium',
    popular: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: TEAM_PRICE,
    unit: '/month per workspace',
    description: `Shared briefings for up to ${TEAM_MEMBERS} people`,
    features: [
      `Up to ${TEAM_MEMBERS} members in one workspace`,
      'Shared sources and briefings',
      'Deliver to your team Slack channel',
      'Everything in Premium',
    ],
    cta: 'Start a team',
  },
];

const faqs = [
  {
    q: 'Free plan limits',
    a: `Free covers up to ${FREE_SOURCES} sources and ${FREE_BRIEFINGS} briefings. Premium removes both limits.`,
  },
  {
    q: 'How the Team plan works',
    a: `Team is $${TEAM_PRICE} a month per workspace and covers up to ${TEAM_MEMBERS} members, owner included. Without it, a workspace runs as a trial with ${TEAM_TRIAL_SEATS} seats, the owner plus one invited member, and shared briefings deliver by web and email only. With Team, shared briefings also post to your team Slack, Discord or Teams channel.`,
  },
  {
    q: 'Members and personal plans',
    a: 'Team is billed per workspace. Members do not need Premium, and each member keeps their own personal plan.',
  },
  {
    q: 'Buying the Team plan',
    a: 'The workspace owner. Start a team, invite your members, then upgrade the workspace from the Team page.',
  },
  {
    q: 'Cancelling',
    a: 'Cancellations take effect at the end of the current billing period. Partial periods are not refunded.',
  },
  {
    q: 'Payments',
    a: 'Payments and subscriptions are handled by Stripe.',
  },
];

export default function Pricing() {
  const [user, setUser] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) return;
        let userData = await base44.auth.me();
        setUser(userData);
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment') === 'success') {
          // Back from Stripe Checkout. Pull the subscription straight from Stripe so the upgrade
          // doesn't depend on the webhook having landed yet.
          setSyncing(true);
          for (let attempt = 0; attempt < 4 && userData?.plan !== 'premium'; attempt += 1) {
            try { await base44.functions.invoke('syncUserSubscription', {}); } catch { /* retry */ }
            try { userData = await base44.auth.me(); setUser(userData); } catch { /* keep last */ }
            if (userData?.plan !== 'premium') await new Promise((r) => setTimeout(r, 2500));
          }
          setSyncing(false);
          if (userData?.plan === 'premium') {
            setTimeout(() => { window.location.href = createPageUrl('Dashboard'); }, 1200);
          } else {
            setError('Payment received. Your upgrade is still being confirmed by Stripe; refresh this page in a minute.');
          }
        }
      } catch {
        /* public page: signed-out is fine */
      }
    };
    loadUser();
  }, []);

  const currentPlan = user?.plan || (user ? 'free' : null);

  const handleSelect = async (plan) => {
    setError('');
    try { base44.analytics.track({ eventName: 'upgrade_started', properties: { plan: plan.id, authenticated: !!user } }); } catch { /* optional */ }
    if (!user) {
      base44.auth.redirectToLogin(createPageUrl('Pricing'));
      return;
    }
    if (plan.id === 'free' || currentPlan === plan.id) {
      window.location.href = createPageUrl('Dashboard');
      return;
    }
    // Team is bought per workspace, and only the workspace owner can buy it. The Team page
    // creates the workspace first and passes its id to checkout.
    if (plan.id === 'team') {
      window.location.href = createPageUrl('Team');
      return;
    }
    setLoadingPlan(plan.id);
    try {
      const response = await base44.functions.invoke('createCheckoutSession', {});
      const url = response?.data?.url;
      if (!url) throw new Error(response?.data?.error || 'Checkout is not available right now.');
      try { base44.analytics.track({ eventName: 'upgrade_checkout_opened', properties: { plan: plan.id } }); } catch { /* optional */ }
      window.location.assign(url);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Checkout is not available right now.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="overflow-x-clip">
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
        <header className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow mb-4 animate-fade-up">Pricing</p>
          <h1 className="animate-fade-up font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-stone-100 [animation-delay:60ms] sm:text-5xl md:text-[56px]">
            Start free. Pay when your coverage grows.
          </h1>
          <p className="mx-auto mt-5 max-w-xl animate-fade-up text-[15px] text-stone-400 [animation-delay:120ms] sm:text-base">
            Your briefing is free. Pay when you want more sources, more channels or a team.
          </p>
        </header>

        {syncing && (
          <p role="status" className="panel mx-auto mb-6 flex max-w-xl items-center justify-center gap-2 px-4 py-3 text-center text-sm text-stone-300">
            <Loader2 className="h-4 w-4 animate-spin text-brand-light" aria-hidden="true" />
            Confirming your payment with Stripe...
          </p>
        )}

        {error && (
          <p role="alert" className="mx-auto mb-6 max-w-xl rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="grid items-stretch gap-4 md:grid-cols-3 md:gap-5">
          {plans.map((plan, i) => {
            const isCurrent = currentPlan === plan.id;
            return (
              <Reveal key={plan.id} delay={i * 80} className="h-full">
                <div
                  className={cn(
                    'relative flex h-full flex-col p-6 sm:p-7 card-hover',
                    plan.popular ? 'panel-accent shadow-glow' : 'panel panel-hover'
                  )}
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-semibold tracking-tight text-stone-100">{plan.name}</h2>
                      <p className="mt-1 text-sm text-stone-400">{plan.description}</p>
                    </div>
                    {plan.popular && <span className="chip-brand flex-shrink-0 uppercase tracking-wider">Most popular</span>}
                  </div>

                  <div className="mb-6 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                    <span className="font-display text-5xl font-semibold tabular-nums tracking-tight text-stone-100">${plan.price}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-stone-500">{plan.unit}</span>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {plan.features.map((text) => (
                      <li key={text} className="flex items-start gap-3 text-sm">
                        <span className={cn(
                          'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md',
                          plan.popular ? 'bg-[hsl(var(--brand)/0.25)]' : 'bg-white/[0.06]'
                        )}>
                          <Check className="h-3 w-3 text-brand-light" aria-hidden="true" />
                        </span>
                        <span className="text-stone-300">{text}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSelect(plan)}
                    disabled={!!loadingPlan}
                    aria-label={isCurrent ? `${plan.name} is your current plan. Go to the app` : plan.cta}
                    className={cn(
                      'h-11 w-full disabled:cursor-not-allowed disabled:opacity-60',
                      plan.popular ? 'btn-brand' : 'btn-ghost',
                      FOCUS
                    )}
                  >
                    {loadingPlan === plan.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : (
                      <>
                        {isCurrent ? 'Go to the app' : plan.cta}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>

                  {isCurrent && (
                    <p className="meta mt-3 text-center text-brand-light">Your current plan</p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-stone-400">
          Need more seats or invoicing?{' '}
          <a href="mailto:support@mergerss.com" className={cn('rounded-sm font-medium text-brand-light transition hover:text-stone-100', FOCUS)}>
            Contact us
          </a>
        </p>

        <section aria-labelledby="faq-heading" className="mx-auto mt-24 max-w-4xl">
          <Reveal className="mb-8 text-center">
            <p className="eyebrow mb-3">Questions</p>
            <h2 id="faq-heading" className="font-display text-3xl font-semibold tracking-tight text-stone-100 sm:text-4xl">Plan details</h2>
          </Reveal>
          <div className="grid gap-3 md:grid-cols-2">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={(i % 2) * 60} className="panel panel-hover p-5 sm:p-6">
                <h3 className="font-display text-base font-semibold tracking-tight text-stone-100">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.a}</p>
              </Reveal>
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
