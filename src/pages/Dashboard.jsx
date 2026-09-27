import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Rss, Clock, FileText, AlertCircle, ArrowRight, Sparkles, ExternalLink, Loader2, PauseCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import StreakCounter from '@/components/dashboard/StreakCounter';
import BookmarkButton from '@/components/dashboard/BookmarkButton';
import { nextSend } from '@/components/dashboard/briefingSchedule';
import { decodeHtml, safeUrl } from '@/components/utils/htmlUtils';
import { cn } from '@/lib/utils';

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0805]';

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
        tone: 'muted',
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
        tone: 'muted',
        icon: PauseCircle,
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-100 mb-1">
            {greeting}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-stone-500 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <StreakCounter user={user} />
      </div>

      {/* Status strip */}
      {!noFeeds && (
        <section aria-label="Briefing status" className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="border border-stone-800 bg-stone-900/60 rounded-md p-4 flex items-start gap-3">
            <Clock className="w-4 h-4 mt-0.5 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-stone-500 mb-0.5">Next briefing</p>
              {next ? (
                <>
                  <p className="text-sm font-semibold text-stone-100">{next.n.label}</p>
                  <p className="text-xs text-stone-500 truncate">{next.d.name}{next.d.delivery_email ? ' · email' : ''}{next.d.delivery_slack ? ' · Slack' : ''}</p>
                </>
              ) : (
                <p className="text-sm text-stone-400">
                  Nothing scheduled.{' '}
                  <Link to={createPageUrl('Digests')} className={cn('text-[hsl(var(--primary))] hover:opacity-80 rounded-sm', FOCUS)}>Schedule one</Link>
                </p>
              )}
            </div>
          </div>
          <div className="border border-stone-800 bg-stone-900/60 rounded-md p-4 flex items-start gap-3">
            <FileText className="w-4 h-4 mt-0.5 text-[hsl(var(--primary))] flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-stone-500 mb-0.5">Last briefing</p>
              {lastDelivery ? (
                <Link
                  to={`${createPageUrl('Inbox')}?delivery_id=${lastDelivery.id}`}
                  className={cn('group block rounded-sm', FOCUS)}
                >
                  <span className="text-sm font-semibold text-stone-100 group-hover:text-[hsl(var(--primary))] truncate block">
                    {lastDigestName || 'Your briefing'}
                  </span>
                  <span className="text-xs text-stone-500">
                    {ago(lastDelivery.sent_at || lastDelivery.created_date)} · {lastDelivery.item_count || 0} stories{!lastDelivery.is_read ? ' · unread' : ''}
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-stone-400">None yet.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Problems with one-click fixes */}
      {problems.length > 0 && (
        <section aria-label="Needs attention" className="mb-6 space-y-2">
          {problems.map(p => (
            <div
              key={p.key}
              className={cn(
                'flex flex-wrap sm:flex-nowrap items-center gap-3 px-3 py-2.5 border rounded-md text-sm',
                p.tone === 'error' ? 'bg-red-950/20 border-red-900/40 text-red-300'
                  : p.tone === 'warn' ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                  : 'bg-stone-900/60 border-stone-800 text-stone-300'
              )}
            >
              <p.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">{p.text}</span>
              <Link to={p.href} className={cn('inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:opacity-80 rounded-sm', FOCUS)}>
                {p.fix} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* Empty state */}
      {noFeeds && (
        <section className="border border-stone-700 bg-stone-900/60 rounded-md p-6 sm:p-8 text-center">
          <div className="w-12 h-12 bg-stone-800 flex items-center justify-center mx-auto mb-4 rounded" aria-hidden="true">
            <Rss className="w-6 h-6 text-[hsl(var(--primary))]" />
          </div>
          <h2 className="text-lg font-semibold text-stone-100 mb-2">Get your first briefing</h2>
          <p className="text-stone-500 mb-6 max-w-sm mx-auto text-sm">
            Pick your field, keep the starter sources, and we'll email you a ranked briefing in about a minute.
          </p>
          <Link to={createPageUrl('Welcome')} className={cn('inline-block rounded-md', FOCUS)} tabIndex={-1}>
            <Button className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-bold">
              <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
              Build my briefing
            </Button>
          </Link>
        </section>
      )}

      {/* Most important today */}
      {!noFeeds && (
        <section aria-labelledby="top-heading">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="top-heading" className="text-lg font-bold text-stone-100">
              {ranked.mode === 'latest' ? 'Latest from your sources' : 'Most important today'}
            </h2>
            <Link to={createPageUrl('ArticleSearch')} className={cn('text-xs text-stone-500 hover:text-stone-300 rounded-sm', FOCUS)}>
              Search all stories
            </Link>
          </div>
          {ranked.mode === 'ranked' && (
            <p className="text-xs text-stone-600 mb-3 -mt-1">
              Ranked for {user?.interest_field || 'you'}{user?.interest_profile ? '' : '. '}
              {!user?.interest_profile && (
                <Link to={createPageUrl('Settings')} className={cn('text-[hsl(var(--primary))] hover:opacity-80 rounded-sm', FOCUS)}>
                  Tell us what matters to sharpen this
                </Link>
              )}
            </p>
          )}

          {articlesLoading || !feedsFetched ? (
            <div className="flex items-center gap-2 py-10 justify-center text-stone-500 text-sm" role="status">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading stories
            </div>
          ) : ranked.items.length === 0 ? (
            <div className="border border-stone-800 rounded-md p-6 text-center text-sm text-stone-500">
              No stories from the last two days yet. New sources can take a few minutes to fill in.
            </div>
          ) : (
            <ol className="border border-stone-800 rounded-md divide-y divide-stone-800 overflow-hidden">
              {ranked.items.map((item, idx) => {
                const summary = stripHtml(item.ai_summary || item.description);
                const score = typeof item.importance_score === 'number' ? Math.round(item.importance_score) : null;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-3 sm:px-4 py-3.5 bg-stone-900/40 hover:bg-stone-900/80">
                    <span className="w-6 flex-shrink-0 text-right text-sm font-bold text-stone-600 tabular-nums mt-0.5" aria-hidden="true">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={safeUrl(item.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn('text-sm sm:text-[15px] font-semibold text-stone-100 hover:text-[hsl(var(--primary))] leading-snug rounded-sm', FOCUS)}
                      >
                        {decodeHtml(item.title)}
                        <ExternalLink className="inline w-3 h-3 ml-1 text-stone-600 align-baseline" aria-hidden="true" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      {summary && <p className="text-xs sm:text-sm text-stone-400 mt-1 line-clamp-2 leading-relaxed">{summary}</p>}
                      <p className="text-xs text-stone-600 mt-1.5">
                        {feedName[item.feed_id] || 'Source'}
                        {item.published_date ? ` · ${ago(item.published_date)}` : ''}
                        {score != null && ranked.mode === 'ranked' ? ` · importance ${score}` : ''}
                      </p>
                    </div>
                    <BookmarkButton item={item} className="flex-shrink-0" />
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
