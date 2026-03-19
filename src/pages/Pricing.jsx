import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Check, X, Loader2, ArrowRight, Zap } from 'lucide-react';
import { PLAN_LIMITS } from '@/lib/planLimits';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for getting started',
    features: [
      { text: `Up to ${PLAN_LIMITS.free.feeds} RSS feeds`, included: true },
      { text: `Up to ${PLAN_LIMITS.free.digests} digests`, included: true },
       { text: 'Web inbox delivery', included: true },
       { text: 'Daily AI summaries', included: true },
      { text: 'Slack integration', included: false },
      { text: 'Discord integration', included: false },
      { text: 'Unlimited digests', included: false },
    ],
    cta: 'Get Started Free',
    popular: false,
  },
  {
    name: 'Premium',
    price: 5,
    description: 'For professionals who need more',
    features: [
      { text: 'Unlimited RSS feeds', included: true },
       { text: 'Unlimited digests', included: true },
       { text: 'Web inbox delivery', included: true },
       { text: 'Daily, weekly & monthly AI summaries', included: true },
      { text: 'Slack integration', included: true },
      { text: 'Discord integration', included: true },
      { text: 'Custom scheduling & timezones', included: true },
      { text: 'AI Curator & feed recommendations', included: true },
    ],
    cta: 'Upgrade to Premium',
    popular: true,
  },
];

export default function Pricing() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const userData = await base44.auth.me();
          setUser(userData);
        }
      } catch (e) {}
    };
    loadUser();
  }, []);

  const handleGetStarted = async (plan) => {
    base44.analytics.track({ eventName: 'upgrade_started', properties: { plan: plan.name.toLowerCase(), authenticated: !!user } });
    if (!user) {
      base44.auth.redirectToLogin(createPageUrl('Pricing'));
      return;
    }
    if (plan.name === 'Free') {
      window.location.href = createPageUrl('Dashboard');
      return;
    }
    // Prevent duplicate subscription
    if (user?.plan === 'premium') {
      window.location.href = createPageUrl('Dashboard');
      return;
    }
    // Premium - go to Stripe Checkout
    setLoading(true);
    const response = await base44.functions.invoke('createCheckoutSession', {});
    setLoading(false);
    if (response.data?.url) {
      base44.analytics.track({ eventName: 'upgrade_checkout_opened', properties: { plan: 'premium' } });
      window.open(response.data.url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0805] py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-full text-xs font-medium text-[hsl(var(--primary))] mb-6">
            <Zap className="w-3 h-3" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-stone-100 mb-4 tracking-tight">
            Choose your plan
          </h1>
          <p className="text-xl text-stone-500 max-w-xl mx-auto">
            Start free, upgrade when you need more power
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
               "relative border p-8 transition-all",
               plan.popular
                 ? "border-[hsl(var(--primary))]/30 bg-stone-900 shadow-lg shadow-[hsl(var(--primary))]/10"
                 : "border-stone-800 bg-stone-900/50 hover:border-stone-700"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-[hsl(var(--primary))] text-stone-900 text-xs font-semibold rounded-full tracking-wide">
                   MOST POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-stone-100 mb-1">{plan.name}</h3>
                <p className="text-stone-500 text-sm">{plan.description}</p>
              </div>

              <div className="mb-7">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-stone-100">${plan.price}</span>
                  <span className="text-stone-600 mb-1">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-sm">
                    {feature.included ? (
                      <Check className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-stone-700 flex-shrink-0" />
                    )}
                    <span className={feature.included ? "text-stone-300" : "text-stone-600"}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleGetStarted(plan)}
                disabled={loading}
                className={cn(
                  "w-full h-11 font-semibold",
                  plan.popular
                    ? "bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900"
                    : "bg-stone-800 hover:bg-stone-700 text-stone-100"
                )}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>

              {user?.plan === plan.name.toLowerCase() && (
                <p className="text-center text-sm text-[hsl(var(--primary))] font-medium mt-3">✓ Your current plan</p>
              )}
            </div>
          ))}
        </div>

        {/* FAQ nudge */}
        <div className="mt-16 text-center">
          <p className="text-stone-500 text-sm">
            Need a custom plan?{' '}
            <a href="mailto:support@mergerss.com" className="text-[hsl(var(--primary))] hover:opacity-80 font-medium transition-opacity">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}