import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Rss, ArrowRight, ArrowLeft, Check, Loader2, Plus, Upload, Mail, Clock, Globe2,
  Sparkles, AlertCircle, CheckCircle2, Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STARTER_PACKS, CUSTOM_PACK_ID, buildSuggestions, urlKey } from '@/components/onboarding/starterPacks';
import BriefingMarkdown from '@/components/onboarding/BriefingMarkdown';

const STEPS = [
  { id: 'field', label: 'Your field' },
  { id: 'sources', label: 'Sources' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'build', label: 'Briefing' },
];

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0805]';
const SOURCE_CHUNK = 3;
const SOURCE_CONCURRENCY = 3;

function track(eventName, properties = {}) {
  try { base44.analytics.track({ eventName, properties }); } catch { /* optional */ }
}

function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch { return 'America/New_York'; }
}

function timezoneOptions(current) {
  let list = [];
  try { list = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; } catch { list = []; }
  if (!list.length) list = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
  return list.includes(current) ? list : [current, ...list];
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function errMessage(err, fallback) {
  return err?.response?.data?.error || err?.data?.error || err?.message || fallback;
}

const DIRECTORY_QUERY_KEY = ['welcome-directory'];
async function fetchDirectory() {
  try {
    const res = await withTimeout(base44.functions.invoke('publicDirectory', { action: 'list' }), 12000);
    return res?.data?.feeds || [];
  } catch {
    return [];
  }
}

function hostOf(url) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { return url; }
}

function StepDots({ current }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <ol className="flex items-center gap-2" aria-label="Setup progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 rounded-full transition-all',
              i < idx ? 'w-6 bg-[hsl(var(--primary))]/60' : i === idx ? 'w-10 bg-[hsl(var(--primary))]' : 'w-6 bg-stone-800'
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{`Step ${i + 1} of ${STEPS.length}: ${s.label}${i === idx ? ' (current)' : i < idx ? ' (done)' : ''}`}</span>
        </li>
      ))}
    </ol>
  );
}

function ProgressRow({ state, label, detail }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">
        {state === 'done' ? <CheckCircle2 className="w-5 h-5 text-[hsl(var(--primary))]" />
          : state === 'active' ? <Loader2 className="w-5 h-5 text-[hsl(var(--primary))] animate-spin" />
          : state === 'error' ? <AlertCircle className="w-5 h-5 text-red-400" />
          : <Circle className="w-5 h-5 text-stone-700" />}
      </span>
      <div className="min-w-0">
        <p className={cn('text-sm font-medium', state === 'pending' ? 'text-stone-600' : 'text-stone-200')}>{label}</p>
        {detail && <p className="text-xs text-stone-500 mt-0.5">{detail}</p>}
      </div>
    </li>
  );
}

