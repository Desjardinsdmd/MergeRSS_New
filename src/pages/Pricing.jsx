import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Check, Loader2, ArrowRight, Zap } from 'lucide-react';
import * as planLimits from '@/lib/planLimits';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Read limits defensively: planLimits may gain keys (e.g. team) or change shape.
const LIMITS = planLimits?.PLAN_LIMITS || {};
const FREE_SOURCES = Number.isFinite(LIMITS?.free?.feeds) ? LIMITS.free.feeds : 50;
const FREE_BRIEFINGS = Number.isFinite(LIMITS?.free?.digests) ? LIMITS.free.digests : 5;
const TEAM_MEMBERS = Number.isFinite(LIMITS?.team?.members) ? LIMITS.team.members : 5;

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
    price: 20,
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

export default function Pricing() {
  const [user, setUser] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) return;
        const userData = await base44.auth.me();
        setUser(userData);
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment') === 'success' && userData?.plan && userData.plan !== 'free') {
          setTimeout(() => { window.location.href = createPageUrl('Dashboard'); }, 1500);
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
    setLoadingPlan(plan.id);
    try {
      const response = await base44.functions.invoke('createCheckoutSession', plan.id === 'team' ? { plan: 'team' } : {});
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
    <div className="min-h-screen bg-[#0a0805] py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-full text-xs font-medium text-[hsl(var(--primary))] mb-6">
            <Zap className="w-3 h-3" aria-hidden="true" />
            Simple pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-stone-100 mb-4 tracking-tight">
            Pick your plan
          </h1>
          <p className="text-lg text-stone-500 max-w-xl mx-auto">
            Your briefing is free. Pay when you want more sources, more channels or a team.
          </p>
        </div>

        {error && (
          <p role="alert" className="max-w-xl mx-auto mb-6 text-center text-sm text-red-300 border border-red-900/50 bg-red-950/20 px-4 py-3 rounded-md">
            {error}
          </p>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative border p-7 flex flex-col transition-all rounded-md',
                  plan.popular
                    ? 'border-[hsl(var(--primary))]/40 bg-stone-900 shadow-lg shadow-[hsl(var(--primary))]/10'
                    : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 bg-[hsl(var(--primary))] text-stone-900 text-xs font-semibold rounded-full tracking-wide">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h2 className="text-xl font-bold text-stone-100 mb-1">{plan.name}</h2>
                  <p className="text-stone-500 text-sm">{plan.description}</p>
                </div>

                <div className="mb-6 flex items-end gap-1">
                  <span className="text-4xl font-bold text-stone-100">${plan.price}</span>
                  <span className="text-stone-600 mb-1 text-sm">{plan.unit}</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((text) => (
                    <li key={text} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 mt-0.5 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
                      <span className="text-stone-300">{text}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSelect(plan)}
                  disabled={!!loadingPlan}
                  aria-label={isCurrent ? `${plan.name} is your current plan. Go to the app` : plan.cta}
                  className={cn(
                    'w-full h-11 font-semibold focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900',
                    plan.popular
                      ? 'bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-100'
                  )}
                >
                  {loadingPlan === plan.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : (
                    <>
                      {isCurrent ? 'Go to the app' : plan.cta}
                      <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
                    </>
                  )}
                </Button>

                {isCurrent && (
                  <p className="text-center text-sm text-[hsl(var(--primary))] font-medium mt-3">Your current plan</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-14 text-center">
          <p className="text-stone-500 text-sm">
            Need more seats or invoicing?{' '}
            <a href="mailto:support@mergerss.com" className="text-[hsl(var(--primary))] hover:opacity-80 font-medium transition-opacity rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
