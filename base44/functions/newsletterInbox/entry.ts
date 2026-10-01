import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * newsletterInbox — user-facing API for the per-user newsletter inbox.
 *
 * Every user gets a private inbound address (<first-name-slug>.<6 random chars>@MAILGUN_DOMAIN).
 * Mail sent there is POSTed by one Mailgun catch-all route to mailgunWebhook, which turns each
 * newsletter into a FeedItem on a per-sender Feed owned by the user.
 *
 * Body: { action, ... }
 *   get              -> { configured, address, senders[], confirmations[], limit }   (never creates)
 *   get_or_create    -> same, provisioning the address (and the Mailgun route) if needed
 *   list             -> alias of get
 *   pause            { subscription_id }  stop turning this sender's emails into items
 *   unpause          { subscription_id }  resume (checks the free-plan source limit, backfills stored emails)
 *   remove           { subscription_id, delete_items? }  delete the sender's Feed; future emails are ignored
 *   restore          { subscription_id }  undo remove (same as unpause)
 *   dismiss_confirmation { email_id, done? }
 *   get_email        { email_id }  one stored email for the in-app reader
 *   set_alias        { alias }  pick a custom local part (<alias>@MAILGUN_DOMAIN); the old address
 *                    stops receiving. Max 3 changes per user per 24h. Returns the same state as get_or_create.
 *   ensure_route     (admin) create/update the Mailgun catch-all route now
 *
 * When MAILGUN_API_KEY / MAILGUN_DOMAIN are missing every action returns configured:false with
 * reason 'newsletter inbox not configured' (reads of existing data still work).
 */

const FREE_FEED_LIMIT = 50; // sync with lib/planLimits.js PLAN_LIMITS.free.feeds
const ROUTE_STATE_KEY = 'mailgun_inbound_route';
const ROUTE_DESCRIPTION = 'MergeRSS newsletter inbox (catch-all)';
const ROUTE_PRIORITY = 10;
const APP_ID_FALLBACK = '69a09b2e568729a30e5400b4';
const NOT_CONFIGURED = 'newsletter inbox not configured';

function extractItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function mailgunConfig() {
  const apiKey = Deno.env.get('MAILGUN_API_KEY') || '';
  const domain = (Deno.env.get('MAILGUN_DOMAIN') || '').trim().toLowerCase();
  const region = (Deno.env.get('MAILGUN_REGION') || '').trim().toLowerCase();
  const apiBase = (Deno.env.get('MAILGUN_API_BASE') || (region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net')).replace(/\/+$/, '');
  return { configured: !!(apiKey && domain), apiKey, domain, apiBase };
}

function webhookUrl() {
  const override = Deno.env.get('MAILGUN_WEBHOOK_URL');
  if (override) return override;
  const appId = Deno.env.get('BASE44_APP_ID') || APP_ID_FALLBACK;
  return `https://base44.app/api/apps/${appId}/functions/mailgunWebhook`;
}

function isPremium(user) {
  return user?.plan === 'premium' || user?.role === 'admin';
}

// ── Address generation ─────────────────────────────────────────────────────────
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function randomSuffix(n = 6) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
function nameSlug(user) {
  const first = String(user?.full_name || '').trim().split(/\s+/)[0] || String(user?.email || '').split('@')[0] || '';
  const slug = first.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return slug || 'inbox';
}
// ── Custom alias (set_alias) ─────────────────────────────────────────────────────
const ALIAS_MIN = 3;
const ALIAS_MAX = 30;
const ALIAS_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const RESERVED_ALIASES = new Set([
  'support', 'postmaster', 'abuse', 'admin', 'administrator', 'root', 'hostmaster', 'webmaster',
  'security', 'info', 'hello', 'contact', 'billing', 'noreply', 'no-reply', 'mailer-daemon', 'relay',
  'inbox-test', 'pipeline-test', 'team', 'help', 'sales', 'privacy', 'legal',
]);
const ALIAS_CHANGE_LIMIT = 3;
const ALIAS_WINDOW_MS = 24 * 3600 * 1000;

// Returns an error string, or null when the (already lowercased) alias is acceptable.
function validateAlias(alias) {
  if (typeof alias !== 'string' || !alias) return 'Enter an address.';
  if (alias !== alias.toLowerCase()) return 'Use lowercase letters only.';
  if (alias.length < ALIAS_MIN || alias.length > ALIAS_MAX) return `Use ${ALIAS_MIN} to ${ALIAS_MAX} characters.`;
  if (!ALIAS_RE.test(alias)) return 'Use letters and numbers, with single dots, hyphens or underscores between them.';
  if (RESERVED_ALIASES.has(alias)) return 'That address is reserved.';
  // isLegacyAddress() treats newsletter-* as a guessable v1 address and would replace it.
  if (alias.startsWith('newsletter-')) return 'That address is reserved.';
  return null;
}

async function aliasChangeState(svc, email) {
  const key = `alias_changes:${email}`;
  const rows = extractItems(await svc.SyncState.filter({ key }, '-created_date', 1).catch(() => []));
  const row = rows.find(r => r.key === key) || null;
  let stamps = [];
  try { stamps = JSON.parse(row?.history_id || '[]'); } catch { stamps = []; }
  const cutoff = Date.now() - ALIAS_WINDOW_MS;
  stamps = (Array.isArray(stamps) ? stamps : []).filter(t => typeof t === 'number' && t > cutoff);
  return { key, row, stamps };
}

function isLegacyAddress(addr, domain) {
  if (!addr) return true;
  const a = String(addr).toLowerCase();
  // initEmailFeed v1 derived the address from base64(email): guessable, so it is replaced.
  if (a.startsWith('newsletter-')) return true;
  return !a.endsWith('@' + domain);
}

// ── Mailgun route (one catch-all for the whole domain) ─────────────────────────
async function mailgunFetch(cfg, path, init = {}) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${btoa(`api:${cfg.apiKey}`)}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) throw new Error(`Mailgun ${res.status}: ${(json?.message || text || '').slice(0, 200)}`);
  return json || {};
}

async function ensureRoute(svc, cfg, force = false) {
  const stateRows = extractItems(await svc.SyncState.filter({ key: ROUTE_STATE_KEY }, '-created_date', 1).catch(() => []));
  const state = stateRows[0] || null;
  if (state?.history_id && !force) return { route_id: state.history_id, created: false };

  const url = webhookUrl();
  const expression = `match_recipient(".*@${cfg.domain.replace(/\./g, '\\.')}")`;
  const actions = [`forward("${url}")`, 'stop()'];

  const list = await mailgunFetch(cfg, '/v3/routes?limit=1000');
  const existing = (list.items || []).find(r => r.description === ROUTE_DESCRIPTION && String(r.expression || '').includes(cfg.domain.replace(/\./g, '\\.')));

  let routeId;
  const form = new FormData();
  // Catch-all sits at priority 10 so admin forwards (support@, postmaster@, abuse@) at priority 0 win.
  form.append('priority', String(ROUTE_PRIORITY));
  form.append('description', ROUTE_DESCRIPTION);
  form.append('expression', expression);
  for (const a of actions) form.append('action', a);

  if (existing) {
    routeId = existing.id;
    const sameActions = JSON.stringify(existing.actions || []) === JSON.stringify(actions);
    if (!sameActions || existing.expression !== expression || Number(existing.priority) !== ROUTE_PRIORITY) {
      await mailgunFetch(cfg, `/v3/routes/${routeId}`, { method: 'PUT', body: form });
    }
  } else {
    const created = await mailgunFetch(cfg, '/v3/routes', { method: 'POST', body: form });
    routeId = created.route?.id || created.id;
  }
  if (!routeId) throw new Error('Mailgun did not return a route id');

  if (state) await svc.SyncState.update(state.id, { history_id: routeId, enabled: true });
  else await svc.SyncState.create({ key: ROUTE_STATE_KEY, history_id: routeId, enabled: true });
  return { route_id: routeId, created: !existing };
}

