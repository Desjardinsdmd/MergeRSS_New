import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Rss, FileText, AlertCircle, AlertTriangle, ArrowRight, Sparkles, ExternalLink, Loader2, PauseCircle,
} from 'lucide-react';
import StreakCounter from '@/components/dashboard/StreakCounter';
import BookmarkButton from '@/components/dashboard/BookmarkButton';
import { nextSend } from '@/components/dashboard/briefingSchedule';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { cn } from '@/lib/utils';
import { MicroLabel, SignalPill } from '@/components/brand/Brand';

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function stripHtml(s) {
  return decodeHtml(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function ago(date) {
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); } catch { return ''; }
}

async function queryArticles(payload) {
  const res = await base44.functions.invoke('queryArticles', payload);
  return res?.data?.items || [];
}

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: feeds = [], isFetched: feedsFetched } = useQuery({
    queryKey: ['feeds', user?.email],
    queryFn: () => base44.entities.Feed.filter({ created_by: user?.email }, '-created_date', 500),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }, '-created_date', 200),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: lastDelivery = null } = useQuery({
    queryKey: ['today-last-delivery', user?.email],
    queryFn: async () => {
      const rows = await base44.entities.DigestDelivery.filter(
        { owner_email: user.email, delivery_type: 'web', status: 'sent' }, '-created_date', 1,
      );
      return rows?.[0] || null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // At most two queryArticles calls per load: ranked last 48h, then latest as a fallback
  // when the last two days are thin.
  const { data: ranked = { items: [], mode: 'ranked' }, isLoading: articlesLoading } = useQuery({
    queryKey: ['today-ranked', user?.email],
    queryFn: async () => {
      const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const top = await queryArticles({ since, sort: '-importance_score', limit: 20 });
      if (top.length >= 5) return { items: top, mode: 'ranked' };
      const latest = await queryArticles({ sort: '-published_date', limit: 15 });
      const seen = new Set(top.map(i => i.id));
      return { items: [...top, ...latest.filter(i => !seen.has(i.id))].slice(0, 15), mode: top.length ? 'ranked' : 'latest' };
    },
    enabled: !!user && feeds.length > 0,
    staleTime: 5 * 60_000,
  });

  const feedName = useMemo(() => Object.fromEntries(feeds.map(f => [f.id, f.name])), [feeds]);

  const next = useMemo(() => {
    const options = digests
      .map(d => ({ d, n: nextSend(d, user?.timezone) }))
      .filter(x => x.n)
      .sort((a, b) => a.n.sortKey - b.n.sortKey);
    return options[0] || null;
  }, [digests, user?.timezone]);

  const lastDigestName = lastDelivery ? digests.find(d => d.id === lastDelivery.digest_id)?.name : null;

  const problems = useMemo(() => {
    const out = [];
    for (const d of digests) {
      if ((d.consecutive_skips || 0) > 0 && d.status !== 'paused') {
        out.push({
          key: `skip-${d.id}`,
          tone: 'warn',
          icon: AlertCircle,
          text: `"${d.name}" skipped its last ${d.consecutive_skips === 1 ? 'send' : `${d.consecutive_skips} sends`}${d.last_skip_reason ? `: ${d.last_skip_reason}` : '.'}`,
          fix: 'Fix briefing',
          href: createPageUrl('Digests'),
        });
      }
    }
    const pausedDigests = digests.filter(d => d.status === 'paused');
    if (pausedDigests.length) {
      out.push({
        key: 'paused-digests',
        tone: 'warn',
        icon: PauseCircle,
        text: pausedDigests.length === 1 ? `"${pausedDigests[0].name}" is paused.` : `${pausedDigests.length} briefings are paused.`,
        fix: 'Resume',
        href: createPageUrl('Digests'),
      });
    }
    const errored = feeds.filter(f => f.status === 'error');
    const paused = feeds.filter(f => f.status === 'paused');
    if (errored.length) {
      out.push({
        key: 'feed-errors',
        tone: 'error',
        icon: AlertCircle,
        text: `${errored.length} source${errored.length === 1 ? ' is' : 's are'} failing to update${errored.length === 1 ? ` (${errored[0].name})` : ''}.`,
        fix: 'Fix sources',
        href: createPageUrl('Feeds'),
      });
    }
    if (paused.length) {
      out.push({
        key: 'feed-paused',
        tone: 'warn',
        icon: AlertTriangle,
        text: `${paused.length} source${paused.length === 1 ? ' is' : 's are'} paused${paused.some(f => f.paused_by_system) ? ' after repeated errors' : ''}.`,
        fix: 'Review',
        href: createPageUrl('Feeds'),
      });
    }
    if (feeds.length > 0 && digests.length === 0) {
      out.push({
        key: 'no-digest',
        tone: 'warn',
        icon: FileText,
        text: 'You have sources but no briefing, so nothing is being delivered.',
        fix: 'Set up a briefing',
        href: createPageUrl('Welcome'),
      });
    }
    return out;
  }, [digests, feeds]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  const noFeeds = feedsFetched && feeds.length === 0;
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-stone-100">
            {greeting}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-[15px] text-stone-400">{dateLabel}</p>
        </div>
        <StreakCounter user={user} />
      </div>

      {/* Status strip */}
      {!noFeeds && (
        <section aria-label="Briefing status" className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="panel-accent p-5">
            <MicroLabel className="mb-2 text-brand-light">Next briefing</MicroLabel>
            {next ? (
              <>
                <p className="font-display text-xl font-semibold text-stone-100">{next.n.label}</p>
                <p className="mt-1 truncate text-sm text-stone-400">
                  {next.d.name}{next.d.delivery_email ? ' · email' : ''}{next.d.delivery_slack ? ' · Slack' : ''}
                </p>
              </>
            ) : (
              <p className="text-sm text-stone-400">
                Nothing scheduled.{' '}
                <Link to={createPageUrl('Digests')} className={cn('text-brand-light hover:text-stone-100 rounded-sm', FOCUS)}>Schedule one</Link>
              </p>
            )}
          </div>
          <div className="panel p-5">
            <MicroLabel className="mb-2">Last briefing</MicroLabel>
            {lastDelivery ? (
              <Link
                to={`${createPageUrl('Inbox')}?delivery_id=${lastDelivery.id}`}
                className={cn('group block rounded-sm', FOCUS)}
              >
                <span className="block truncate font-display text-xl font-semibold text-stone-100 group-hover:text-brand-light">
                  {lastDigestName || 'Your briefing'}
                </span>
                <span className="mt-1 block text-sm text-stone-400">
                  {ago(lastDelivery.sent_at || lastDelivery.created_date)} · {lastDelivery.item_count || 0} stories{!lastDelivery.is_read ? ' · unread' : ''}
                </span>
              </Link>
            ) : (
              <p className="text-sm text-stone-400">None yet.</p>
            )}
          </div>
        </section>
      )}

      {/* Problems with one-click fixes */}
      {problems.length > 0 && (
        <section aria-label="Needs attention" className="mb-8 space-y-2">
          {problems.map(p => (
            <div
              key={p.key}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-nowrap',
                p.tone === 'error' ? 'border-red-400/25 bg-red-400/10 text-red-300'
                  : p.tone === 'warn' ? 'border-white/[0.07] bg-white/[0.025] text-stone-300'
                  : 'border-white/[0.07] bg-white/[0.025] text-stone-300'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border',
                  p.tone === 'error' ? 'border-red-400/25 bg-red-400/10 text-red-300'
                    : p.tone === 'warn' ? 'border-amber-400/25 bg-amber-400/10 text-amber-400'
                    : 'border-white/10 bg-white/[0.03] text-stone-400'
                )}
                aria-hidden="true"
              >
                <p.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">{p.text}</span>
              <Link
                to={p.href}
                className={cn(
                  'inline-flex items-center gap-1 whitespace-nowrap rounded-sm font-medium',
                  p.tone === 'error' ? 'text-red-300 hover:text-red-200' : 'text-brand-light hover:text-stone-100',
                  FOCUS
                )}
              >
                {p.fix} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* Empty state */}
      {noFeeds && (
        <section className="panel p-6 text-center sm:p-10">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)]" aria-hidden="true">
            <Rss className="h-6 w-6 text-brand-light" />
          </div>
          <h2 className="mb-2 font-display text-lg font-semibold text-stone-100">Get your first briefing</h2>
          <p className="mx-auto mb-6 max-w-sm text-sm text-stone-400">
            Pick your field, keep the starter sources, and we'll email you a ranked briefing in about a minute.
          </p>
          <Link to={createPageUrl('Welcome')} className={cn('btn-brand h-10 px-5', FOCUS)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Build my briefing
          </Link>
        </section>
      )}

      {/* Most important today */}
      {!noFeeds && (
        <section aria-labelledby="top-heading">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 id="top-heading" className="font-display text-lg font-semibold text-stone-100">
              {ranked.mode === 'latest' ? 'Latest from your sources' : 'Most important today'}
            </h2>
            <Link to={createPageUrl('ArticleSearch')} className={cn('whitespace-nowrap rounded-sm text-sm text-stone-400 hover:text-stone-100', FOCUS)}>
              Search all stories
            </Link>
          </div>
          {ranked.mode === 'ranked' ? (
            <p className="mb-4 text-sm text-stone-400">
              Ranked for {user?.interest_field || 'you'}{user?.interest_profile ? '' : '. '}
              {!user?.interest_profile && (
                <Link to={createPageUrl('Settings')} className={cn('rounded-sm text-brand-light hover:text-stone-100', FOCUS)}>
                  Tell us what matters to sharpen this
                </Link>
              )}
            </p>
          ) : (
            <div className="mb-4" />
          )}

          {articlesLoading || !feedsFetched ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading stories
            </div>
          ) : ranked.items.length === 0 ? (
            <div className="panel p-6 text-center text-sm text-stone-400">
              No stories from the last two days yet. New sources can take a few minutes to fill in.
            </div>
          ) : (
            <ol className="space-y-2">
              {ranked.items.map((item, idx) => {
                const summary = stripHtml(item.ai_summary || item.description);
                const score = typeof item.importance_score === 'number' ? Math.round(item.importance_score) : null;
                const showScore = score != null && ranked.mode === 'ranked';
                const level = score >= 80 ? 'high' : score >= 50 ? 'med' : 'low';
                return (
                  <li key={item.id} className="panel panel-hover flex items-start gap-4 px-4 py-4 sm:px-5">
                    <span
                      className={cn(
                        'w-8 flex-shrink-0 text-right font-display text-[28px] font-semibold leading-none tabular-nums',
                        idx === 0 ? 'text-[hsl(var(--primary))]' : 'text-stone-500'
                      )}
                      aria-hidden="true"
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={safeUrl(item.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn('rounded-sm text-[15px] font-semibold leading-snug text-stone-100 hover:text-brand-light', FOCUS)}
                      >
                        {decodeHtml(item.title)}
                        <ExternalLink className="ml-1 inline h-3 w-3 align-baseline text-stone-600" aria-hidden="true" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      {summary && <p className="mt-1 line-clamp-1 text-sm leading-relaxed text-stone-400">{summary}</p>}
                      <p className="meta mt-2">
                        {feedName[item.feed_id] || 'Source'}
                        {item.published_date ? ` · ${ago(item.published_date)}` : ''}
                        {showScore ? ` · importance ${score}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-2">
                      <BookmarkButton item={item} />
                      {showScore && <SignalPill level={level} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
