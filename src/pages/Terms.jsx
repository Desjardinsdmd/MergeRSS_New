import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Rss } from 'lucide-react';

export default function Terms() {
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
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-slate-400 text-sm">Last updated: March 1, 2026</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-600">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Acceptance</h2>
            <p>By creating an account or using MergeRSS, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Description of Service</h2>
            <p>MergeRSS is an RSS aggregation and digest delivery platform. It allows users to subscribe to RSS/Atom feeds, configure AI-generated digest summaries, and deliver those digests to configured destinations including web inbox, Slack, Discord, and email.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Accounts</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when creating your account. You are responsible for all activity that occurs under your account.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use MergeRSS to aggregate feeds you do not have the right to access</li>
              <li>Attempt to circumvent rate limits, access controls, or technical restrictions</li>
              <li>Use the service for any unlawful purpose</li>
              <li>Scrape or reverse-engineer the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Subscriptions and Billing</h2>
            <p>Free plans are available with feature limitations. Premium plans are billed monthly or annually via Stripe. Cancellations take effect at the end of the current billing period. We do not offer refunds for partial periods.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. AI-Generated Content</h2>
            <p>AI summaries are generated automatically and may not be perfectly accurate. MergeRSS does not guarantee the accuracy or completeness of AI-generated summaries. Always refer to original source articles for critical decisions.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Content Ownership</h2>
            <p>You retain ownership of your account data and configurations. RSS feed content belongs to its respective publishers. MergeRSS does not claim ownership of any content fetched from third-party feeds.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Service Availability</h2>
            <p>We aim for high availability but do not guarantee uninterrupted service. We may perform maintenance, updates, or face outages that temporarily affect service delivery.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Limitation of Liability</h2>
            <p>MergeRSS is provided "as is." To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Changes to Terms</h2>
            <p>We may update these terms. Continued use of the service after changes constitutes acceptance of the new terms. We will notify you of material changes via email.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Contact</h2>
            <p>Questions? Email us at <a href="mailto:support@mergerss.com" className="text-indigo-600 hover:underline">support@mergerss.com</a>.</p>
          </section>
        </div>
      </div>

      <footer className="py-8 border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-4 text-center text-sm text-slate-400 flex gap-6 justify-center">
          <Link to={createPageUrl('Landing')} className="hover:text-slate-600 transition">Home</Link>
          <Link to={createPageUrl('Privacy')} className="hover:text-slate-600 transition">Privacy Policy</Link>
          <a href="mailto:support@mergerss.com" className="hover:text-slate-600 transition">Support</a>
        </div>
      </footer>
    </div>
  );
}