// ── Data loaders ───────────────────────────────────────────────────────────────
async function getEmailFeed(svc, email) {
  const rows = extractItems(await svc.EmailFeed.filter({ user_email: email }, '-created_date', 5));
  return rows.find(r => r.user_email === email) || null;
}

async function listOwnFeeds(svc, email) {
  const out = [];
  for (let skip = 0; skip < 5000; skip += 500) {
    const page = extractItems(await svc.Feed.filter({ created_by: email }, '-created_date', 500, skip, ['id', 'created_by']));
    out.push(...page.filter(f => f.created_by === email));
    if (page.length < 500) break;
  }
  return out;
}

async function ownSubscription(svc, email, id) {
  if (!id) return null;
  const sub = await svc.NewsletterSubscription.get(String(id)).catch(() => null);
  if (!sub || sub.owner_email !== email) return null;
  return sub;
}

async function buildState(svc, user, cfg, emailFeed) {
  const subs = extractItems(await svc.NewsletterSubscription.filter({ owner_email: user.email }, '-last_email_date', 500))
    .filter(s => s.owner_email === user.email);
  const feedIds = subs.map(s => s.feed_id).filter(Boolean);
  const feeds = feedIds.length
    ? extractItems(await svc.Feed.filter({ id: { $in: feedIds } }, '-created_date', 500, 0, ['id', 'item_count', 'status', 'created_by']))
    : [];
  const feedById = Object.fromEntries(feeds.map(f => [f.id, f]));

  const confirmations = extractItems(await svc.NewsletterEmail.filter(
    { owner_email: user.email, is_confirmation: true, confirmation_status: 'pending' }, '-received_at', 20,
    0, ['id', 'from_email', 'from_name', 'subject', 'received_at', 'confirm_url', 'owner_email']))
    .filter(e => e.owner_email === user.email);

  const ownFeedCount = isPremium(user) ? null : (await listOwnFeeds(svc, user.email)).length;

  return {
    success: true,
    configured: cfg.configured,
    reason: cfg.configured ? null : NOT_CONFIGURED,
    domain: cfg.domain || null,
    address: emailFeed?.is_active !== false && emailFeed && !isLegacyAddress(emailFeed.unique_email, cfg.domain || '') ? emailFeed.unique_email : null,
    total_received: emailFeed?.total_received || 0,
    last_email_date: emailFeed?.last_email_date || null,
    plan: isPremium(user) ? 'premium' : 'free',
    limit: isPremium(user) ? null : FREE_FEED_LIMIT,
    source_count: ownFeedCount,
    senders: subs.map(s => ({
      id: s.id,
      name: s.newsletter_name || s.from_name || s.from_email,
      from_email: s.from_email,
      status: s.status || (s.is_active === false ? 'paused' : 'active'),
      paused_reason: s.paused_reason || null,
      email_count: s.email_count || 0,
      item_count: feedById[s.feed_id]?.item_count ?? null,
      last_email_date: s.last_email_date || null,
      feed_id: s.feed_id || null,
      has_unsubscribe: !!s.list_unsubscribe,
    })),
    confirmations: confirmations.map(e => ({
      id: e.id, from_email: e.from_email, from_name: e.from_name, subject: e.subject,
      received_at: e.received_at, confirm_url: e.confirm_url || null,
    })),
  };
}

// ── CANONICAL COPY (keep in sync with mailgunWebhook): newsletter Feed + FeedItem ──
async function createSenderFeed(svc, ownerEmail, sub) {
  const base = {
    name: String(sub.newsletter_name || sub.from_name || sub.from_email).slice(0, 200),
    url: `newsletter://${sub.from_email}`,
    category: guessCategory(`${sub.newsletter_name || ''} ${sub.from_email}`),
    tags: ['newsletter'],
    status: 'active',
    item_count: 0,
    metadata_json: JSON.stringify({ newsletter: true, sender_email: sub.from_email, subscription_id: sub.id }),
    created_by: ownerEmail,
  };
  try {
    return await svc.Feed.create({ ...base, source_type: 'newsletter' });
  } catch {
    // Feed.source_type does not allow 'newsletter' yet: create without it (metadata + url mark it).
    return await svc.Feed.create(base);
  }
}