export default function Welcome() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('field');
  const headingRef = useRef(null);

  // Step 1
  const [packs, setPacks] = useState([]);
  const [customText, setCustomText] = useState('');
  const [interestProfile, setInterestProfile] = useState('');

  // Step 2
  const [suggestions, setSuggestions] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestNote, setSuggestNote] = useState('');
  const [ownUrl, setOwnUrl] = useState('');
  const [ownUrlError, setOwnUrlError] = useState('');
  const [showOwnUrl, setShowOwnUrl] = useState(false);
  const builtFor = useRef('');

  // Step 3
  const [delivery, setDelivery] = useState({ email: true, time: '07:00', timezone: detectTimezone(), frequency: 'daily' });

  // Step 4
  const [progress, setProgress] = useState({ phase: 'idle', done: 0, total: 0, added: 0, failed: 0, error: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.interest_profile) setInterestProfile(u.interest_profile);
    }).catch(() => {});
    track('onboarding_started');
  }, []);

  // Move focus to the step heading on every step change (screen readers + keyboard users).
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  // Prefetch the public directory while the user picks a field.
  useQuery({
    queryKey: DIRECTORY_QUERY_KEY,
    queryFn: fetchDirectory,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const isCustom = packs.includes(CUSTOM_PACK_ID);
  const packIds = packs.filter(p => p !== CUSTOM_PACK_ID);
  const packLabels = packIds.map(id => STARTER_PACKS.find(p => p.id === id)?.label).filter(Boolean);
  const fieldOk = packIds.length > 0 || (isCustom && customText.trim().length >= 2);

  const togglePack = (id) => {
    setPacks(prev => prev.includes(id) ? prev.filter(p => p !== id) : (prev.length >= 3 ? prev : [...prev, id]));
  };

  // What the backend stores as interest_field and uses for the briefing name.
  const fieldPayload = () => {
    if (packIds.length === 1 && !isCustom) return { field: packIds[0] };
    const labels = [...packLabels, ...(isCustom && customText.trim() ? [customText.trim()] : [])];
    return { field: packIds[0] || CUSTOM_PACK_ID, custom_field: labels.join(', ').slice(0, 80) };
  };

  const markOnboarded = async () => {
    const stamp = user?.last_visit_date ? {} : { last_visit_date: new Date().toDateString() };
    try { await base44.auth.updateMe({ onboarding_complete: true, setup_walkthrough_complete: true, ...stamp }); } catch { /* still leave */ }
  };

  const handleSkip = async (dest = '/Feeds') => {
    track('onboarding_skipped', { step });
    setBusy(true);
    await markOnboarded();
    window.location.assign(dest);
  };

  // Build the source list when entering step 2 (only when the field choice changed).
  const loadSuggestions = async () => {
    const signature = JSON.stringify([packs, customText.trim()]);
    if (builtFor.current === signature && suggestions.length) return;
    builtFor.current = signature;
    setSuggestNote('');
    setSuggestLoading(true);
    let dir = [];
    try {
      dir = await queryClient.fetchQuery({ queryKey: DIRECTORY_QUERY_KEY, queryFn: fetchDirectory, staleTime: 10 * 60 * 1000 });
    } catch { dir = []; }
    let list = buildSuggestions(packIds, dir || [], { max: 12 });

    if (isCustom && customText.trim()) {
      try {
        const res = await withTimeout(base44.functions.invoke('suggestFeeds', {
          query: [customText.trim(), interestProfile.trim()].filter(Boolean).join('. ').slice(0, 400),
        }), 60000);
        const seen = new Set(list.map(f => f.key));
        const extra = (res?.data?.feeds || [])
          .filter(f => f?.url && !seen.has(urlKey(f.url)))
          .map(f => ({ key: urlKey(f.url), name: f.name || hostOf(f.url), url: f.url, category: f.category || 'Other', description: f.description || '', origin: 'ai' }));
        list = [...extra, ...list].slice(0, 12);
        if (!extra.length) setSuggestNote('We could not find verified feeds for that topic yet. Add your own URLs below, or pick a starter pack.');
      } catch {
        setSuggestNote('Finding sources for your topic took too long. Add your own URLs below, or go back and pick a starter pack.');
      }
    }
    setSuggestLoading(false);

    const keys = new Set(list.map(f => f.key));
    const own = suggestions.filter(f => f.origin === 'own' && !keys.has(f.key));
    setSuggestions([...list, ...own]);
    setChecked(prev => new Set([...list.map(f => f.key), ...own.filter(f => prev.has(f.key)).map(f => f.key)]));
  };

  const goToSources = () => {
    if (!fieldOk) return;
    track('onboarding_field_chosen', { packs: packIds.join(','), custom: isCustom });
    setStep('sources');
    loadSuggestions();
  };

  const toggleSource = (key) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const addOwnUrl = (e) => {
    e?.preventDefault?.();
    const raw = ownUrl.trim();
    if (!raw || !/\.[a-z]{2,}/i.test(raw)) { setOwnUrlError('Enter a website or feed URL, like example.com/feed'); return; }
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const key = urlKey(url);
    if (suggestions.some(f => f.key === key)) {
      setChecked(prev => new Set(prev).add(key));
    } else {
      setSuggestions(prev => [...prev, { key, name: hostOf(url), url, category: 'Other', origin: 'own' }]);
      setChecked(prev => new Set(prev).add(key));
    }
    setOwnUrl('');
    setOwnUrlError('');
  };

  const selectedFeeds = suggestions.filter(f => checked.has(f.key));

  const buildBriefing = async () => {
    if (!selectedFeeds.length || busy) return;
    setBusy(true);
    setStep('build');
    setResult(null);
    track('onboarding_build_started', { sources: selectedFeeds.length, email: delivery.email, frequency: delivery.frequency });

    const base = {
      ...fieldPayload(),
      interest_profile: interestProfile.trim() || undefined,
      delivery,
    };
    const feeds = selectedFeeds.map(f => ({
      url: f.url, name: f.name, category: f.category,
      ...(f.directory_feed_id ? { directory_feed_id: f.directory_feed_id } : {}),
    }));

    // Phase 1: add sources in small chunks so progress is real.
    setProgress({ phase: 'sources', done: 0, total: feeds.length, added: 0, failed: 0, error: '' });
    const chunks = [];
    for (let i = 0; i < feeds.length; i += SOURCE_CHUNK) chunks.push(feeds.slice(i, i + SOURCE_CHUNK));
    const feedIds = new Set();
    let limitReached = false;
    let cursor = 0;
    const worker = async () => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        let added = 0, failed = 0;
        try {
          const res = await base44.functions.invoke('startOnboarding', { ...base, phase: 'sources', feeds: chunk });
          const s = res?.data?.steps?.sources || {};
          (s.feed_ids || []).forEach(id => feedIds.add(id));
          added = (s.added || 0) + (s.duplicates || 0);
          failed = s.failed || 0;
          if (s.limit_reached) limitReached = true;
        } catch {
          failed = chunk.length;
        }
        setProgress(p => ({ ...p, done: p.done + chunk.length, added: p.added + added, failed: p.failed + failed }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, chunks.length) }, worker));

    if (!feedIds.size) {
      setProgress(p => ({ ...p, phase: 'error', error: limitReached
        ? 'Your plan limit for sources is reached. Remove some sources or upgrade, then try again.'
        : 'None of the selected sources could be added. Go back and try different ones, or add a URL you know has a feed.' }));
      setBusy(false);
      return;
    }

    // Phase 2: create the digest, generate and email the first briefing.
    setProgress(p => ({ ...p, phase: 'writing' }));
    let data = null;
    try {
      const res = await base44.functions.invoke('startOnboarding', { ...base, phase: 'briefing', feed_ids: [...feedIds] });
      data = res?.data || null;
    } catch (err) {
      data = { success: false, error: errMessage(err, 'Could not build your briefing') };
    }

    if (!data?.success) {
      setProgress(p => ({ ...p, phase: 'error', error: data?.error || 'Could not build your briefing.' }));
      setBusy(false);
      return;
    }

    // Newest delivery for this user (the one just generated, when the run produced one).
    let latest = null;
    try {
      if (data.delivery_id) {
        const rows = await base44.entities.DigestDelivery.filter({ id: data.delivery_id }, '-created_date', 1);
        latest = rows?.[0] || null;
      }
      if (!latest && user?.email) {
        const rows = await base44.entities.DigestDelivery.filter({ owner_email: user.email, delivery_type: 'web', status: 'sent' }, '-created_date', 1);
        latest = rows?.[0] || null;
      }
    } catch { latest = null; }

    const briefing = data.steps?.briefing || {};
    setResult({
      delivery: latest,
      emailed: !!briefing.emailed,
      digestName: data.steps?.digest?.name,
      reason: briefing.reason,
      sourcesAdded: feedIds.size,
    });
    setProgress(p => ({ ...p, phase: 'done' }));
    track('onboarding_completed', { briefing_sent: !!briefing.ok, emailed: !!briefing.emailed });
    setBusy(false);
  };

  const stepState = (phase) => {
    const order = ['sources', 'writing', 'done'];
    const cur = progress.phase === 'error' ? null : order.indexOf(progress.phase);
    const mine = order.indexOf(phase);
    if (progress.phase === 'error') {
      if (phase === 'sources') return progress.done >= progress.total && progress.added > 0 ? 'done' : 'error';
      return progress.added > 0 && phase === 'writing' ? 'error' : 'pending';
    }
    if (cur > mine) return 'done';
    if (cur === mine) return 'active';
    return 'pending';
  };

  const tzList = useMemo(() => timezoneOptions(delivery.timezone), [delivery.timezone]);
  const email = user?.email || '';

  const Heading = ({ children, sub }) => (
    <div className="mb-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight outline-none">{children}</h1>
      {sub && <p className="text-sm text-stone-500 mt-2 leading-relaxed">{sub}</p>}
    </div>
  );

  const SkipLink = () => (
    <button
      type="button"
      onClick={() => handleSkip('/Feeds')}
      disabled={busy && step === 'build'}
      className={cn('text-sm text-stone-500 hover:text-stone-300 underline-offset-4 hover:underline disabled:opacity-40 rounded', FOCUS)}
    >
      Skip setup
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0a0805] text-stone-200">
      <header className="border-b border-stone-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[hsl(var(--primary))] flex items-center justify-center" aria-hidden="true">
              <Rss className="w-3 h-3 text-stone-900" />
            </div>
            <span className="hidden min-[400px]:inline font-bold text-stone-100 tracking-tight">MergeRSS</span>
          </div>
          {step !== 'build' && <StepDots current={step} />}
          {progress.phase !== 'done' ? <SkipLink /> : <span className="w-16" aria-hidden="true" />}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* ── Step 1: field ─────────────────────────────── */}
        {step === 'field' && (
          <section>
            <Heading sub="Pick up to three. We use this to choose starter sources and to rank stories by what matters to you.">
              What do you follow?
            </Heading>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" role="group" aria-label="Fields">
              {STARTER_PACKS.map(p => {
                const on = packs.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePack(p.id)}
                    className={cn(
                      'min-h-[48px] px-3 py-2.5 text-left text-sm font-medium border rounded-md transition-colors flex items-center gap-2',
                      on ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-stone-100' : 'border-stone-800 bg-stone-900/60 text-stone-400 hover:border-stone-600 hover:text-stone-200',
                      FOCUS
                    )}
                  >
                    <span className={cn('w-4 h-4 flex-shrink-0 rounded-sm border flex items-center justify-center', on ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]' : 'border-stone-600')} aria-hidden="true">
                      {on && <Check className="w-3 h-3 text-stone-900" />}
                    </span>
                    <span className="leading-tight">{p.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={isCustom}
                onClick={() => togglePack(CUSTOM_PACK_ID)}
                className={cn(
                  'min-h-[48px] px-3 py-2.5 text-left text-sm font-medium border border-dashed rounded-md transition-colors flex items-center gap-2',
                  isCustom ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-stone-100' : 'border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200',
                  FOCUS
                )}
              >
                <Plus className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span className="leading-tight">Something else</span>
              </button>
            </div>
            {packs.length >= 3 && <p className="text-xs text-stone-500 mb-3" role="status">Three is the max for a first briefing. You can add more later.</p>}

            {isCustom && (
              <div className="mb-5">
                <label htmlFor="custom-field" className="block text-sm font-medium text-stone-300 mb-1.5">Your field</label>
                <input
                  id="custom-field"
                  type="text"
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  placeholder="e.g. Multifamily development in Canada"
                  maxLength={120}
                  className={cn('w-full h-11 px-3 bg-stone-900 border border-stone-700 rounded-md text-sm text-stone-100 placeholder:text-stone-600', FOCUS)}
                />
              </div>
            )}

            <div className="mb-8">
              <label htmlFor="interest-profile" className="block text-sm font-medium text-stone-300 mb-1.5">
                Describe your work or what matters to you <span className="text-stone-600 font-normal">(optional)</span>
              </label>
              <textarea
                id="interest-profile"
                value={interestProfile}
                onChange={e => setInterestProfile(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="e.g. I run acquisitions for a rental developer in Ottawa. Rate moves, zoning changes and big land deals matter most."
                aria-describedby="interest-profile-help"
                className={cn('w-full px-3 py-2.5 bg-stone-900 border border-stone-700 rounded-md text-sm text-stone-100 placeholder:text-stone-600 resize-y', FOCUS)}
              />
              <p id="interest-profile-help" className="text-xs text-stone-600 mt-1.5">The AI ranks every story against this. You can edit it later in Settings.</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={goToSources}
                disabled={!fieldOk}
                className={cn('inline-flex items-center gap-2 h-11 px-6 bg-[hsl(var(--primary))] text-stone-900 font-bold text-sm rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed', FOCUS)}
              >
                Continue <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {/* ── Step 2: sources ───────────────────────────── */}
        {step === 'sources' && (
          <section>
            <Heading sub="These are pre-selected. Uncheck anything you don't want, or add your own. You can change sources any time.">
              Your starter sources
            </Heading>

            {suggestLoading && (
              <div className="flex items-center gap-3 p-4 mb-4 border border-stone-800 bg-stone-900/60 rounded-md" role="status">
                <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--primary))]" aria-hidden="true" />
                <span className="text-sm text-stone-400">
                  {isCustom && customText.trim() ? `Finding sources for "${customText.trim()}"…` : 'Loading sources…'}
                </span>
              </div>
            )}
            {suggestNote && <p className="text-sm text-amber-300/90 mb-4" role="status">{suggestNote}</p>}

            {suggestions.length > 0 && (
              <fieldset className="mb-4">
                <legend className="sr-only">Suggested sources</legend>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-stone-500">{checked.size} of {suggestions.length} selected</p>
                  <button
                    type="button"
                    onClick={() => setChecked(checked.size === suggestions.length ? new Set() : new Set(suggestions.map(f => f.key)))}
                    className={cn('text-xs text-stone-400 hover:text-stone-200 rounded', FOCUS)}
                  >
                    {checked.size === suggestions.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <ul className="divide-y divide-stone-800 border border-stone-800 rounded-md overflow-hidden">
                  {suggestions.map(f => {
                    const on = checked.has(f.key);
                    const id = `src-${f.key.replace(/[^a-z0-9]/gi, '-')}`;
                    return (
                      <li key={f.key}>
                        <label htmlFor={id} className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-stone-900/70 focus-within:bg-stone-900/70">
                          <input
                            id={id}
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleSource(f.key)}
                            className="mt-0.5 w-4 h-4 flex-shrink-0 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-sm font-medium truncate', on ? 'text-stone-100' : 'text-stone-500')}>{f.name || hostOf(f.url)}</span>
                            <span className="block text-xs text-stone-600 truncate">
                              {hostOf(f.url)}
                              {f.origin === 'ai' && ' · suggested for your topic'}
                              {f.origin === 'own' && ' · added by you'}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
              <button
                type="button"
                onClick={() => setShowOwnUrl(v => !v)}
                aria-expanded={showOwnUrl}
                className={cn('inline-flex items-center gap-1.5 text-sm text-[hsl(var(--primary))] hover:opacity-80 rounded', FOCUS)}
              >
                <Plus className="w-4 h-4" aria-hidden="true" /> Add your own URL
              </button>
              <button
                type="button"
                onClick={() => handleSkip('/Feeds?import=opml')}
                className={cn('inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-200 rounded', FOCUS)}
              >
                <Upload className="w-4 h-4" aria-hidden="true" /> Import OPML instead
              </button>
            </div>

            {showOwnUrl && (
              <form onSubmit={addOwnUrl} className="mb-6">
                <label htmlFor="own-url" className="sr-only">Website or feed URL</label>
                <div className="flex gap-2">
                  <input
                    id="own-url"
                    type="text"
                    inputMode="url"
                    value={ownUrl}
                    onChange={e => { setOwnUrl(e.target.value); setOwnUrlError(''); }}
                    placeholder="example.com or example.com/feed"
                    aria-invalid={!!ownUrlError}
                    aria-describedby={ownUrlError ? 'own-url-error' : undefined}
                    className={cn('flex-1 min-w-0 h-11 px-3 bg-stone-900 border border-stone-700 rounded-md text-sm text-stone-100 placeholder:text-stone-600', FOCUS)}
                  />
                  <button type="submit" className={cn('h-11 px-4 bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm font-medium rounded-md', FOCUS)}>Add</button>
                </div>
                {ownUrlError && <p id="own-url-error" className="text-xs text-red-400 mt-1.5">{ownUrlError}</p>}
                <p className="text-xs text-stone-600 mt-1.5">Any site works. We find its feed, or build one if it has none.</p>
              </form>
            )}

            <div className="flex items-center justify-between gap-3 mt-8">
              <button type="button" onClick={() => setStep('field')} className={cn('inline-flex items-center gap-1.5 h-11 px-3 text-sm text-stone-400 hover:text-stone-200 rounded-md', FOCUS)}>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep('delivery')}
                disabled={!checked.size || suggestLoading}
                className={cn('inline-flex items-center gap-2 h-11 px-6 bg-[hsl(var(--primary))] text-stone-900 font-bold text-sm rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed', FOCUS)}
              >
                Continue with {checked.size} <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {/* ── Step 3: delivery ──────────────────────────── */}
        {step === 'delivery' && (
          <section>
            <Heading sub="Your first briefing goes out right now. After that, it arrives on this schedule.">
              Where should it go?
            </Heading>

            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 p-4 border border-stone-800 bg-stone-900/60 rounded-md">
                <div className="flex items-start gap-3 min-w-0">
                  <Mail className="w-5 h-5 text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p id="email-label" className="text-sm font-medium text-stone-100">Email</p>
                    <p className="text-xs text-stone-500 truncate">{email || 'your account email'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={delivery.email}
                  aria-labelledby="email-label"
                  onClick={() => setDelivery(d => ({ ...d, email: !d.email }))}
                  className={cn('relative w-11 h-6 rounded-full flex-shrink-0 transition-colors', delivery.email ? 'bg-[hsl(var(--primary))]' : 'bg-stone-700', FOCUS)}
                >
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-stone-100 transition-transform', delivery.email && 'translate-x-5')} aria-hidden="true" />
                </button>
              </div>
              {!delivery.email && <p className="text-xs text-stone-500 -mt-3">Briefings will still appear in your web Inbox.</p>}

              <div role="radiogroup" aria-label="How often" className="grid grid-cols-2 gap-2">
                {[['daily', 'Every day'], ['weekly', 'Once a week']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={delivery.frequency === val}
                    onClick={() => setDelivery(d => ({ ...d, frequency: val }))}
                    className={cn(
                      'h-11 text-sm font-medium border rounded-md',
                      delivery.frequency === val ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-stone-100' : 'border-stone-800 text-stone-400 hover:border-stone-600',
                      FOCUS
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                <div>
                  <label htmlFor="delivery-time" className="flex items-center gap-1.5 text-sm font-medium text-stone-300 mb-1.5">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Time
                  </label>
                  <input
                    id="delivery-time"
                    type="time"
                    value={delivery.time}
                    onChange={e => setDelivery(d => ({ ...d, time: e.target.value || '07:00' }))}
                    className={cn('w-full h-11 px-3 bg-stone-900 border border-stone-700 rounded-md text-sm text-stone-100 [color-scheme:dark]', FOCUS)}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="delivery-tz" className="flex items-center gap-1.5 text-sm font-medium text-stone-300 mb-1.5">
                    <Globe2 className="w-3.5 h-3.5" aria-hidden="true" /> Timezone
                  </label>
                  <select
                    id="delivery-tz"
                    value={delivery.timezone}
                    onChange={e => setDelivery(d => ({ ...d, timezone: e.target.value }))}
                    className={cn('w-full h-11 px-3 bg-stone-900 border border-stone-700 rounded-md text-sm text-stone-100', FOCUS)}
                  >
                    {tzList.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>

              <p className="text-xs text-stone-600">Slack, Discord and Teams delivery are available on Premium. Set them up later under Briefings.</p>
            </div>

            <div className="flex items-center justify-between gap-3 mt-8">
              <button type="button" onClick={() => setStep('sources')} className={cn('inline-flex items-center gap-1.5 h-11 px-3 text-sm text-stone-400 hover:text-stone-200 rounded-md', FOCUS)}>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
              </button>
              <button
                type="button"
                onClick={buildBriefing}
                disabled={busy || !selectedFeeds.length}
                className={cn('inline-flex items-center gap-2 h-11 px-5 sm:px-6 bg-[hsl(var(--primary))] text-stone-900 font-bold text-sm rounded-md hover:opacity-90 disabled:opacity-40', FOCUS)}
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" /> Build my first briefing
              </button>
            </div>
          </section>
        )}

        {/* ── Step 4: build + result ────────────────────── */}
        {step === 'build' && progress.phase !== 'done' && (
          <section>
            <Heading sub="This usually takes under a minute. Keep this tab open.">
              {progress.phase === 'error' ? 'Something needs a look' : 'Building your first briefing'}
            </Heading>

            <ul className="border border-stone-800 bg-stone-900/60 rounded-md px-4 py-2 mb-6" aria-live="polite">
              <ProgressRow
                state={stepState('sources')}
                label={`Adding sources and fetching stories (${progress.done}/${progress.total})`}
                detail={progress.done > 0 ? `${progress.added} ready${progress.failed ? `, ${progress.failed} could not be added` : ''}` : null}
              />
              <ProgressRow
                state={stepState('writing')}
                label="Ranking stories and writing your briefing"
                detail={progress.phase === 'writing' ? 'Reading everything your sources published recently' : null}
              />
              <ProgressRow
                state={stepState('done')}
                label={delivery.email ? `Emailing it to ${email || 'you'}` : 'Putting it in your Inbox'}
              />
            </ul>

            {progress.phase === 'error' && (
              <div className="p-4 border border-red-900/50 bg-red-950/20 rounded-md mb-6" role="alert">
                <p className="text-sm text-red-300">{progress.error}</p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <button type="button" onClick={() => { setProgress({ phase: 'idle', done: 0, total: 0, added: 0, failed: 0, error: '' }); setStep('sources'); }} className={cn('h-10 px-4 bg-stone-800 hover:bg-stone-700 text-sm text-stone-100 rounded-md', FOCUS)}>
                    Back to sources
                  </button>
                  <button type="button" onClick={buildBriefing} disabled={busy} className={cn('h-10 px-4 bg-[hsl(var(--primary))] text-stone-900 text-sm font-bold rounded-md disabled:opacity-40', FOCUS)}>
                    Try again
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {step === 'build' && progress.phase === 'done' && result && (
          <section>
            {result.delivery ? (
              <Heading sub={result.emailed ? `Sent to ${email}. It will keep arriving ${delivery.frequency === 'weekly' ? 'weekly' : 'every day'} at ${delivery.time}.` : `It will keep arriving ${delivery.frequency === 'weekly' ? 'weekly' : 'every day'} at ${delivery.time} in your Inbox.`}>
                {result.emailed ? 'Your first briefing is in your inbox' : 'Your first briefing is ready'}
              </Heading>
            ) : (
              <Heading sub={`Your ${result.sourcesAdded} sources are still loading, so there was not enough to brief on yet. Your first briefing will arrive at ${delivery.time}${result.emailed === false && delivery.email ? ' by email' : ''}.`}>
                Your briefing is set up
              </Heading>
            )}

            {result.delivery && (
              <article className="border border-stone-800 bg-stone-900/60 rounded-md p-4 sm:p-6 mb-6" aria-label={result.digestName || 'Your briefing'}>
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))] mb-2">{result.digestName || 'Your briefing'}</p>
                <BriefingMarkdown content={result.delivery.content} />
              </article>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => window.location.assign('/Dashboard')}
                className={cn('inline-flex items-center justify-center gap-2 h-11 px-6 bg-[hsl(var(--primary))] text-stone-900 font-bold text-sm rounded-md hover:opacity-90', FOCUS)}
              >
                Open MergeRSS <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/Feeds')}
                className={cn('inline-flex items-center justify-center h-11 px-5 bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm rounded-md', FOCUS)}
              >
                Fine-tune sources
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
