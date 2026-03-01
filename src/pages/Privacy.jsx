import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Rss } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="mb-10">
          <Link to={createPageUrl('Landing')} className="flex items-center gap-2 mb-8">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Rss className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-slate-900">MergeRSS</span>
          </Link>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-slate-400 text-sm">Last updated: March 1, 2026</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-600">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. What We Collect</h2>
            <p>When you create an account, we collect your email address and name. When you use MergeRSS, we store the RSS feed URLs you add, the digest configurations you create, and delivery destination settings (Slack channel IDs, Discord webhook URLs). We do not store the full content of your feeds beyond what is needed to generate and deliver your digests.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To fetch and aggregate your RSS feeds on a schedule</li>
              <li>To generate AI-powered summaries of article content using third-party AI providers</li>
              <li>To deliver digests to your configured destinations (web inbox, Slack, Discord, email)</li>
              <li>To manage your subscription and billing via Stripe</li>
              <li>To send transactional emails (digest deliveries, account notices)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. AI Summarization</h2>
            <p>When AI summarization is enabled on a digest, article text fetched from your RSS feeds is sent to a third-party AI model provider to generate summaries. We do not use your feed content to train AI models. Summaries are generated on demand and stored only as part of your digest delivery records.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Third-Party Services</h2>
            <p>We use the following third-party processors:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Stripe</strong> — payment processing and subscription management</li>
              <li><strong>AI model providers</strong> — article summarization (when enabled)</li>
              <li>Your connected destinations (Slack, Discord) receive digest content you configure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Data Retention</h2>
            <p>Your account data is retained as long as your account is active. Feed items and digest deliveries are retained for 90 days. You may request deletion of your account and associated data by contacting us at support@mergerss.com.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Your Rights</h2>
            <p>Depending on your location, you may have rights under GDPR (EU/EEA) or CCPA (California) including the right to access, correct, or delete your personal data, and the right to opt out of certain processing. To exercise these rights, contact us at support@mergerss.com.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Cookies</h2>
            <p>We use only essential session cookies required for authentication. We do not use advertising or tracking cookies.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Contact</h2>
            <p>Questions about this policy? Email us at <a href="mailto:support@mergerss.com" className="text-indigo-600 hover:underline">support@mergerss.com</a>.</p>
          </section>
        </div>
      </div>

      <footer className="py-8 border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-4 text-center text-sm text-slate-400 flex gap-6 justify-center">
          <Link to={createPageUrl('Landing')} className="hover:text-slate-600 transition">Home</Link>
          <Link to={createPageUrl('Terms')} className="hover:text-slate-600 transition">Terms of Service</Link>
          <a href="mailto:support@mergerss.com" className="hover:text-slate-600 transition">Support</a>
        </div>
      </footer>
    </div>
  );
}