function guessCategory(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(real estate|multifamily|housing|rental|property|properties|cre|reit|mortgage|apartment)\b/.test(t)) return 'CRE';
  if (/\b(ai|a\.i\.|machine learning|llm|gpt|artificial intelligence)\b/.test(t)) return 'AI';
  if (/\b(crypto|bitcoin|ethereum|blockchain|defi)\b/.test(t)) return 'Crypto';
  if (/\b(markets?|stocks?|equities|bonds|trading|investor|investing|macro)\b/.test(t)) return 'Markets';
  if (/\b(finance|fintech|banking|money|economy|economics)\b/.test(t)) return 'Finance';
  if (/\b(tech|software|startup|startups|developer|engineering|saas|product)\b/.test(t)) return 'Tech';
  if (/\b(news|daily|briefing|politics|world|times|post|journal)\b/.test(t)) return 'News';
  return 'Other';
}

function appUrl() {
  return (Deno.env.get('BASE44_APP_URL') || 'https://mergerss.com').replace(/\/+$/, '');
}

function feedItemFromEmail(email, feed) {
  const text = String(email.text_content || '');
  return {
    feed_id: feed.id,
    title: String(email.subject || '(no subject)').slice(0, 500),
    url: email.view_url || `${appUrl()}/Newsletters?email=${email.id}`,
    description: text.replace(/\s+/g, ' ').trim().slice(0, 500),
    content: text.slice(0, 20000),
    author: String(email.from_name || email.from_email || '').slice(0, 200),
    published_date: email.received_at || new Date().toISOString(),
    guid: email.message_id || `newsletter:${email.id}`,
    category: feed.category,
    tags: ['newsletter'],
    is_read: false,
  };
}

function triggerEnrichment(base44, ids) {
  if (!ids.length) return;
  base44.asServiceRole.functions.invoke('enrichFeedItems', { item_ids: ids.slice(0, 20) }, {
    headers: { 'x-internal-secret': Deno.env.get('INTERNAL_SECRET') || '' },
  }).catch(() => {});
}
// ───────────────────────────────────────────────────────────────────────────────

