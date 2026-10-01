import React from 'react';
import LegalDoc, { LegalList, legalLink } from '@/components/landing/LegalDoc';

const sections = [
  {
    title: 'Acceptance',
    body: <p>By creating an account or using MergeRSS, you agree to these Terms of Service. If you do not agree, do not use the service.</p>,
  },
  {
    title: 'Description of service',
    body: (
      <p>
        MergeRSS is an RSS aggregation and briefing delivery platform. It allows users to subscribe to RSS/Atom feeds, configure
        AI-generated briefing summaries, and deliver those briefings to configured destinations including web inbox, Slack, Discord, and
        email.
      </p>
    ),
  },
  {
    title: 'Accounts',
    body: (
      <p>
        You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when
        creating your account. You are responsible for all activity that occurs under your account.
      </p>
    ),
  },
  {
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <LegalList
          items={[
            'Use MergeRSS to aggregate sources you do not have the right to access',
            'Attempt to circumvent rate limits, access controls, or technical restrictions',
            'Use the service for any unlawful purpose',
            'Scrape or reverse-engineer the platform',
          ]}
        />
      </>
    ),
  },
  {
    title: 'Subscriptions and billing',
    body: (
      <p>
        Free plans are available with feature limitations. Premium plans are billed monthly or annually via Stripe. Cancellations take
        effect at the end of the current billing period. We do not offer refunds for partial periods.
      </p>
    ),
  },
  {
    title: 'AI-generated content',
    body: (
      <p>
        AI summaries are generated automatically and may not be perfectly accurate. MergeRSS does not guarantee the accuracy or
        completeness of AI-generated summaries. Always refer to the original source stories for critical decisions.
      </p>
    ),
  },
  {
    title: 'Content ownership',
    body: (
      <p>
        You retain ownership of your account data and configurations. RSS feed content belongs to its respective publishers. MergeRSS does
        not claim ownership of any content fetched from third-party sources.
      </p>
    ),
  },
  {
    title: 'Service availability',
    body: (
      <p>
        We aim for high availability but do not guarantee uninterrupted service. We may perform maintenance, updates, or face outages that
        temporarily affect service delivery.
      </p>
    ),
  },
  {
    title: 'Limitation of liability',
    body: (
      <p>
        MergeRSS is provided &quot;as is.&quot; To the maximum extent permitted by law, we are not liable for indirect, incidental, or
        consequential damages arising from your use of the service.
      </p>
    ),
  },
  {
    title: 'Changes to terms',
    body: (
      <p>
        We may update these terms. Continued use of the service after changes constitutes acceptance of the new terms. We will notify you
        of material changes via email.
      </p>
    ),
  },
  {
    title: 'Contact',
    body: (
      <p>
        Questions? Email us at <a href="mailto:support@mergerss.com" className={legalLink}>support@mergerss.com</a>.
      </p>
    ),
  },
];

export default function Terms() {
  return <LegalDoc eyebrow="Legal" title="Terms of Service" updated="March 1, 2026" sections={sections} />;
}
