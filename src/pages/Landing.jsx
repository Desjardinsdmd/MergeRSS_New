import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Rss, Zap, Bell, Filter, Clock, Shield, ArrowRight,
  Slack, MessageCircle, BarChart3, Layers, TrendingUp, Users,
  CheckCircle, Mail, Star
} from 'lucide-react';

// Simple hook for scroll-triggered fade-in
function useFadeIn() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function FadeIn({ children, delay = 0, className = '' }) {
  const [ref, visible] = useFadeIn();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

const features = [
  { icon: Layers, title: 'Aggregate Multiple Feeds', description: 'Combine RSS feeds from any source into a single, organized stream — no duplicates, no noise.' },
  { icon: Filter, title: 'Smart Categorization', description: 'Organize feeds by category and tags for precise content curation tailored to your workflow.' },
  { icon: Clock, title: 'Scheduled Digests', description: 'Receive daily or weekly AI-generated summaries delivered exactly when you need them.' },
  { icon: Zap, title: 'Multi-Channel Delivery', description: 'Send digests to Slack, Discord, your web inbox, or email — wherever your workflow lives.' },
  { icon: BarChart3, title: 'AI-Powered Summaries', description: 'Our AI reads every article and writes concise, readable summaries — signal without the noise.' },
  { icon: Shield, title: 'Built to Stay On', description: 'Automatic feed fetching, deduplication, and retry logic keep your content flowing without interruption.' },
];

const integrations = [
  { name: 'Slack', description: 'Post digests to any channel with rich formatting', icon: Slack },
  { name: 'Discord', description: 'Send to servers via webhook for instant delivery', icon: MessageCircle },
  { name: 'Email', description: 'Receive beautifully formatted digests straight to your inbox', icon: Mail },
  { name: 'Web Inbox', description: 'Access every delivered digest in a clean, readable view — anytime', icon: Bell },
];

const testimonials = [
  { quote: "MergeRSS replaced 12 browser tabs I had open every morning. I get my digest at 7am and I'm done by 7:15.", author: 'Sarah K.', role: 'CRE Analyst' },
  { quote: "The AI summaries are genuinely good — it actually understands context. We push it to Slack and the whole team stays in sync.", author: 'Marcus T.', role: 'Investment Manager' },
  { quote: "Set it up in 5 minutes. Now I never miss a market update. The Slack integration is seamless.", author: 'Priya M.', role: 'Fintech Founder' },
];

function AnimatedStat({ value, label, delay = 0 }) {
  const [ref, visible] = useFadeIn();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = Math.ceil(value / 40);
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setCount(value); clearInterval(timer); }
      else setCount(start);
    }, 30);
    return () => clearInterval(timer);
  }, [visible, value]);
  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: `all 0.6s ease ${delay}ms` }} className="text-center">
      <p className="text-4xl font-black text-[hsl(var(--primary))] tabular-nums">{count.toLocaleString()}+</p>
      <p className="text-sm text-stone-500 mt-1">{label}</p>
    </div>
  );
}

