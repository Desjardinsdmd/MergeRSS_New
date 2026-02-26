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
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-[#171a20] tracking-tight mb-6 leading-none">
              RSS feeds,
              <br />
              <span className="text-[#e82127]">beautifully merged</span>
            </h1>
            
            <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              Turn overwhelming RSS feeds into curated digests. 
              Delivered to Slack, Discord, or your inbox — on your schedule.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="lg"
                onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                className="bg-[#171a20] hover:bg-black h-14 px-12 text-base font-medium rounded-sm"
              >
                Order Now
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                className="h-14 px-12 text-base font-medium border-2 border-[#171a20] hover:bg-[#171a20] hover:text-white rounded-sm"
              >
                Demo Drive
              </Button>
            </div>

            <p className="mt-8 text-sm text-slate-500 font-light">
              Free plan includes 5 feeds • No credit card required
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-[#171a20] mb-4 tracking-tight">
              Built for Efficiency
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto font-light">
              Powerful features to aggregate, filter, and deliver your content
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className="p-8 bg-white border border-slate-100 hover:shadow-xl transition-all duration-300"
              >
                <feature.icon className="w-8 h-8 text-[#171a20] mb-6" />
                <h3 className="text-lg font-semibold text-[#171a20] mb-3 tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-slate-600 font-light">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-24 bg-[#171a20]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Deliver Anywhere
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto font-light">
              Push digests directly to Slack, Discord, or your web inbox
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="bg-[#1f2229] p-10 text-center border border-slate-800 hover:border-slate-700 transition">
              <div className="w-16 h-16 bg-[#4A154B] flex items-center justify-center mx-auto mb-6">
                <Slack className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">Slack</h3>
              <p className="text-slate-400 font-light">Post digests to any channel with rich formatting</p>
            </div>

            <div className="bg-[#1f2229] p-10 text-center border border-slate-800 hover:border-slate-700 transition">
              <div className="w-16 h-16 bg-[#5865F2] flex items-center justify-center mx-auto mb-6">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">Discord</h3>
              <p className="text-slate-400 font-light">Send to servers via webhook or bot integration</p>
            </div>

            <div className="bg-[#1f2229] p-10 text-center border border-slate-800 hover:border-slate-700 transition">
              <div className="w-16 h-16 bg-[#e82127] flex items-center justify-center mx-auto mb-6">
                <Bell className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">Web Inbox</h3>
              <p className="text-slate-400 font-light">Access your digests anytime from the dashboard</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-[#171a20] mb-6 tracking-tight">
            Experience MergeRSS
          </h2>
          <p className="text-lg text-slate-600 mb-12 font-light">
            Start with 5 free feeds. No credit card required.
          </p>
          <Button 
            size="lg"
            onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
            className="bg-[#171a20] hover:bg-black h-14 px-12 text-base font-medium rounded-sm"
          >
            Order Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-[#171a20] border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-sm flex items-center justify-center">
                <Rss className="w-4 h-4 text-[#171a20]" />
              </div>
              <span className="font-semibold text-white tracking-tight">MergeRSS</span>
            </div>
            <p className="text-sm text-slate-400 font-light">
              © {new Date().getFullYear()} MergeRSS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}