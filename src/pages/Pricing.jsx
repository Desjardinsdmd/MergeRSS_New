import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Check, X, Loader2 } from 'lucide-react';
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
      { text: 'Daily updates', included: true },
      { text: 'Slack integration', included: false },
      { text: 'Discord integration', included: false },
      { text: 'Multiple digests', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Premium',
    price: 19,
    description: 'For power users and teams',
    features: [
      { text: 'Unlimited RSS feeds', included: true },
      { text: 'Unlimited digests', included: true },
      { text: 'Web inbox delivery', included: true },
      { text: 'Real-time updates', included: true },
      { text: 'Slack integration', included: true },
      { text: 'Discord integration', included: true },
      { text: 'Custom scheduling', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Upgrade Now',
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
      } catch (e) {
        console.log('Not authenticated');
      }
    };
    loadUser();
  }, []);

  const handleGetStarted = async (plan) => {
    if (!user) {
      base44.auth.redirectToLogin(createPageUrl('Dashboard'));
      return;
    }
    
    if (plan.name === 'Free') {
      window.location.href = createPageUrl('Dashboard');
      return;
    }

    // For Premium, simulate upgrade (in production, this would trigger Stripe)
    setLoading(true);
    try {
      await base44.auth.updateMe({ plan: 'premium' });
      window.location.href = createPageUrl('Dashboard');
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-6xl font-bold text-[#171a20] mb-4 tracking-tight">
            Choose Your Plan
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto font-light">
            Start free, upgrade when you need more power
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative p-10 bg-white border-2 transition-all",
                plan.popular 
                  ? "border-[#171a20] shadow-2xl" 
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 bg-[#e82127] text-white text-sm font-medium tracking-wide">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                <p className="text-slate-600">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-bold text-slate-900">${plan.price}</span>
                <span className="text-slate-600">/month</span>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3">
                    {feature.included ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <X className="w-5 h-5 text-slate-300 flex-shrink-0" />
                    )}
                    <span className={cn(
                      "text-sm",
                      feature.included ? "text-slate-700" : "text-slate-400"
                    )}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleGetStarted(plan)}
                disabled={loading}
                className={cn(
                  "w-full h-12 font-medium rounded-sm",
                  plan.popular 
                    ? "bg-[#171a20] hover:bg-black" 
                    : "border-2 border-[#171a20] bg-white text-[#171a20] hover:bg-[#171a20] hover:text-white"
                )}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  plan.cta
                )}
              </Button>

              {user?.plan === plan.name.toLowerCase() && (
                <p className="text-center text-sm text-[#e82127] font-medium mt-4">
                  Current Plan
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-20 text-center">
          <p className="text-slate-600 font-light">
            Need a custom plan for your enterprise?{' '}
            <a href="mailto:support@mergerss.com" className="text-[#171a20] hover:text-[#e82127] font-medium">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}