// Resume a sender: make sure a Feed exists (plan limit permitting) and turn the most recent
// stored-but-not-ingested emails into FeedItems.
async function activateSender(base44, svc, user, sub) {
  let feed = sub.feed_id ? await svc.Feed.get(sub.feed_id).catch(() => null) : null;
  if (feed && feed.created_by !== user.email) feed = null;

  if (!feed) {
    if (!isPremium(user)) {
      const count = (await listOwnFeeds(svc, user.email)).length;
      if (count >= FREE_FEED_LIMIT) {
        await svc.NewsletterSubscription.update(sub.id, {
          status: 'over_limit', is_active: false,
          paused_reason: `Free plan limit of ${FREE_FEED_LIMIT} sources reached`,
        });
        return { ok: false, limit_reached: true, error: `Free plan limit reached: you can have up to ${FREE_FEED_LIMIT} sources. Remove a source or upgrade to Premium.` };
      }
    }
    feed = await createSenderFeed(svc, user.email, sub);
  } else if (feed.status !== 'active') {
    await svc.Feed.update(feed.id, { status: 'active' });
  }

  await svc.NewsletterSubscription.update(sub.id, { status: 'active', is_active: true, paused_reason: '', feed_id: feed.id });

  // Backfill up to 10 recent emails that were stored while paused / over limit.
  const stored = extractItems(await svc.NewsletterEmail.filter(
    { owner_email: user.email, subscription_id: sub.id, ingest_status: { $in: ['sender_paused', 'over_limit'] } }, '-received_at', 10))
    .filter(e => e.owner_email === user.email && !e.feed_item_id);
  const existing = extractItems(await svc.FeedItem.filter({ feed_id: feed.id }, '-created_date', 300, 0, ['id', 'guid']));
  const seen = new Set(existing.map(i => i.guid).filter(Boolean));
  const created = [];
  for (const e of stored) {
    const item = feedItemFromEmail(e, feed);
    if (seen.has(item.guid)) continue;
    try {
      const fi = await svc.FeedItem.create(item);
      seen.add(item.guid);
      created.push(fi.id);
      await svc.NewsletterEmail.update(e.id, { feed_item_id: fi.id, feed_id: feed.id, ingest_status: 'ingested' });
    } catch (err) {
      console.warn('[newsletterInbox] backfill item failed:', err?.message);
    }
  }
  if (created.length) {
    await svc.Feed.update(feed.id, { item_count: (feed.item_count || 0) + created.length, last_fetched: new Date().toISOString(), last_successful_fetch_at: new Date().toISOString() }).catch(() => {});
    triggerEnrichment(base44, created);
  }
  return { ok: true, feed_id: feed.id, backfilled: created.length };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'get');
    const svc = base44.asServiceRole.entities;
    const cfg = mailgunConfig();

    if (action === 'get' || action === 'list') {
      const ef = await getEmailFeed(svc, user.email);
      return Response.json(await buildState(svc, user, cfg, ef));
    }

    if (action === 'get_or_create') {
      let ef = await getEmailFeed(svc, user.email);
      if (!cfg.configured) {
        return Response.json(await buildState(svc, user, cfg, ef));
      }

      let routeError = null;
      try { await ensureRoute(svc, cfg); } catch (e) { routeError = e?.message || 'route setup failed'; console.error('[newsletterInbox] ensureRoute:', routeError); }

      if (!ef || isLegacyAddress(ef.unique_email, cfg.domain) || ef.is_active === false) {
        let address = null;
        for (let i = 0; i < 6 && !address; i++) {
          const candidate = `${nameSlug(user)}.${randomSuffix(6)}@${cfg.domain}`;
          const clash = extractItems(await svc.EmailFeed.filter({ unique_email: candidate }, '-created_date', 1));
          if (!clash.length) address = candidate;
        }
        if (!address) return Response.json({ error: 'Could not allocate an address, try again' }, { status: 500 });

        if (ef) ef = await svc.EmailFeed.update(ef.id, { unique_email: address, is_active: true, user_id: user.id });
        else ef = await svc.EmailFeed.create({ user_email: user.email, user_id: user.id, unique_email: address, is_active: true, total_received: 0 });
        ef = { ...ef, unique_email: address, is_active: true };
      }

      if (user.newsletter_address !== ef.unique_email) {
        await svc.User.update(user.id, { newsletter_address: ef.unique_email }).catch(e => console.warn('[newsletterInbox] User.newsletter_address write failed:', e?.message));
      }

      const state = await buildState(svc, user, cfg, ef);
      return Response.json({ ...state, route_error: user.role === 'admin' ? routeError : (routeError ? 'Inbox routing is not set up yet; emails may not arrive.' : null) });
    }

    if (action === 'set_alias') {
      if (!cfg.configured) return Response.json({ success: false, configured: false, error: NOT_CONFIGURED }, { status: 400 });
      const alias = String(body.alias ?? '').trim().toLowerCase();
      const invalid = validateAlias(alias);
      if (invalid) return Response.json({ success: false, error: invalid }, { status: 400 });
      const address = `${alias}@${cfg.domain}`;

      let ef = await getEmailFeed(svc, user.email);
      if (ef && ef.unique_email === address && ef.is_active !== false) {
        return Response.json(await buildState(svc, user, cfg, ef));
      }

      const rate = await aliasChangeState(svc, user.email);
      if (rate.stamps.length >= ALIAS_CHANGE_LIMIT) {
        return Response.json({ success: false, error: `You can change your address up to ${ALIAS_CHANGE_LIMIT} times a day. Try again later.` }, { status: 429 });
      }

      const taken = extractItems(await svc.EmailFeed.filter({ unique_email: address }, '-created_date', 5))
        .some(r => r.unique_email === address && r.user_email !== user.email);
      if (taken) return Response.json({ success: false, error: 'That address is already taken.' }, { status: 409 });

      const previous = ef?.unique_email || null;
      if (ef) ef = await svc.EmailFeed.update(ef.id, { unique_email: address, is_active: true, user_id: user.id });
      else ef = await svc.EmailFeed.create({ user_email: user.email, user_id: user.id, unique_email: address, is_active: true, total_received: 0 });
      ef = { ...ef, unique_email: address, is_active: true };

      // Lost a race with another user claiming the same alias: put the old address back.
      const owners = extractItems(await svc.EmailFeed.filter({ unique_email: address }, 'created_date', 5))
        .filter(r => r.unique_email === address);
      if (owners.length > 1 && owners[0].user_email !== user.email) {
        if (previous) await svc.EmailFeed.update(ef.id, { unique_email: previous }).catch(() => {});
        else await svc.EmailFeed.delete(ef.id).catch(() => {});
        return Response.json({ success: false, error: 'That address is already taken.' }, { status: 409 });
      }

      const stamps = [...rate.stamps, Date.now()];
      if (rate.row) await svc.SyncState.update(rate.row.id, { history_id: JSON.stringify(stamps), enabled: false }).catch(e => console.warn('[newsletterInbox] alias rate write failed:', e?.message));
      else await svc.SyncState.create({ key: rate.key, history_id: JSON.stringify(stamps), enabled: false }).catch(e => console.warn('[newsletterInbox] alias rate write failed:', e?.message));

      await svc.User.update(user.id, { newsletter_address: address }).catch(e => console.warn('[newsletterInbox] User.newsletter_address write failed:', e?.message));

      const state = await buildState(svc, user, cfg, ef);
      return Response.json({ ...state, previous_address: previous, alias_changes_left: Math.max(0, ALIAS_CHANGE_LIMIT - stamps.length) });
    }

    if (action === 'ensure_route') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!cfg.configured) return Response.json({ configured: false, reason: NOT_CONFIGURED });
      const r = await ensureRoute(svc, cfg, true);
      return Response.json({ success: true, configured: true, webhook_url: webhookUrl(), ...r });
    }

    // Admin diagnostics: the catch-all route as Mailgun sees it, plus recent inbound events.
    if (action === 'diagnose') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!cfg.configured) return Response.json({ configured: false, reason: NOT_CONFIGURED });
      const out = { domain: cfg.domain, api_base: cfg.apiBase, webhook_url: webhookUrl() };
      try {
        const routes = await mailgunFetch(cfg, '/v3/routes?limit=1000');
        out.routes = (routes.items || [])
          .filter(r => String(r.expression || '').includes(cfg.domain.replace(/\./g, '\\.')) || String(r.expression || '').includes(cfg.domain))
          .map(r => ({ id: r.id, priority: r.priority, description: r.description, expression: r.expression, actions: r.actions }));
      } catch (e) { out.routes_error = e?.message; }
      try {
        // Newest first: Mailgun searches backwards from `begin` to `end` when ascending=no.
        const nowS = Math.floor(Date.now() / 1000);
        const endS = nowS - (Number(body.hours) || 6) * 3600;
        const q = new URLSearchParams({ begin: String(nowS), end: String(endS), ascending: 'no', limit: '50' });
        if (body.recipient) q.set('recipient', String(body.recipient));
        const ev = await mailgunFetch(cfg, `/v3/${cfg.domain}/events?${q.toString()}`);
        out.events = (ev.items || []).map(e => ({
          time: new Date((e.timestamp || 0) * 1000).toISOString(), event: e.event, recipient: e.recipient,
          from: e.message?.headers?.from, subject: e.message?.headers?.subject,
          reason: e.reason || e['delivery-status']?.message || e['delivery-status']?.description || '',
          code: e['delivery-status']?.code, routes: (e.routes || []).map(r => r.id || r.description),
        }));
      } catch (e) { out.events_error = e?.message; }

      // Optional end-to-end test: send a message from the domain to an inbox address.
      if (body.send_test_to) {
        try {
          const form = new FormData();
          form.append('from', `MergeRSS Newsletter inbox test <inbox-test@${cfg.domain}>`);
          form.append('to', String(body.send_test_to));
          form.append('subject', `Newsletter inbox test ${new Date().toISOString()}`);
          form.append('text', 'Newsletter inbox test\nIf this shows up as a story from this source, inbound newsletters work end to end.');
          const filler = body.large ? Array.from({ length: 600 }, (_, i) => `<tr><td style="padding:8px;font-family:Arial,sans-serif;color:#333">Row ${i}: Ottawa rental market update, unit absorption and pricing notes for this week.</td></tr>`).join('') : '';
          // Brand v3 palette (lib/brand.ts): ink page, violet eyebrow, display heading.
          form.append('html', `<div style="background:#0A0910;padding:24px;"><p style="margin:0 0 8px;font:600 10px/1.4 'JetBrains Mono',Consolas,monospace;letter-spacing:0.14em;text-transform:uppercase;color:#9B5CF6;">Newsletter inbox</p><h1 style="margin:0 0 12px;font:600 22px/1.3 'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif;color:#F3F1F7;">Newsletter inbox test</h1><p style="margin:0;font:400 15px/1.7 Inter,'Segoe UI',Helvetica,Arial,sans-serif;color:#C9C5D4;">If this shows up as a story from this source, inbound newsletters work end to end.</p>${filler ? `<table>${filler}</table>` : ''}</div>`);
          out.send_test = await mailgunFetch(cfg, `/v3/${cfg.domain}/messages`, { method: 'POST', body: form });
        } catch (e) { out.send_test_error = e?.message; }
      }

      // Optional replay: re-post a stored inbound message to the webhook with a fresh signature.
      if (body.replay_recipient) {
        try {
          const nowS = Math.floor(Date.now() / 1000);
          const q = new URLSearchParams({ begin: String(nowS), end: String(nowS - 72 * 3600), ascending: 'no', limit: '20', event: 'accepted', recipient: String(body.replay_recipient) });
          const ev = await mailgunFetch(cfg, `/v3/${cfg.domain}/events?${q.toString()}`);
          const hit = (ev.items || []).find(e => e.storage?.url);
          if (!hit) throw new Error('no stored message found');
          const sres = await fetch(hit.storage.url, { headers: { Authorization: `Basic ${btoa(`api:${cfg.apiKey}`)}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
          if (!sres.ok) throw new Error(`storage ${sres.status}`);
          const msg = await sres.json();
          const signingKey = Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY') || cfg.apiKey;
          const token = crypto.randomUUID().replace(/-/g, '');
          const ts = String(Math.floor(Date.now() / 1000));
          const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts + token))), b => b.toString(16).padStart(2, '0')).join('');
          const form = new FormData();
          form.append('recipient', String(body.replay_recipient));
          for (const k of ['sender', 'from', 'From', 'subject', 'Subject', 'body-plain', 'body-html', 'stripped-text', 'stripped-html', 'Message-Id', 'To', 'List-Unsubscribe']) {
            if (typeof msg[k] === 'string') form.append(k, msg[k]);
          }
          if (msg['message-headers']) form.append('message-headers', typeof msg['message-headers'] === 'string' ? msg['message-headers'] : JSON.stringify(msg['message-headers']));
          form.append('timestamp', ts); form.append('token', token); form.append('signature', sig);
          const r = await fetch(webhookUrl(), { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
          out.replay = { status: r.status, body: (await r.text()).slice(0, 500), message_keys: Object.keys(msg).slice(0, 40) };
        } catch (e) { out.replay_error = e?.message; }
      }
      console.log('[newsletterInbox] diagnose', JSON.stringify(out).slice(0, 8000));
      await svc.SyncState.create({ key: 'mailgun_diagnose', history_id: JSON.stringify(out).slice(0, 20000), enabled: false }).catch(() => {});
      return Response.json(out);
    }

    if (action === 'pause') {
      const sub = await ownSubscription(svc, user.email, body.subscription_id);
      if (!sub) return Response.json({ error: 'Sender not found' }, { status: 404 });
      await svc.NewsletterSubscription.update(sub.id, { status: 'paused', is_active: false, paused_reason: 'Paused by you' });
      if (sub.feed_id) {
        const feed = await svc.Feed.get(sub.feed_id).catch(() => null);
        if (feed && feed.created_by === user.email) await svc.Feed.update(feed.id, { status: 'paused', paused_by_system: false });
      }
      return Response.json({ success: true });
    }

    if (action === 'unpause' || action === 'restore') {
      const sub = await ownSubscription(svc, user.email, body.subscription_id);
      if (!sub) return Response.json({ error: 'Sender not found' }, { status: 404 });
      const r = await activateSender(base44, svc, user, sub);
      if (!r.ok) return Response.json({ success: false, ...r }, { status: 403 });
      return Response.json({ success: true, ...r });
    }

    if (action === 'remove') {
      const sub = await ownSubscription(svc, user.email, body.subscription_id);
      if (!sub) return Response.json({ error: 'Sender not found' }, { status: 404 });
      let deletedItems = 0;
      if (sub.feed_id) {
        const feed = await svc.Feed.get(sub.feed_id).catch(() => null);
        if (feed && feed.created_by === user.email) {
          if (body.delete_items !== false) {
            // Bounded cleanup so the call stays fast; anything left is orphaned by a deleted feed.
            const items = extractItems(await svc.FeedItem.filter({ feed_id: feed.id }, '-created_date', 200, 0, ['id']));
            for (const it of items) { try { await svc.FeedItem.delete(it.id); deletedItems++; } catch { /* ignore */ } }
          }
          await svc.Feed.delete(feed.id).catch(() => {});
        }
      }
      await svc.NewsletterSubscription.update(sub.id, { status: 'removed', is_active: false, feed_id: '', paused_reason: 'Removed by you' });
      return Response.json({ success: true, deleted_items: deletedItems });
    }

    if (action === 'dismiss_confirmation') {
      const e = body.email_id ? await svc.NewsletterEmail.get(String(body.email_id)).catch(() => null) : null;
      if (!e || e.owner_email !== user.email) return Response.json({ error: 'Not found' }, { status: 404 });
      await svc.NewsletterEmail.update(e.id, { confirmation_status: body.done ? 'done' : 'dismissed' });
      return Response.json({ success: true });
    }

    if (action === 'get_email') {
      const e = body.email_id ? await svc.NewsletterEmail.get(String(body.email_id)).catch(() => null) : null;
      if (!e || e.owner_email !== user.email) return Response.json({ error: 'Not found' }, { status: 404 });
      // Large newsletters keep their HTML in private storage.
      let html = e.html_content || '';
      if (!html && e.html_file_uri) {
        try {
          const s = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: e.html_file_uri, expires_in: 120 });
          const r = s?.signed_url ? await fetch(s.signed_url, { signal: AbortSignal.timeout(15000) }) : null;
          if (r?.ok) html = await r.text();
        } catch (err) { console.warn('[newsletterInbox] html fetch failed:', err?.message); }
      }
      return Response.json({
        success: true,
        email: {
          id: e.id, subject: e.subject, from_name: e.from_name, from_email: e.from_email,
          received_at: e.received_at, html_content: html, text_content: e.text_content || '',
          view_url: e.view_url || null, confirm_url: e.confirm_url || null, is_confirmation: !!e.is_confirmation,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[newsletterInbox] error:', error);
    return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
});
