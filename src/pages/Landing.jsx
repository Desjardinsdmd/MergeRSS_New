import React from 'react';
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
  MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Rss,
    title: 'Aggregate Multiple Feeds',
    description: 'Combine RSS feeds from any source into a single, organized stream.'
  },
  {
    icon: Filter,
    title: 'Smart Categorization',
    description: 'Organize feeds by category and tags for precise content curation.'
  },
  {
    icon: Clock,
    title: 'Scheduled Digests',
    description: 'Get daily or weekly summaries delivered on your schedule.'
  },
  {
    icon: Zap,
    title: 'Instant Delivery',
    description: 'Push digests to Slack, Discord, or your web inbox instantly.'
  },
  {
    icon: Bell,
    title: 'Smart Deduplication',
    description: 'Never see duplicate content across your feeds.'
  },
  {
    icon: Shield,
    title: 'Secure & Reliable',
    description: 'Enterprise-grade security with 99.9% uptime.'
  }
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-white to-indigo-50" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-violet-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
          <div className="absolute top-40 right-10 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse animation-delay-2000" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-100 rounded-full text-sm text-violet-700 font-medium mb-8">
              <Zap className="w-4 h-4" />
              Aggregate, curate, deliver — automatically
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 tracking-tight mb-6">
              RSS feeds,
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent"> beautifully merged</span>
            </h1>
            
            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Turn overwhelming RSS feeds into curated digests. 
              Delivered to Slack, Discord, or your inbox — on your schedule.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="lg"
                onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                className="bg-violet-600 hover:bg-violet-700 h-12 px-8 text-base"
              >
                Start for free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Link to={createPageUrl('Pricing')}>
                <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                  View pricing
                </Button>
              </Link>
            </div>

            <div className="flex items-center justify-center gap-8 mt-12 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                5 feeds free forever
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Everything you need for RSS management
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Powerful features to aggregate, filter, and deliver your content
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-lg hover:border-violet-100 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Deliver where your team works
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Push digests directly to Slack, Discord, or your web inbox
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 text-center border border-slate-700">
              <div className="w-16 h-16 bg-[#4A154B] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Slack className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Slack</h3>
              <p className="text-slate-400">Post digests to any channel with rich formatting</p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 text-center border border-slate-700">
              <div className="w-16 h-16 bg-[#5865F2] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Discord</h3>
              <p className="text-slate-400">Send to servers via webhook or bot integration</p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 text-center border border-slate-700">
              <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Bell className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Web Inbox</h3>
              <p className="text-slate-400">Access your digests anytime from the dashboard</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Ready to streamline your RSS?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start with 5 free feeds. No credit card required.
          </p>
          <Button 
            size="lg"
            onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
            className="bg-violet-600 hover:bg-violet-700 h-12 px-8 text-base"
          >
            Get started free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Rss className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-slate-900">MergeRSS</span>
            </div>
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} MergeRSS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}