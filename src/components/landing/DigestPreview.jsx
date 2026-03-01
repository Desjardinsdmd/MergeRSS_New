import React from 'react';
import { Rss, Zap, Clock } from 'lucide-react';

const sampleItems = [
  {
    category: 'AI',
    source: 'TechCrunch',
    title: 'OpenAI releases new reasoning model with 40% latency improvement',
    summary: 'The latest model significantly outperforms its predecessor on math and coding benchmarks while cutting response times nearly in half. Developers can access it via API starting today.',
    time: '2h ago',
    color: 'bg-indigo-100 text-indigo-700',
  },
  {
    category: 'Markets',
    source: 'Bloomberg',
    title: 'Fed signals two rate cuts in 2026 as inflation cools to 2.3%',
    summary: 'Federal Reserve officials indicated growing confidence that inflation is sustainably returning to target, opening the door to policy easing in the second half of the year.',
    time: '4h ago',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    category: 'CRE',
    source: 'CoStar',
    title: 'Office vacancy rates stabilize in top 10 metros for first time since 2020',
    summary: 'New leasing activity in gateway cities outpaced move-outs last quarter, a potential turning point for a sector that has struggled since the pandemic-era shift to hybrid work.',
    time: '6h ago',
    color: 'bg-orange-100 text-orange-700',
  },
];

export default function DigestPreview() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-4">
            <Zap className="w-3.5 h-3.5" />
            Sample AI briefing
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            This is what lands in your inbox
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Every morning, AI reads hundreds of articles across your feeds and writes you a clean, scannable briefing — in minutes.
          </p>
        </div>

        {/* Mock digest card */}
        <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Rss className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Morning Briefing</p>
                <p className="text-slate-400 text-xs">Sunday, March 1, 2026</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Clock className="w-3.5 h-3.5" />
              Delivered at 7:00 AM
            </div>
          </div>

          {/* Items */}
          <div className="divide-y divide-slate-100">
            {sampleItems.map((item, idx) => (
              <div key={idx} className="px-6 py-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.color}`}>
                    {item.category}
                  </span>
                  <span className="text-xs text-slate-400">{item.source}</span>
                  <span className="text-xs text-slate-300 ml-auto">{item.time}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5 leading-snug">{item.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{item.summary}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">3 of 18 stories · AI-summarized</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-slate-400">Delivered via Web Inbox</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}