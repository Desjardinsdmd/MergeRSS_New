import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Check, X, Loader2, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for getting started',
    features: [
      { text: 'Up to 5 RSS feeds', included: true },
      { text: '1 digest', included: true },
      { text: 'Web inbox delivery', included: true },
      { text: 'Email delivery', included: true },
      { text: 'Daily AI summaries', included: true },
      { text: 'Slack integration', included: false },
      { text: 'Discord integration', included: false },
      { text: 'Multiple digests', included: false },
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
      { text: 'Daily & weekly AI summaries', included: true },
      { text: 'Slack integration', included: true },
      { text: 'Discord integration', included: true },
      { text: 'Custom scheduling', included: true },
      { text: 'Priority support', included: true },
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
    if (!user) {
      base44.auth.redirectToLogin(createPageUrl('Pricing'));
      return;
    }
    if (plan.name === 'Free') {
      window.location.href = createPageUrl('Dashboard');
      return;
    }
    // Premium - go to Stripe Checkout
    setLoading(true);
    const response = await base44.functions.invoke('createCheckoutSession', {
      success_url: window.location.origin + createPageUrl('Dashboard') + '?upgraded=true',
      cancel_url: window.location.href,
    });
    setLoading(false);
    if (response.data?.url) {
      window.open(response.data.url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-6">
            <Zap className="w-3 h-3" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            Choose your plan
          </h1>
          <p className="text-xl text-slate-500 max-w-xl mx-auto">
            Start free, upgrade when you need more power
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative rounded-2xl border-2 p-8 transition-all",
                plan.popular
                  ? "border-indigo-600 shadow-xl shadow-indigo-100"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full tracking-wide">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                <p className="text-slate-500 text-sm">{plan.description}</p>
              </div>

              <div className="mb-7">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                  <span className="text-slate-400 mb-1">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-sm">
                    {feature.included ? (
                      <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    )}
                    <span className={feature.included ? "text-slate-700" : "text-slate-400"}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleGetStarted(plan)}
                disabled={loading}
                className={cn(
                  "w-full h-11 font-semibold rounded-xl",
                  plan.popular
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200"
                    : "bg-slate-900 hover:bg-slate-800 text-white"
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
                <p className="text-center text-sm text-indigo-600 font-medium mt-3">✓ Your current plan</p>
              )}
            </div>
          ))}
        </div>

        {/* FAQ nudge */}
        <div className="mt-16 text-center">
          <p className="text-slate-500 text-sm">
            Need a custom plan?{' '}
            <a href="mailto:support@mergerss.com" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}