import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Rss, ArrowRight, CheckCircle, Star, Zap, BarChart3, TrendingUp,
  Users, Flame, Radio, Filter, X
} from 'lucide-react';

function useFadeIn() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.12 });
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
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

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
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: `all 0.55s ease ${delay}ms` }} className="text-center">
      <p className="text-4xl font-black text-[hsl(var(--primary))] tabular-nums">{count.toLocaleString()}+</p>
      <p className="text-sm text-stone-500 mt-1">{label}</p>
    </div>
  );
}

// Styled mock of the Intelligence Briefing card
function BriefingMockup() {
  return (
    <div className="border-2 border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/[0.03] shadow-[0_0_60px_-10px_hsl(var(--primary)/0.25)] w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/[0.07]">
        <Radio className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
        <span className="text-sm font-bold text-[hsl(var(--primary))] uppercase tracking-widest">Intelligence Briefing</span>
        <span className="text-xs text-stone-500 ml-auto">Today</span>
      </div>
      {/* Key Signal */}
      <div className="px-5 py-4 border-b border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/[0.04]">
        <div className="text-[10px] font-black text-[hsl(var(--primary))]/70 uppercase tracking-[0.2em] mb-1.5">Today's Key Signal</div>
        <p className="text-[0.9rem] font-bold text-stone-100 leading-snug">Fed signals hold — borrowing costs are forcing capital deployment to the sidelines</p>
      </div>
      {/* Story #1 — READ FIRST */}
      <div className="px-5 py-4 border-b border-stone-800 border-l-[4px] border-l-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.04]">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-stone-900 bg-[hsl(var(--primary))] px-2 py-0.5 tracking-wider uppercase">
            <Flame className="w-2.5 h-2.5" /> Read First
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 text-red-400 border border-red-800/50 bg-red-950/30">Escalating</span>
        </div>
        <h3 className="text-[0.95rem] font-black text-white leading-snug mb-1.5">Fed holds rates — third consecutive meeting, signaling extended higher-for-longer stance</h3>
        <p className="text-[11px] text-stone-300 mb-1.5 border-l-2 border-[hsl(var(--primary))]/60 pl-2.5 leading-snug">
          <span className="text-[hsl(var(--primary))]/70 font-bold text-[10px] uppercase tracking-wider">Why this matters · </span>
          Rate moves now determine capital access — positioning this week sets Q-end outcomes
        </p>
        <p className="text-[11px] font-black text-[hsl(var(--primary))]/80 uppercase tracking-wide">Bottom line: Rate risk is now a capital access problem, not just a policy debate</p>
        <p className="text-[10px] text-stone-600 mt-1.5">Bloomberg · 2 hours ago</p>
      </div>
      {/* Story #2 */}
      <div className="px-5 py-3.5 border-b border-stone-800/60 border-l-[2px] border-l-stone-600 opacity-85">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-2 py-0.5 border text-sky-400 border-sky-800/50">Supporting</span>
        </div>
        <h3 className="text-[0.875rem] font-bold text-stone-100 leading-snug mb-1">Treasury yields surge on jobs data beat — 10-year hits 4.8%</h3>
        <p className="text-[11px] text-stone-500">→ Equity repricing likely within the week — watch rate-sensitive sectors first</p>
        <p className="text-[10px] text-stone-700 mt-1">Reuters · 4 hours ago</p>
      </div>
      {/* Story #3 — SKIM */}
      <div className="px-5 py-3 opacity-55">
        <span className="text-[10px] font-semibold text-stone-700 border border-stone-800 px-1.5 py-0.5 uppercase tracking-wider">Skim</span>
        <h3 className="text-sm font-medium text-stone-400 leading-snug mt-1.5">FDIC flags three regional banks for enhanced monitoring</h3>
        <p className="text-[10px] text-stone-700 mt-0.5">WSJ · 6 hours ago</p>
      </div>
    </div>
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
    base44.analytics.track({ eventName: 'cta_clicked', properties: { location } });
    if (user) window.location.href = createPageUrl('Dashboard');
    else base44.auth.redirectToLogin(createPageUrl('Dashboard'));
  };

  return (
    <div className="min-h-screen bg-[#0a0805]" style={{ colorScheme: 'dark' }}>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary))/0.10,transparent)]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-[hsl(var(--primary))]/40 text-xs font-semibold text-[hsl(var(--primary))]/80 mb-8"
                style={{ animation: 'fadeSlideDown 0.5s ease both' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
                Your morning briefing, rebuilt
              </div>

              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.93] mb-4"
                style={{ animation: 'fadeSlideDown 0.6s ease 0.1s both' }}
              >
                <span className="text-stone-100">Stop scanning.</span>
                <br />
                <span className="bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--primary))]/80 to-[hsl(var(--primary))]/60 bg-clip-text text-transparent">Start knowing.</span>
              </h1>

              <p
                className="text-sm text-stone-500 italic mb-5"
                style={{ animation: 'fadeSlideDown 0.6s ease 0.15s both' }}
              >
                Most people read more. You just need to know better.
              </p>

              <p
                className="text-lg text-stone-400 mb-8 max-w-lg leading-relaxed"
                style={{ animation: 'fadeSlideDown 0.6s ease 0.2s both' }}
              >
                MergeRSS turns hundreds of headlines into a clear daily briefing — so you know what matters before everyone else.
              </p>

              <div
                className="flex flex-col sm:flex-row items-start gap-3 mb-4"
                style={{ animation: 'fadeSlideDown 0.6s ease 0.3s both' }}
              >
                <button
                  onClick={() => handleCTA('hero')}
                  className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-black px-8 py-4 text-base transition-all duration-200 hover:shadow-[0_0_40px_hsl(var(--primary))/0.4] group"
                >
                  Get your daily briefing
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-200 font-medium px-2 py-4 text-sm border-b border-stone-800 hover:border-stone-500 transition-colors"
                >
                  See how it works
                </a>
              </div>

              <p style={{ animation: 'fadeSlideDown 0.6s ease 0.4s both' }} className="text-xs text-stone-600">
                Takes 2 minutes to set up
              </p>

              {userLoaded && user && (
                <div className="mt-5 inline-flex items-center gap-2 text-xs text-[hsl(var(--primary))]/80 border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 px-3 py-2">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  Signed in as {user.full_name || user.email} —{' '}
                  <button onClick={() => handleCTA('hero-logged-in')} className="font-semibold underline underline-offset-2 hover:opacity-80">
                    Go to Dashboard
                  </button>
                </div>
              )}
            </div>

            {/* Right — briefing mockup */}
            <div style={{ animation: 'fadeSlideUp 0.7s ease 0.25s both' }}>
              <BriefingMockup />
              <p className="text-center text-xs text-stone-600 mt-3">This is what your morning looks like now</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ────────────────────────────────────────── */}
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

      {/* ── PAIN SECTION ───────────────────────────────────────── */}
      <section className="py-24 bg-[#0a0805]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-stone-100 mb-10">Your morning is broken.</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-10">
              {[
                'Too many sources',
                'Too much noise',
                'No clear signal',
                'Time wasted piecing it together',
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4 bg-stone-900/60 border border-stone-800">
                  <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-stone-300 font-medium">{p}</span>
                </div>
              ))}
            </div>
            <div className="border-l-4 border-[hsl(var(--primary))] pl-5">
              <p className="text-xl font-black text-[hsl(var(--primary))]">MergeRSS fixes this.</p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-[#0d0a06] border-t border-stone-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-12">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-stone-100">How it works</h2>
          </FadeIn>
          <div className="space-y-px bg-stone-800/40">
            {[
              { n: '01', title: 'Add your sources', desc: 'Paste any RSS or newsletter URL. Done.' },
              { n: '02', title: 'We extract the signal', desc: 'AI reads everything, ranks what matters, and filters out the noise.' },
              { n: '03', title: 'You get a daily briefing', desc: 'A clear, ranked briefing in your inbox every morning.' },
            ].map(({ n, title, desc }, i) => (
              <FadeIn key={n} delay={i * 80}>
                <div className="bg-[#0d0a06] hover:bg-stone-900/50 transition-colors px-8 py-6 flex items-center gap-6 group">
                  <span className="text-5xl font-black text-stone-800 group-hover:text-stone-700 transition-colors select-none w-12 flex-shrink-0">{n}</span>
                  <div>
                    <h3 className="text-lg font-bold text-stone-100 mb-0.5">{title}</h3>
                    <p className="text-sm text-stone-500">{desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU ACTUALLY GET ──────────────────────────────── */}
      <section className="py-24 bg-[#0a0805] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-12 text-center">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-stone-100 mb-3">What you actually get</h2>
            <p className="text-stone-500">Not a news dump. A briefing.</p>
          </FadeIn>
          <FadeIn delay={100}>
            <BriefingMockup />
          </FadeIn>
          <FadeIn delay={200}>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              {[
                { label: 'READ FIRST', desc: 'The one story that actually matters today' },
                { label: 'WHY THIS MATTERS', desc: 'Direct consequence, not background noise' },
                { label: 'BOTTOM LINE', desc: 'The takeaway in 12 words or less' },
              ].map(({ label, desc }) => (
                <div key={label} className="flex flex-col items-center gap-1 px-5 py-3 bg-stone-900/60 border border-stone-800 text-center max-w-[180px]">
                  <span className="text-[10px] font-black text-[hsl(var(--primary))] uppercase tracking-wider">{label}</span>
                  <span className="text-xs text-stone-500">{desc}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── WHO IT'S FOR ───────────────────────────────────────── */}
      <section className="py-24 bg-[#0d0a06] border-t border-stone-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-12">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-stone-100">Built for people who make decisions.</h2>
          </FadeIn>
          <FadeIn delay={80}>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-px bg-stone-800/40">
              {['Investors', 'Operators', 'Founders', 'Analysts'].map((role) => (
                <div key={role} className="bg-[#0d0a06] hover:bg-stone-900/50 transition-colors px-8 py-8 group">
                  <div className="w-8 h-8 border border-[hsl(var(--primary))]/30 group-hover:border-[hsl(var(--primary))]/70 flex items-center justify-center mb-5 transition-colors">
                    <Users className="w-4 h-4 text-[hsl(var(--primary))]" />
                  </div>
                  <h3 className="text-lg font-bold text-stone-100">{role}</h3>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CORE FEATURES ─────────────────────────────────────── */}
      <section className="py-24 bg-[#0a0805] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-12">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-stone-100 mb-3">Three things done right.</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-px bg-stone-800/40">
            {[
              { icon: Filter, title: 'Signal extraction', desc: 'AI reads every article and separates what matters from everything else.' },
              { icon: Radio, title: 'Daily briefing', desc: 'A ranked, structured briefing delivered on your schedule. Not an inbox dump.' },
              { icon: TrendingUp, title: 'Smart ranking', desc: 'Stories ranked by importance, source convergence, and category weight — not recency.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <FadeIn key={title} delay={i * 70}>
                <div className="bg-[#0a0805] hover:bg-stone-900/50 transition-colors p-8 h-full group">
                  <div className="w-10 h-10 border border-[hsl(var(--primary))]/40 group-hover:border-[hsl(var(--primary))]/70 flex items-center justify-center mb-6 transition-colors">
                    <Icon className="w-5 h-5 text-[hsl(var(--primary))]" />
                  </div>
                  <h3 className="text-base font-bold text-stone-200 mb-2">{title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────── */}
      <section className="py-24 bg-[#0d0a06] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-12">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-stone-100">What they say</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-px bg-stone-800/40">
            {[
              { quote: 'Saves me an hour every morning. My whole team uses it now.', author: 'Sarah K.', role: 'CRE Analyst' },
              { quote: 'I actually know what matters now. Deleted four news apps.', author: 'Marcus T.', role: 'Investment Manager' },
              { quote: 'Set it up in 5 minutes. Never missed a market move since.', author: 'Priya M.', role: 'Fintech Founder' },
            ].map((t, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className="bg-[#0d0a06] hover:bg-stone-900/40 transition-colors p-8 h-full flex flex-col">
                  <div className="flex mb-4">
                    {[...Array(5)].map((_, s) => <Star key={s} className="w-3.5 h-3.5 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" />)}
                  </div>
                  <p className="text-stone-200 text-sm font-medium leading-relaxed flex-1 mb-5">"{t.quote}"</p>
                  <div>
                    <p className="text-sm font-semibold text-stone-300">{t.author}</p>
                    <p className="text-xs text-stone-600">{t.role}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className="py-28 border-t border-stone-800 bg-[#0a0805] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,hsl(var(--primary))/0.08,transparent)]" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <h2 className="text-5xl md:text-6xl font-black tracking-tight leading-[0.93] mb-4">
              <span className="text-stone-100">Know what matters.</span>
              <br />
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--primary))]/80 to-[hsl(var(--primary))]/50 bg-clip-text text-transparent">Every morning.</span>
            </h2>
            <p className="text-stone-400 text-lg mb-8 max-w-md mx-auto">
              Start your daily briefing in minutes.
            </p>
            <button
              onClick={() => handleCTA('bottom')}
              className="inline-flex items-center gap-2 bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-black px-10 py-4 text-base transition-all duration-200 hover:shadow-[0_0_50px_hsl(var(--primary))/0.45] group"
            >
              Get started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="mt-4 text-xs text-stone-700">No credit card required · Takes 2 minutes</p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-stone-800 bg-[#0a0805]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-[hsl(var(--primary))] flex items-center justify-center">
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
          from { opacity: 0; transform: translateY(-14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}