import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Rss,
  Zap,
  Bell,
  Filter,
  Clock,
  Shield,
  ArrowRight,
  Slack,
  MessageCircle,
  BarChart3,
  Layers,
  TrendingUp,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  { name: 'Web Inbox', description: 'Access every delivered digest in a clean, readable view — anytime', icon: Bell },
];

function PopularFeedsSection() {
  const [feeds, setFeeds] = useState([]);

  useEffect(() => {
    base44.entities.DirectoryFeed.list('-added_count', 8).then(setFeeds).catch(() => {});
  }, []);

  if (!feeds.length) return null;

  return (
    <section className="py-28 bg-[#0e0b07]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-amber-800/40 rounded-full text-xs font-medium text-amber-500/80 mb-6">
            <TrendingUp className="w-3 h-3" />
            Trending in the community
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-stone-100 tracking-tight leading-none mb-4">
            Popular Feeds
          </h2>
          <p className="text-stone-400 max-w-xl text-lg">
            Discover what other professionals are reading — add any feed in one click.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-stone-800/40">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="bg-[#0e0b07] p-6 hover:bg-stone-900/60 transition-colors duration-200 flex flex-col gap-3"
            >
              <div className="w-8 h-8 border border-amber-700/30 rounded flex items-center justify-center flex-shrink-0">
                <Rss className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-stone-200 text-sm leading-snug mb-1">{feed.name}</h3>
                {feed.description && (
                  <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">{feed.description}</p>
                )}
              </div>
              {feed.category && (
                <span className="text-[10px] font-medium text-amber-600/70 uppercase tracking-wider">{feed.category}</span>
              )}
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
            onClick={() => base44.auth.redirectToLogin(createPageUrl('Directory'))}
            className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-amber-400 transition-colors"
          >
            Browse all feeds in the directory
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0805]">

      {/* Hero */}
      <section className="relative overflow-hidden pt-36 pb-32">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,rgba(251,146,60,0.07),transparent)]" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-amber-800/40 rounded-full text-xs font-medium text-amber-500/80 mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            AI-powered RSS aggregation — now live
          </div>
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-stone-100 tracking-tight leading-[0.95] mb-8">
            Your information,
            <br />
            <span className="text-amber-400">curated &</span>
            <br />
            delivered.
          </h1>
          <p className="text-lg text-stone-400 mb-12 max-w-xl leading-relaxed">
            Aggregate RSS feeds from any source, let AI summarize the articles that matter,
            and get a clean digest delivered to Slack, Discord, email, or your web inbox — on your schedule.
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <button
              onClick={() => {
                base44.analytics.track({ eventName: 'cta_clicked', properties: { location: 'hero', label: 'get_started_free' } });
                base44.auth.redirectToLogin(createPageUrl('Dashboard'));
              }}
              className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 font-bold px-8 py-4 text-base transition-colors"
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
              className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-200 font-medium px-2 py-4 text-base border-b border-stone-700 hover:border-stone-400 transition-colors"
            >
              See how it works
            </button>
          </div>
          <p className="mt-8 text-xs text-stone-600 tracking-wide">
            Free plan includes 5 feeds & 1 digest · No credit card required
          </p>
        </div>
      </section>

      {/* Divider strip */}
      <section className="border-y border-stone-800 py-5 bg-[#0d0a06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-[10px] font-medium text-stone-600 uppercase tracking-[0.2em]">
            Works with any RSS or Atom feed — news sites, blogs, newsletters, and more
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-28 bg-[#0a0805]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-stone-100 tracking-tight leading-none mb-4">
              Everything you need<br />to stay informed
            </h2>
            <p className="text-stone-400 max-w-lg text-lg">
              Powerful features built for professionals who need to track a lot — without spending hours doing it.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-stone-800/40">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="bg-[#0a0805] p-8 hover:bg-stone-900/50 transition-colors duration-200 group"
              >
                <div className="w-10 h-10 border border-amber-800/40 flex items-center justify-center mb-6 group-hover:border-amber-600/60 transition-colors">
                  <feature.icon className="w-5 h-5 text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-stone-200 mb-3 tracking-tight">{feature.title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PopularFeedsSection />

      {/* Integrations */}
      <section className="py-28 bg-[#0d0a06] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-stone-100 tracking-tight leading-none mb-4">
              Deliver where your<br />team works
            </h2>
            <p className="text-stone-400 max-w-lg text-lg">
              Each digest can be sent to multiple destinations — web inbox, Slack, Discord, and email.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-stone-800/40">
            {integrations.map((integ, idx) => (
              <div
                key={idx}
                className="bg-[#0d0a06] p-8 hover:bg-stone-900/50 transition-colors"
              >
                <div className="w-12 h-12 border border-amber-800/40 flex items-center justify-center mb-6">
                  <integ.icon className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-bold text-stone-200 mb-2">{integ.name}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{integ.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-28 bg-[#0a0805] border-t border-stone-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-stone-100 tracking-tight leading-none mb-4">
              Up and running<br />in minutes
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-stone-800/40">
            {[
              { step: '01', title: 'Add your feeds', desc: 'Paste any RSS or Atom URL. MergeRSS fetches and deduplicates articles automatically across all your sources.' },
              { step: '02', title: 'Configure a digest', desc: 'Choose which feeds or categories to include, set a schedule, and pick your delivery channels.' },
              { step: '03', title: 'Get your digest', desc: 'AI summarizes the best content and delivers a clean, readable digest right on time.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-[#0a0805] p-8 hover:bg-stone-900/50 transition-colors">
                <div className="text-6xl font-black text-stone-800 mb-4 leading-none select-none">{step}</div>
                <h3 className="text-lg font-bold text-stone-200 mb-3">{title}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 border-t border-stone-800 bg-[#0d0a06]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-5xl md:text-6xl font-black text-stone-100 tracking-tight leading-[0.95] mb-6">
            Stop drowning in tabs.<br />
            <span className="text-amber-400">Start reading smarter.</span>
          </h2>
          <p className="text-stone-400 text-lg mb-10 max-w-lg">
            Professionals use MergeRSS to cut through the noise and stay on top of what actually matters.
          </p>
          <button
            onClick={() => {
              base44.analytics.track({ eventName: 'cta_clicked', properties: { location: 'bottom', label: 'get_started_free' } });
              base44.auth.redirectToLogin(createPageUrl('Dashboard'));
            }}
            className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 font-bold px-10 py-4 text-base transition-colors"
          >
            Get started for free
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-stone-800 bg-[#0a0805]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-amber-400 flex items-center justify-center">
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
    </div>
  );
}