function PopularFeedsSection({ user }) {
  const [feeds, setFeeds] = useState([]);
  useEffect(() => {
    base44.entities.DirectoryFeed.list('-added_count', 8).then(setFeeds).catch(() => {});
  }, []);
  if (!feeds.length) return null;

  return (
    <section className="py-28 bg-[#0e0b07]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-[hsl(var(--primary))]/40 rounded-full text-xs font-medium text-[hsl(var(--primary))]/80 mb-6">
             <TrendingUp className="w-3 h-3" />
             Trending in the community
           </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
            <span className="text-stone-100">Popular </span><span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/60 bg-clip-text text-transparent">Feeds</span>
          </h2>
          <p className="text-stone-400 max-w-xl text-lg">Discover what other professionals are reading — add any feed in one click.</p>
        </FadeIn>
        <FadeIn delay={100}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-stone-800/40">
            {feeds.map((feed) => (
              <div key={feed.id} className="bg-[#0e0b07] p-6 hover:bg-stone-900/60 transition-colors duration-200 flex flex-col gap-3 group">
                <div className="w-8 h-8 border border-[hsl(var(--primary))]/30 group-hover:border-[hsl(var(--primary))]/60 rounded flex items-center justify-center flex-shrink-0 transition-colors">
                  <Rss className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-stone-200 text-sm leading-snug mb-1">{feed.name}</h3>
                  {feed.description && <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">{feed.description}</p>}
                </div>
                {feed.category && <span className="text-[10px] font-medium text-[hsl(var(--primary))]/70 uppercase tracking-wider">{feed.category}</span>}
                {feed.added_count > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                    <Users className="w-3 h-3" />
                    {feed.added_count} subscriber{feed.added_count !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-10">
            <button
             onClick={() => user ? (window.location.href = createPageUrl('Directory')) : base44.auth.redirectToLogin(createPageUrl('Directory'))}
             className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-[hsl(var(--primary))] transition-colors"
            >
              Browse all feeds in the directory
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default function Landing() {
  const [user, setUser] = React.useState(null);
  const [userLoaded, setUserLoaded] = React.useState(false);
  const [stats, setStats] = React.useState({ users: 0, articles: 0, digests: 0 });

  React.useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setUserLoaded(true); }).catch(() => setUserLoaded(true));
  }, []);

  React.useEffect(() => {
    base44.functions.invoke('publicStats', {})
      .then(res => {
        const d = res.data;
        if (d && !d.error) setStats({ users: d.users, articles: d.feeds, digests: d.digests });
      })
      .catch(() => {});
  }, []);

  const handleCTA = (location) => {
    base44.analytics.track({ eventName: 'cta_clicked', properties: { location, label: 'get_started_free' } });
    if (user) {
      window.location.href = createPageUrl('Dashboard');
    } else {
      base44.auth.redirectToLogin(createPageUrl('Dashboard'));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0805]" style={{ colorScheme: 'dark' }}>

      {/* Hero */}
      <section className="relative overflow-hidden pt-36 pb-32">
        {/* Layered gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,hsl(var(--primary))/0.10,transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_80%_60%,hsl(var(--primary))/0.04,transparent)]" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-amber-800/40 rounded-full text-xs font-medium text-amber-500/80 mb-10"
            style={{ animation: 'fadeSlideDown 0.6s ease forwards' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
            AI-powered RSS aggregation — now live
          </div>

          <h1
            className="text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.93] mb-8"
            style={{ animation: 'fadeSlideDown 0.7s ease 0.1s both' }}
          >
            <span className="text-stone-100">Turn noise into</span>
            <br />
            <span className="bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--primary))]/80 to-[hsl(var(--primary))]/60 bg-clip-text text-transparent">daily intelligence.</span>
          </h1>

          <p
            className="text-lg md:text-xl text-stone-400 mb-12 max-w-xl leading-relaxed"
            style={{ animation: 'fadeSlideDown 0.7s ease 0.2s both' }}
          >
            AI-powered briefings that cut through the clutter. Aggregate feeds from any source, get smart summaries,
            and receive a polished digest in Slack, Discord, email, or your inbox — on your schedule.
          </p>

          <div
            className="flex flex-col sm:flex-row items-start gap-4"
            style={{ animation: 'fadeSlideDown 0.7s ease 0.3s both' }}
          >
            <button
              onClick={() => handleCTA('hero')}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/70 hover:from-[hsl(var(--primary))]/90 hover:to-[hsl(var(--primary))]/60 text-stone-900 font-bold px-8 py-4 text-base transition-all duration-200 hover:shadow-[0_0_40px_hsl(var(--primary))/0.4] group"
            >
              Get started free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <Link
              to={createPageUrl('Pricing')}
              className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-200 font-medium px-2 py-4 text-base border-b border-stone-700 hover:border-stone-400 transition-colors"
            >
              View pricing
            </Link>
          </div>

          <p
            className="mt-8 text-xs text-stone-600 tracking-wide flex items-center gap-3"
            style={{ animation: 'fadeSlideDown 0.7s ease 0.4s both' }}
          >
            <CheckCircle className="w-3.5 h-3.5 text-stone-700" /> Free plan — no credit card required
            <span className="text-stone-800">·</span>
            <CheckCircle className="w-3.5 h-3.5 text-stone-700" /> 50 feeds &amp; 5 digests included
          </p>

          {/* Authenticated user shortcut — avoids confusing sign-in after already logged in */}
          {userLoaded && user && (
            <div
              className="mt-6 inline-flex items-center gap-2 text-xs text-[hsl(var(--primary))]/80 border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 px-3 py-2"
              style={{ animation: 'fadeSlideDown 0.7s ease 0.5s both' }}
            >
              <CheckCircle className="w-3 h-3 flex-shrink-0" />
              Signed in as {user.full_name || user.email} —{' '}
              <button onClick={() => handleCTA('hero-logged-in')} className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity">
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Social proof strip */}
      <section className="border-y border-stone-800 py-8 bg-[#0d0a06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-10 sm:gap-16 text-center">
            <AnimatedStat value={stats.users} label="Active users" delay={0} />
            <span className="hidden sm:block w-px h-10 bg-stone-800" />
            <AnimatedStat value={stats.articles} label="Feeds tracked" delay={80} />
            <span className="hidden sm:block w-px h-10 bg-stone-800" />
            <AnimatedStat value={stats.digests} label="Digests delivered" delay={160} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-28 bg-[#0a0805]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
              <span className="text-stone-100">Everything you need</span><br />
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/60 bg-clip-text text-transparent">to stay informed</span>
            </h2>
            <p className="text-stone-400 max-w-lg text-lg">
              Powerful features built for professionals who need to track a lot — without spending hours doing it.
            </p>
          </FadeIn>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-stone-800/40">
            {features.map((feature, idx) => (
              <FadeIn key={idx} delay={idx * 60}>
                <div className="bg-[#0a0805] p-8 hover:bg-stone-900/50 transition-colors duration-200 group h-full">
                  <div className="w-10 h-10 border border-[hsl(var(--primary))]/40 flex items-center justify-center mb-6 group-hover:border-[hsl(var(--primary))]/70 group-hover:bg-gradient-to-br group-hover:from-[hsl(var(--primary))]/15 group-hover:to-[hsl(var(--primary))]/5 transition-all">
                    <feature.icon className="w-5 h-5 text-[hsl(var(--primary))]" />
                  </div>
                  <h3 className="text-base font-bold text-stone-200 mb-3 tracking-tight">{feature.title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{feature.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <PopularFeedsSection user={user} />

      {/* Integrations */}
      <section className="py-28 bg-[#0d0a06] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
              <span className="text-stone-100">Deliver where your</span><br />
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/60 bg-clip-text text-transparent">team works</span>
            </h2>
            <p className="text-stone-400 max-w-lg text-lg">
              Each digest can be sent to multiple destinations simultaneously.
            </p>
          </FadeIn>
          <FadeIn delay={100}>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-px bg-stone-800/40">
              {integrations.map((integ, idx) => (
                <div key={idx} className="bg-[#0d0a06] p-8 hover:bg-stone-900/50 transition-colors group">
                  <div className="w-12 h-12 border border-[hsl(var(--primary))]/40 group-hover:border-[hsl(var(--primary))]/70 group-hover:bg-gradient-to-br group-hover:from-[hsl(var(--primary))]/15 group-hover:to-[hsl(var(--primary))]/5 flex items-center justify-center mb-6 transition-all">
                        <integ.icon className="w-6 h-6 text-[hsl(var(--primary))]" />
                      </div>
                  <h3 className="text-base font-bold text-stone-200 mb-2">{integ.name}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{integ.description}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* How it works */}
      <section className="py-28 bg-[#0a0805] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
              <span className="text-stone-100">Up and running</span><br />
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/60 bg-clip-text text-transparent">in minutes</span>
            </h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-px bg-stone-800/40">
            {[
              { step: '01', title: 'Add your feeds', desc: 'Paste any RSS or Atom URL. MergeRSS fetches and deduplicates articles automatically across all your sources.' },
              { step: '02', title: 'Configure a digest', desc: 'Choose which feeds or categories to include, set a schedule, and pick your delivery channels.' },
              { step: '03', title: 'Get your digest', desc: 'AI summarizes the best content and delivers a clean, readable digest right on time.' },
            ].map(({ step, title, desc }, idx) => (
              <FadeIn key={step} delay={idx * 100}>
                <div className="bg-[#0a0805] p-8 hover:bg-stone-900/50 transition-colors h-full group">
                  <div className="text-7xl font-black text-stone-800 group-hover:text-stone-700 mb-4 leading-none select-none transition-colors">{step}</div>
                  <h3 className="text-lg font-bold text-stone-200 mb-3">{title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-28 bg-[#0d0a06] border-t border-stone-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-14">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-4">
              <span className="bg-gradient-to-r from-stone-100 via-stone-200 to-[hsl(var(--primary))]/70 bg-clip-text text-transparent">What professionals say</span>
            </h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-px bg-stone-800/40">
            {testimonials.map((t, idx) => (
              <FadeIn key={idx} delay={idx * 80}>
                <div className="bg-[#0d0a06] p-8 hover:bg-stone-900/40 transition-colors h-full flex flex-col">
                  <div className="flex mb-4">
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" />)}
                  </div>
                  <p className="text-stone-300 text-sm leading-relaxed flex-1 mb-6">"{t.quote}"</p>
                  <div>
                    <p className="text-sm font-semibold text-stone-200">{t.author}</p>
                    <p className="text-xs text-stone-600">{t.role}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 border-t border-stone-800 bg-[#0a0805] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,hsl(var(--primary))/0.07,transparent)]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.93] mb-6">
              <span className="text-stone-100">Stop drowning in tabs.</span><br />
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--primary))]/80 to-[hsl(var(--primary))]/50 bg-clip-text text-transparent">Start reading smarter.</span>
            </h2>
            <p className="text-stone-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
              Professionals use MergeRSS to cut through the noise and stay on top of what actually matters.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => handleCTA('bottom')}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/70 hover:from-[hsl(var(--primary))]/90 hover:to-[hsl(var(--primary))]/60 text-stone-900 font-bold px-10 py-4 text-base transition-all duration-200 hover:shadow-[0_0_50px_hsl(var(--primary))/0.45] group"
              >
                Get started for free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <Link to={createPageUrl('Pricing')} className="text-stone-500 hover:text-stone-300 text-sm transition-colors">
                View pricing →
              </Link>
            </div>
            <p className="mt-6 text-xs text-stone-700">No credit card required · Cancel anytime</p>
          </FadeIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-stone-800 bg-[#0a0805]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
             <div className="w-7 h-7 bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary))]/70 flex items-center justify-center">
               <Rss className="w-3.5 h-3.5 text-stone-900" />
             </div>
              <span className="font-bold text-stone-200 tracking-tight">MergeRSS</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-stone-600">
              <Link to={createPageUrl('Pricing')} className="hover:text-stone-300 transition">Pricing</Link>
              <Link to={createPageUrl('Privacy')} className="hover:text-stone-300 transition">Privacy</Link>
              <Link to={createPageUrl('Terms')} className="hover:text-stone-300 transition">Terms</Link>
              <a href="mailto:support@mergerss.com" className="hover:text-stone-300 transition">Support</a>
            </div>
            <p className="text-sm text-stone-700">© {new Date().getFullYear()} MergeRSS</p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}