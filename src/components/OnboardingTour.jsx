import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Rss, FileText, Inbox, Link2, ArrowRight, CheckCircle } from 'lucide-react';

const STEPS = [
  {
    icon: Rss,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    step: 1,
    title: 'Add your RSS Feeds',
    description:
      'Go to the Feeds page and click "Add Feed". Paste in any RSS or Atom feed URL from news sites, blogs, or industry sources. Free accounts can add up to 5 feeds.',
    action: { label: 'Go to Feeds', page: 'Feeds' },
  },
  {
    icon: FileText,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    step: 2,
    title: 'Create a Digest',
    description:
      'A Digest is your personalized newsletter. Choose which feeds or categories to include, set a daily or weekly schedule, and pick the delivery time. MergeRSS will automatically summarize the best content for you.',
    action: { label: 'Go to Digests', page: 'Digests' },
  },
  {
    icon: Inbox,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    step: 3,
    title: 'Read in your Inbox',
    description:
      'Your generated digests appear in the Inbox — a clean, readable view of AI-curated summaries. You can also send a test digest at any time from the Digests page.',
    action: { label: 'Go to Inbox', page: 'Inbox' },
  },
  {
    icon: Link2,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    step: 4,
    title: 'Connect Slack or Discord (Premium)',
    description:
      'Upgrade to Premium to push your digests directly to a Slack channel or Discord server. Head to the Integrations page to connect your workspace.',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 bg-indigo-600 transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Step {step.step} of {STEPS.length}
            </span>
            <button
              onClick={handleClose}
              className="p-1 text-slate-400 hover:text-slate-600 transition rounded-md hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Icon */}
          <div className={`w-12 h-12 ${step.iconBg} rounded-xl flex items-center justify-center mb-4`}>
            <Icon className={`w-6 h-6 ${step.iconColor}`} />
          </div>

          {/* Content */}
          <h2 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h2>
          <p className="text-slate-600 leading-relaxed mb-6">{step.description}</p>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStepIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === stepIndex ? 'w-6 bg-indigo-600' : 'w-2 bg-slate-200 hover:bg-slate-300'
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
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
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
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-4 transition"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}