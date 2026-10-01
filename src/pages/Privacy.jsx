import React from 'react';
import LegalDoc, { LegalList, legalLink } from '@/components/landing/LegalDoc';

const SUPPORT = <a href="mailto:support@mergerss.com" className={legalLink}>support@mergerss.com</a>;

const sections = [
  {
    title: 'What we collect',
    body: (
      <p>
        When you create an account, we collect your email address and name. When you use MergeRSS, we store the RSS feed URLs you add,
        the briefing configurations you create, and delivery destination settings (Slack channel IDs, Discord webhook URLs). We do not
        store the full content of your sources beyond what is needed to generate and deliver your briefings.
      </p>
    ),
  },
  {
    title: 'How we use your data',
    body: (
      <LegalList
        items={[
          'To fetch and aggregate your RSS feeds on a schedule',
          'To generate AI-powered summaries of story content using third-party AI providers',
          'To deliver briefings to your configured destinations (web inbox, Slack, Discord, email)',
          'To manage your subscription and billing via Stripe',
          'To send transactional emails (briefing deliveries, account notices)',
        ]}
      />
    ),
  },
  {
    title: 'AI summarization',
    body: (
      <p>
        When AI summarization is enabled on a briefing, story text fetched from your RSS feeds is sent to a third-party AI model provider
        to generate summaries. We do not use your source content to train AI models. Summaries are generated on demand and stored only as
        part of your briefing delivery records.
      </p>
    ),
  },
  {
    title: 'Third-party services',
    body: (
      <>
        <p>We use the following third-party processors:</p>
        <LegalList
          items={[
            <><strong className="font-semibold text-stone-100">Stripe</strong>: payment processing and subscription management</>,
            <><strong className="font-semibold text-stone-100">AI model providers</strong>: story summarization (when enabled)</>,
            'Your connected destinations (Slack, Discord) receive the briefing content you configure',
          ]}
        />
      </>
    ),
  },
  {
    title: 'Data retention',
    body: (
      <p>
        Your account data is retained as long as your account is active. Stories and briefing deliveries are retained for 90 days. You may
        request deletion of your account and associated data by contacting us at {SUPPORT}.
      </p>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <p>
        Depending on your location, you may have rights under GDPR (EU/EEA) or CCPA (California) including the right to access, correct,
        or delete your personal data, and the right to opt out of certain processing. To exercise these rights, contact us at {SUPPORT}.
      </p>
    ),
  },
  {
    title: 'Cookies',
    body: <p>We use only essential session cookies required for authentication. We do not use advertising or tracking cookies.</p>,
  },
  {
    title: 'Contact',
    body: <p>Questions about this policy? Email us at {SUPPORT}.</p>,
  },
];

export default function Privacy() {
  return <LegalDoc eyebrow="Legal" title="Privacy Policy" updated="March 1, 2026" sections={sections} />;
}
