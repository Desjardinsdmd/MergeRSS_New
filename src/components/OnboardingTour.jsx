import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Rss, FileText, Inbox, Link2, ArrowRight, CheckCircle } from 'lucide-react';

const STEPS = [
  {
    icon: Rss,
    iconBg: 'bg-[hsl(var(--brand)/0.14)] border border-[hsl(var(--brand)/0.3)]',
    iconColor: 'text-[#C4A5FD]',
    step: 1,
    title: 'Add your sources',
    description:
      'Go to Sources and click "Add source". Paste in any RSS or Atom feed URL from news sites, blogs, or industry publications. Free accounts can add up to 5 sources.',
    action: { label: 'Go to Sources', page: 'Feeds' },
  },
  {
    icon: FileText,
    iconBg: 'bg-[hsl(var(--brand)/0.14)] border border-[hsl(var(--brand)/0.3)]',
    iconColor: 'text-[#C4A5FD]',
    step: 2,
    title: 'Create a briefing',
    description:
      'A briefing is your personalized newsletter. Choose which sources or categories to include, set a daily or weekly schedule, and pick the delivery time. MergeRSS will automatically summarize the best content for you.',
    action: { label: 'Go to Briefings', page: 'Digests' },
  },
  {
    icon: Inbox,
    iconBg: 'bg-[hsl(var(--brand)/0.14)] border border-[hsl(var(--brand)/0.3)]',
    iconColor: 'text-[#C4A5FD]',
    step: 3,
    title: 'Read in your Inbox',
    description:
      'Your briefings appear in the Inbox, a clean, readable view of AI-curated summaries. You can also send a test briefing at any time from Briefings.',
    action: { label: 'Go to Inbox', page: 'Inbox' },
  },
  {
    icon: Link2,
    iconBg: 'bg-[hsl(var(--brand)/0.14)] border border-[hsl(var(--brand)/0.3)]',
    iconColor: 'text-[#C4A5FD]',
    step: 4,
    title: 'Connect Slack or Discord (Premium)',
    description:
      'Upgrade to Premium to push your briefings directly to a Slack channel or Discord server. Head to the Integrations page to connect your workspace.',
    action: { label: 'Go to Integrations', page: 'Integrations' },
  },
];

export default function OnboardingTour({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const handleClose = async () => {
    await base44.auth.updateMe({ onboarding_complete: true });
    onComplete();
  };

  const handleNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setStepIndex(stepIndex + 1);
    }
  };

  const handleGoTo = async () => {
    await base44.auth.updateMe({ onboarding_complete: true });
    onComplete(true); // true = skip to walkthrough
    navigate(createPageUrl(step.action.page));
  };

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-stone-900 shadow-2xl">
        {/* Progress bar */}
        <div className="h-1 bg-white/[0.06]">
          <div
            className="h-1 bg-[hsl(var(--primary))] transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span className="micro-label">
              Step {step.step} of {STEPS.length}
            </span>
            <button
              onClick={handleClose}
              className="rounded-lg p-1 text-stone-500 transition hover:bg-white/[0.06] hover:text-stone-100"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Icon */}
          <div className={`w-12 h-12 ${step.iconBg} rounded-xl flex items-center justify-center mb-4`}>
            <Icon className={`w-6 h-6 ${step.iconColor}`} aria-hidden="true" />
          </div>

          {/* Content */}
          <h2 className="font-display text-xl font-semibold text-stone-100 mb-2">{step.title}</h2>
          <p className="text-[15px] text-stone-400 leading-relaxed mb-6">{step.description}</p>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStepIndex(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === stepIndex ? 'w-6 bg-[hsl(var(--primary))]' : 'w-2 bg-white/15 hover:bg-white/25'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleGoTo}
              className="flex-1"
            >
              {step.action.label}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1"
            >
              {isLast ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Done
                </>
              ) : (
                'Next'
              )}
            </Button>
          </div>

          {/* Skip */}
          <button
            onClick={handleClose}
            className="w-full text-center text-xs text-stone-500 hover:text-stone-200 mt-4 transition"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}