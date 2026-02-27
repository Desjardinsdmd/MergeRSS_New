import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { X, Mail, Hash, MessageSquare, ArrowRight, Sparkles, Check } from 'lucide-react';

const INTEGRATIONS = [
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

export default function SetupWalkthrough({ onComplete }) {
  const [selected, setSelected] = useState([]);
  const navigate = useNavigate();

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const markDone = async () => {
    await base44.auth.updateMe({ setup_walkthrough_complete: true });
    onComplete();
  };

  const handleSetup = async () => {
    await base44.auth.updateMe({ setup_walkthrough_complete: true });
    onComplete();
    // Navigate to integrations if slack or discord selected, else digests for email
    if (selected.includes('slack') || selected.includes('discord')) {
      navigate(createPageUrl('Integrations'));
    } else if (selected.includes('email')) {
      navigate(createPageUrl('Digests'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Top accent */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Quick Setup
              </span>
            </div>
            <button
              onClick={markDone}
              className="p-1 text-slate-400 hover:text-slate-600 transition rounded-md hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-1">
            How would you like to receive your digests?
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            Select all that apply — you can always change this later in settings.
          </p>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {INTEGRATIONS.map((item) => {
              const Icon = item.icon;
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
                    <Icon className={`w-5 h-5 ${item.iconColor}`} />
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

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={markDone} className="flex-1">
              Skip for now
            </Button>
            <Button
              onClick={selected.length > 0 ? handleSetup : markDone}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              disabled={selected.length === 0}
            >
              Set up now
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {selected.length === 0 && (
            <p className="text-center text-xs text-slate-400 mt-3">
              Select at least one option to continue, or skip
            </p>
          )}
        </div>
      </div>
    </div>
  );
}