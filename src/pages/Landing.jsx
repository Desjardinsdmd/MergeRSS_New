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
  Check,
  ArrowRight,
  Slack,
  MessageCircle,
  BarChart3,
  Layers,
  TrendingUp,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: Layers,
    title: 'Aggregate Multiple Feeds',
    description: 'Combine RSS feeds from any source into a single, organized stream — no duplicates, no noise.'
  },
  {
    icon: Filter,
    title: 'Smart Categorization',
    description: 'Organize feeds by category and tags for precise content curation tailored to your workflow.'
  },
  {
    icon: Clock,
    title: 'Scheduled Digests',
    description: 'Receive daily or weekly AI-generated summaries delivered exactly when you need them.'
  },
  {
    icon: Zap,
    title: 'Instant Delivery',
    description: 'Push digests to Slack, Discord, or your web inbox the moment they\'re ready.'
  },
  {
    icon: BarChart3,
    title: 'AI-Powered Summaries',
    description: 'Our AI reads your feeds and writes concise, actionable summaries — saving you hours.'
  },
  {
    icon: Shield,
    title: 'Secure & Reliable',
    description: 'Enterprise-grade infrastructure with automatic retries and 99.9% uptime.'
  }
];

const integrations = [
  {
    name: 'Slack',
    description: 'Post digests to any channel with rich formatting',
    icon: Slack,
    bg: 'bg-[#4A154B]',
  },
  {
    name: 'Discord',
    description: 'Send to servers via webhook for instant delivery',
    icon: MessageCircle,
    bg: 'bg-[#5865F2]',
  },
  {
    name: 'Web Inbox',
    description: 'Access your full digest history anytime from the dashboard',
    icon: Bell,
    bg: 'bg-indigo-600',
  },
];

const categoryColors = {
  CRE: 'bg-orange-100 text-orange-700',
  Markets: 'bg-blue-100 text-blue-700',
  Tech: 'bg-purple-100 text-purple-700',
  News: 'bg-slate-100 text-slate-700',
  Finance: 'bg-green-100 text-green-700',
  Crypto: 'bg-yellow-100 text-yellow-700',
  AI: 'bg-indigo-100 text-indigo-700',
  Other: 'bg-gray-100 text-gray-700',
};

function PopularFeedsSection() {
  const [feeds, setFeeds] = useState([]);

  useEffect(() => {
    base44.entities.DirectoryFeed.list('-added_count', 8).then(setFeeds).catch(() => {});
  }, []);

  if (!feeds.length) return null;

  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-4">
            <TrendingUp className="w-3.5 h-3.5" />
            Trending in the community
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Popular Feeds
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Discover what other professionals are reading — add any feed with one click.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="bg-white border border-slate-100 rounded-xl p-5 hover:border-indigo-200 hover:shadow-md transition-all duration-200 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Rss className="w-4 h-4 text-indigo-600" />
                </div>
                {feed.category && (
                  <Badge className={`text-xs border-0 ${categoryColors[feed.category] || categoryColors.Other}`}>
                    {feed.category}
                  </Badge>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-1">{feed.name}</h3>
                {feed.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{feed.description}</p>
                )}
              </div>
              {feed.added_count > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Users className="w-3 h-3" />
                  {feed.added_count} subscriber{feed.added_count !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Button
            variant="outline"
            onClick={() => base44.auth.redirectToLogin(createPageUrl('Directory'))}
            className="border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            Browse all feeds in the directory
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white pt-32 pb-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.08),transparent)]" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            AI-powered RSS aggregation — now live
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 tracking-tight mb-6 leading-[1.05]">
            Your information,
            <br />
            <span className="text-indigo-600">curated & delivered</span>
          </h1>
          <p className="text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Aggregate RSS feeds from any source, let AI summarize what matters,
            and get it delivered to Slack, Discord, or your inbox — on your schedule.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
              className="h-12 px-8 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200"
            >
              Get started free
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
              className="h-12 px-8 text-base font-medium border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              See how it works
            </Button>
          </div>
          <p className="mt-5 text-sm text-slate-400">
            Free plan includes 5 feeds · No credit card required
          </p>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="border-y border-slate-100 py-5 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-medium text-slate-400 uppercase tracking-widest">
            Works with your favorite news sources
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Everything you need to stay informed
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Powerful features built for professionals who need signal without the noise
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="p-6 rounded-xl border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all duration-200 group"
              >
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition">
                  <feature.icon className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-24 bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              Deliver where your team works
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto">
              Push digests directly to Slack, Discord, or your web inbox
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {integrations.map((integ, idx) => (
              <div
                key={idx}
                className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center hover:border-slate-600 transition"
              >
                <div className={`w-14 h-14 ${integ.bg} rounded-xl flex items-center justify-center mx-auto mb-5`}>
                  <integ.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{integ.name}</h3>
                <p className="text-slate-400 text-sm">{integ.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Up and running in minutes
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Add your feeds', desc: 'Paste any RSS/Atom URL. MergeRSS fetches and deduplicates everything automatically.' },
              { step: '02', title: 'Configure a digest', desc: 'Choose your feeds, categories, frequency, and preferred delivery channels.' },
              { step: '03', title: 'Receive summaries', desc: 'AI generates a clean, readable digest and delivers it right on schedule.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative">
                <div className="text-5xl font-black text-slate-100 mb-4 leading-none">{step}</div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Start reading smarter today
          </h2>
          <p className="text-lg text-slate-500 mb-8">
            Join professionals using MergeRSS to stay on top of what matters.
          </p>
          <Button
            size="lg"
            onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
            className="h-12 px-10 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200"
          >
            Get started for free
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Rss className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-slate-900">MergeRSS</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <Link to={createPageUrl('Pricing')} className="hover:text-slate-600 transition">Pricing</Link>
              <a href="mailto:support@mergerss.com" className="hover:text-slate-600 transition">Support</a>
            </div>
            <p className="text-sm text-slate-400">© {new Date().getFullYear()} MergeRSS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}