import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import {
  X, Mail, Hash, MessageSquare, ArrowRight, Sparkles, Check,
  Rss, FileText, Inbox, Zap, Globe, Users, Link2
} from 'lucide-react';

const SITE_SECTIONS = [
  {
    icon: Rss,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'Feeds',
    description: 'Add RSS/Atom feed URLs from any news site, blog, or industry source. MergeRSS fetches and stores all articles in one place so nothing slips through the cracks.',
    page: 'Feeds',
    linkLabel: 'Go to Feeds',
  },
  {
    icon: FileText,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'Digests',
    description: 'A Digest is your personalized AI newsletter. Choose feeds or categories, set a daily/weekly/monthly schedule, and MergeRSS automatically summarizes the best content and delivers it.',
    page: 'Digests',
    linkLabel: 'Go to Digests',
  },
  {
    icon: Inbox,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'Inbox',
    description: 'All your generated digests land here in a clean, readable view. Browse AI-curated summaries and click through to original articles whenever something catches your eye.',
    page: 'Inbox',
    linkLabel: 'Go to Inbox',
  },
  {
    icon: Zap,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'AI Curator',
    description: 'Let AI scan your feeds and surface the most relevant content based on your interests. Get smart recommendations without manually browsing every article.',
    page: 'FeedCurator',
    linkLabel: 'Try AI Curator',
  },
  {
    icon: Globe,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'Directory',
    description: 'Browse and discover feeds and digests shared by the community. Add popular sources to your own setup in one click, or share yours publicly.',
    page: 'Directory',
    linkLabel: 'Browse Directory',
  },
  {
    icon: Users,
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-600',
    title: 'Team',
    description: 'Invite colleagues to collaborate. Team members can share feeds and digests, making it easy to keep your whole team informed with the same curated content.',
    page: 'Team',
    linkLabel: 'Manage Team',
  },
  {
    icon: Link2,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    title: 'Integrations',
    description: 'Connect Slack or Discord to push digests directly to your channels. You can also enable email delivery on any digest so updates arrive right in your inbox.',
    page: 'Integrations',
    linkLabel: 'Connect Apps',
  },
];

const DELIVERY_OPTIONS = [
  {
    id: 'slack',
    icon: Hash,
    iconBg: 'bg-[#4A154B]/10',
    iconColor: 'text-[#4A154B]',
    label: 'Slack',
    description: 'Push digests to a Slack channel',
    page: 'Integrations',
  },
  {
    id: 'email',
    icon: Mail,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    label: 'Email',
    description: 'Receive digests in your inbox',
    page: 'Digests',
  },
  {
    id: 'discord',
    icon: MessageSquare,
    iconBg: 'bg-[#5865F2]/10',
    iconColor: 'text-[#5865F2]',
    label: 'Discord',
    description: 'Send digests to a Discord server',
    page: 'Integrations',
  },
];

// Total steps = sections + 1 delivery step
const TOTAL_STEPS = SITE_SECTIONS.length + 1;

export default function SetupWalkthrough({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState([]);
  const navigate = useNavigate();

  const isDeliveryStep = stepIndex === SITE_SECTIONS.length;
  const section = !isDeliveryStep ? SITE_SECTIONS[stepIndex] : null;

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const markDone = async () => {
    await base44.auth.updateMe({ setup_walkthrough_complete: true });
    onComplete();
  };

  const handleNext = () => {
    if (stepIndex < TOTAL_STEPS - 1) {
      setStepIndex(stepIndex + 1);
    }
  };

  const handleGoTo = async (page) => {
    await base44.auth.updateMe({ setup_walkthrough_complete: true });
    onComplete();
    navigate(createPageUrl(page));
  };

  const handleDeliverySetup = async () => {
    await base44.auth.updateMe({ setup_walkthrough_complete: true });
    onComplete();
    if (selected.includes('slack') || selected.includes('discord')) {
      navigate(createPageUrl('Integrations'));
    } else if (selected.includes('email')) {
      navigate(createPageUrl('Digests'));
    }
  };

  const Icon = section?.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                {isDeliveryStep ? 'Setup' : `${stepIndex + 1} of ${TOTAL_STEPS}`}
              </span>
            </div>
            <button
              onClick={markDone}
              className="p-1 text-slate-400 hover:text-slate-600 transition rounded-md hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Section tour step */}
          {!isDeliveryStep && section && (
            <>
              <div className={`w-12 h-12 ${section.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                <Icon className={`w-6 h-6 ${section.iconColor}`} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">{section.title}</h2>
              <p className="text-slate-600 leading-relaxed mb-6">{section.description}</p>

              {/* Step dots */}
              <div className="flex items-center gap-1.5 mb-6">
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStepIndex(i)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === stepIndex ? 'w-6 bg-indigo-600' : 'w-2 bg-slate-200 hover:bg-slate-300'
                    }`}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => handleGoTo(section.page)} className="flex-1">
                  {section.linkLabel}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button onClick={handleNext} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                  Next
                </Button>
              </div>

              <button
                onClick={markDone}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-4 transition"
              >
                Skip walkthrough
              </button>
            </>
          )}

          {/* Delivery setup step */}
          {isDeliveryStep && (
            <>
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                How would you like to receive your digests?
              </h2>
              <p className="text-slate-500 text-sm mb-5">
                Select all that apply — you can change this anytime.
              </p>

              <div className="space-y-3 mb-6">
                {DELIVERY_OPTIONS.map((item) => {
                  const DIcon = item.icon;
                  const isSelected = selected.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/50'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                        <DIcon className={`w-5 h-5 ${item.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={markDone} className="flex-1">
                  Skip for now
                </Button>
                <Button
                  onClick={selected.length > 0 ? handleDeliverySetup : markDone}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  disabled={selected.length === 0}
                >
                  Set up now
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              {selected.length === 0 && (
                <p className="text-center text-xs text-slate-400 mt-3">
                  Select an option or skip
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}