import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * mailgunWebhook — public HTTP endpoint for the per-user newsletter inbox.
 *
 * One Mailgun route (catch-all for MAILGUN_DOMAIN, created by newsletterInbox) forwards every
 * inbound message here as a parsed multipart POST. For each message:
 *   1. verify the Mailgun signature (HMAC-SHA256 of timestamp+token with MAILGUN_WEBHOOK_SIGNING_KEY,
 *      falling back to MAILGUN_API_KEY); unsigned or stale requests are rejected
 *   2. recipient -> EmailFeed -> owner
 *   3. confirmation emails (double opt-in, Gmail/Outlook forwarding verification) are stored and
 *      surfaced on the Newsletters page with their link; they are never auto-clicked
 *   4. otherwise upsert a NewsletterSubscription + per-sender Feed owned by the user and create a
 *      FeedItem (dedupe on Message-Id), then fire enrichment. Free users over the 50-source limit
 *      get the email stored and the sender marked over_limit.
 *
 * Responses are 200 for anything Mailgun should not retry (unknown recipient, duplicates),
 * 401 for bad signatures.
 */

const FREE_FEED_LIMIT = 50; // sync with lib/planLimits.js PLAN_LIMITS.free.feeds
const MAX_HTML = 150000;
const MAX_TEXT = 20000;

function extractItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

// ── Signature ──────────────────────────────────────────────────────────────────
async function verifyMailgunSignature(token, timestamp, signature) {
  try {
    const keys = [Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY'), Deno.env.get('MAILGUN_API_KEY')].filter(Boolean);
    if (!keys.length) return false;
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 900) return false;
    if (!token || typeof token !== 'string') return false;
    if (!signature || typeof signature !== 'string' || signature.length !== 64 || !/^[0-9a-fA-F]+$/.test(signature)) return false;
    const provided = new Uint8Array(signature.match(/.{2}/g).map(b => parseInt(b, 16)));
    for (const k of keys) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const computed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + token)));
      let diff = computed.length ^ provided.length;
      for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ provided[i];
      if (diff === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Parsing helpers ────────────────────────────────────────────────────────────
function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '-').replace(/&mdash;/gi, '-').replace(/&hellip;/gi, '...')
    .replace(/&zwnj;|&zwj;|&shy;/gi, '').replace(/&amp;/gi, '&');
}

function parseAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const e = s.match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return { name: '', email: e ? e[0].toLowerCase() : '' };
}

function headerMap(formData) {
  const map = {};
  const raw = formData.get('message-headers');
  if (typeof raw === 'string') {
    try {
      for (const pair of JSON.parse(raw)) {
        if (Array.isArray(pair) && pair.length >= 2) {
          const k = String(pair[0]).toLowerCase();
          if (!(k in map)) map[k] = String(pair[1]);
        }
      }
    } catch { /* ignore */ }
  }
  return map;
}

function stripTracking(html) {
  return html
    // 1x1 / hidden tracking pixels
    .replace(/<img\b[^>]*(?:width\s*=\s*["']?[01]["'\s>/]|height\s*=\s*["']?[01]["'\s>/]|display\s*:\s*none)[^>]*>/gi, '')
    .replace(/<img\b[^>]*(?:open\.|\/open\b|\/o\/|pixel|track|beacon)[^>]*>/gi, '');
}

function sanitizeHtml(html) {
  let h = String(html || '');
  h = h.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|iframe|object|applet|frameset|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(meta|link|base|embed|frame)\b[^>]*>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"');
  h = stripTracking(h);
  return h.length > MAX_HTML ? h.slice(0, MAX_HTML) : h;
}

function htmlToText(html) {
  let h = String(html || '');
  h = h.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table|section|article|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(h).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const FOOTER_RE = /(unsubscribe|update your (email )?preferences|manage (your )?(subscription|preferences|email)|you('re| are) receiving this|you received this|no longer (wish|want) to receive|this email was sent to|opt[- ]out)/i;

function stripFooter(text) {
  const lines = text.split('\n');
  const minKeep = Math.floor(lines.length * 0.6);
  for (let i = Math.max(minKeep, 1); i < lines.length; i++) {
    if (FOOTER_RE.test(lines[i])) return lines.slice(0, i).join('\n').trim();
  }
  return text;
}

function stripHeaderNoise(text) {
  // Drop leading "View in browser" / preheader lines.
  return text.replace(/^(?:.*(view (this )?(email|it|online|in (your )?browser)|web version|read online|open in browser).*\n)+/i, '').trim();
}

function extractLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null && out.length < 200) {
    const url = decodeEntities(m[2]).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url, text: htmlToText(m[3]).replace(/\s+/g, ' ').slice(0, 200) });
  }
  return out;
}

const VIEW_RE = /(view|read|open|see)\s+(this\s+)?(email|newsletter|post|issue|it|message)?\s*(in|on|as)\s+(your\s+|a\s+)?(browser|web|website|online|web\s*page)|view online|read online|web version|online version|read on (the )?web|read in (the )?app/i;

function findViewUrl(links, text) {
  const hit = links.find(l => VIEW_RE.test(l.text));
  if (hit) return hit.url;
  const lines = String(text || '').split('\n').slice(0, 8);
  for (const line of lines) {
    if (VIEW_RE.test(line)) {
      const u = line.match(/https?:\/\/[^\s)>\]]+/);
      if (u) return u[0];
    }
  }
  return null;
}

const CONFIRM_SUBJECT_RE = /(confirm|verify|activate|validate)\b.{0,40}\b(subscription|email|e-mail|address|sign ?up|account)|please confirm|double opt|opt-?in|forwarding confirmation|confirm (your|that you)|one more step|almost (done|there|subscribed)|finish (signing|subscribing)|complete your (subscription|sign ?up)/i;
const CONFIRM_LINK_RE = /(confirm|verify|activate|validate|opt-?in|yes,? (subscribe|sign me up)|subscribe me|complete (my )?subscription|click here to (confirm|verify))/i;

function detectConfirmation(subject, text, links, fromEmail) {
  const subj = String(subject || '');
  const body = String(text || '').slice(0, 3000);
  const looks = CONFIRM_SUBJECT_RE.test(subj) || (/forwarding-noreply@google\.com/i.test(fromEmail)) ||
    (body.length < 3000 && CONFIRM_SUBJECT_RE.test(body) && links.some(l => CONFIRM_LINK_RE.test(l.text) || CONFIRM_LINK_RE.test(l.url)));
  if (!looks) return { is_confirmation: false, confirm_url: null };
  const byText = links.find(l => CONFIRM_LINK_RE.test(l.text) && !/unsubscribe/i.test(l.text + l.url));
  const byUrl = links.find(l => CONFIRM_LINK_RE.test(l.url) && !/unsubscribe/i.test(l.url));
  let url = (byText || byUrl)?.url || null;
  if (!url) {
    const m = body.match(/https?:\/\/[^\s)>\]]*(confirm|verify|activate|opt-?in)[^\s)>\]]*/i);
    if (m) url = m[0];
  }
  return { is_confirmation: true, confirm_url: url };
}

// For manually forwarded mail (From = the user), recover the original sender from the body.
function originalSenderFromForward(text) {
  const m = String(text || '').match(/-{3,}\s*Forwarded message\s*-{3,}[\s\S]{0,400}?\bFrom:\s*([^\n]+)/i) ||
    String(text || '').match(/\n\s*From:\s*([^\n]+@[^\n]+)\n[\s\S]{0,200}?(Sent|Date):/i);
  if (!m) return null;
  const a = parseAddress(m[1].replace(/\*/g, ''));
  return a.email ? a : null;
}

// ── CANONICAL COPY (keep in sync with newsletterInbox): newsletter Feed + FeedItem ──
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
  return (Deno.env.get('BASE44_APP_URL') || 'https://mergerss.app').replace(/\/+$/, '');
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

async function countOwnFeeds(svc, email) {
  let n = 0;
  for (let skip = 0; skip < 5000; skip += 500) {
    const page = extractItems(await svc.Feed.filter({ created_by: email }, '-created_date', 500, skip, ['id', 'created_by']));
    n += page.filter(f => f.created_by === email).length;
    if (page.length < 500) break;
  }
  return n;
}

function field(formData, ...names) {
  for (const n of names) {
    const v = formData.get(n);
    if (typeof v === 'string' && v.length) return v;
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;

    let formData;
    try { formData = await req.formData(); } catch { return Response.json({ error: 'Expected form data' }, { status: 400 }); }

    const ok = await verifyMailgunSignature(field(formData, 'token'), field(formData, 'timestamp'), field(formData, 'signature'));
    if (!ok) return Response.json({ error: 'Invalid signature' }, { status: 401 });

    const headers = headerMap(formData);
    const domain = (Deno.env.get('MAILGUN_DOMAIN') || '').toLowerCase();

    // ── Recipient -> EmailFeed ──
    const recipientCandidates = [field(formData, 'recipient'), field(formData, 'To', 'to'), headers['to'] || '', headers['delivered-to'] || '', headers['x-forwarded-to'] || '']
      .join(',').split(/[,;]/).map(s => parseAddress(s).email).filter(Boolean)
      .filter(e => !domain || e.endsWith('@' + domain));
    let emailFeed = null;
    let recipient = '';
    for (const r of [...new Set(recipientCandidates)]) {
      const rows = extractItems(await svc.EmailFeed.filter({ unique_email: r }, '-created_date', 1));
      if (rows[0]) { emailFeed = rows[0]; recipient = r; break; }
    }
    if (!emailFeed || emailFeed.is_active === false) {
      // 200 so Mailgun does not retry mail for unknown / retired addresses.
      return Response.json({ success: true, ignored: 'unknown recipient' });
    }
    const ownerEmail = emailFeed.user_email;

    // ── Parse message ──
    const fromRaw = field(formData, 'from', 'From') || headers['from'] || field(formData, 'sender');
    let from = parseAddress(fromRaw);
    if (!from.email) from = parseAddress(field(formData, 'sender'));
    const subject = (field(formData, 'subject', 'Subject') || headers['subject'] || '(no subject)').slice(0, 500);
    const rawHtml = field(formData, 'body-html', 'stripped-html', 'html-body');
    const rawText = field(formData, 'body-plain', 'stripped-text', 'text-body');
    let messageId = (field(formData, 'Message-Id', 'message-id', 'Message-ID') || headers['message-id'] || '').trim();
    const listUnsub = (field(formData, 'List-Unsubscribe') || headers['list-unsubscribe'] || '').slice(0, 1000);

    const links = rawHtml ? extractLinks(rawHtml) : [];
    let text = rawHtml ? htmlToText(rawHtml) : String(rawText || '').trim();
    if (!text && rawText) text = String(rawText).trim();

    // Manually forwarded by the user: attribute to the original sender.
    if (from.email && from.email === String(ownerEmail).toLowerCase()) {
      const orig = originalSenderFromForward(rawText || text);
      if (orig) from = orig;
    }
    if (!from.email) return Response.json({ success: true, ignored: 'no sender' });

    const viewUrl = findViewUrl(links, rawText || text);
    const cleanText = stripFooter(stripHeaderNoise(text)).slice(0, MAX_TEXT);
    const now = new Date().toISOString();
    if (!messageId) {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${from.email}|${subject}|${cleanText.slice(0, 2000)}`)));
      messageId = 'sha256:' + Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
    }

    // ── Dedupe on Message-Id per owner ──
    const dup = extractItems(await svc.NewsletterEmail.filter({ owner_email: ownerEmail, message_id: messageId }, '-created_date', 1));
    if (dup.length) return Response.json({ success: true, duplicate: true });

    await svc.EmailFeed.update(emailFeed.id, { total_received: (emailFeed.total_received || 0) + 1, last_email_date: now }).catch(() => {});

    const baseEmail = {
      source: 'inbound',
      message_id: messageId,
      email_feed_id: emailFeed.id,
      recipient,
      from_email: from.email,
      from_name: (from.name || '').slice(0, 200),
      subject,
      received_at: now,
      text_content: cleanText,
      html_content: rawHtml ? sanitizeHtml(rawHtml) : '',
      view_url: viewUrl || '',
      list_unsubscribe: listUnsub,
      links: links.slice(0, 60),
      is_read: false,
      owner_email: ownerEmail,
    };

    // ── Confirmation emails: store + surface, never ingest, never auto-click ──
    const conf = detectConfirmation(subject, text, links, from.email);
    if (conf.is_confirmation) {
      await svc.NewsletterEmail.create({ ...baseEmail, is_confirmation: true, confirm_url: conf.confirm_url || '', confirmation_status: 'pending', ingest_status: 'confirmation' });
      return Response.json({ success: true, confirmation: true });
    }

    // ── Sender subscription ──
    const senderDomain = from.email.split('@')[1] || '';
    let sub = extractItems(await svc.NewsletterSubscription.filter({ owner_email: ownerEmail, from_email: from.email }, '-created_date', 1))[0] || null;
    if (sub?.status === 'removed') return Response.json({ success: true, ignored: 'sender removed' });

    if (!sub) {
      sub = await svc.NewsletterSubscription.create({
        email_feed_id: emailFeed.id,
        owner_email: ownerEmail,
        from_email: from.email,
        from_name: from.name || '',
        newsletter_name: (from.name || senderDomain || from.email).slice(0, 200),
        sender_domain: senderDomain,
        subscribed_date: now,
        email_count: 0,
        status: 'active',
        is_active: true,
        list_unsubscribe: listUnsub,
      });
    }
    await svc.NewsletterSubscription.update(sub.id, {
      email_count: (sub.email_count || 0) + 1,
      last_email_date: now,
      ...(listUnsub ? { list_unsubscribe: listUnsub } : {}),
      ...(from.name && !sub.from_name ? { from_name: from.name } : {}),
    }).catch(() => {});

    // ── Per-sender Feed (plan limit) ──
    let feed = null;
    let status = sub.status || 'active';
    if (status === 'active' || status === 'over_limit') {
      if (sub.feed_id) {
        feed = await svc.Feed.get(sub.feed_id).catch(() => null);
        if (feed && feed.created_by !== ownerEmail) feed = null;
      }
      if (!feed) {
        const owner = extractItems(await svc.User.filter({ email: ownerEmail }, '-created_date', 1))[0] || null;
        const premium = owner?.plan === 'premium' || owner?.role === 'admin';
        if (!premium && (await countOwnFeeds(svc, ownerEmail)) >= FREE_FEED_LIMIT) {
          status = 'over_limit';
          if (sub.status !== 'over_limit') {
            await svc.NewsletterSubscription.update(sub.id, { status: 'over_limit', is_active: false, paused_reason: `Free plan limit of ${FREE_FEED_LIMIT} sources reached` }).catch(() => {});
          }
        } else {
          feed = await createSenderFeed(svc, ownerEmail, sub);
          status = 'active';
          await svc.NewsletterSubscription.update(sub.id, { feed_id: feed.id, status: 'active', is_active: true, paused_reason: '' }).catch(() => {});
        }
      }
    }
    if (feed && feed.status === 'paused') status = 'paused';

    const ingestStatus = feed && status === 'active' ? 'ingested' : (status === 'over_limit' ? 'over_limit' : 'sender_paused');
    const stored = await svc.NewsletterEmail.create({ ...baseEmail, subscription_id: sub.id, feed_id: feed?.id || '', ingest_status: ingestStatus, is_confirmation: false });

    if (ingestStatus !== 'ingested') {
      return Response.json({ success: true, stored: true, ingested: false, reason: ingestStatus });
    }

    // ── FeedItem (dedupe on guid within the feed) ──
    const item = feedItemFromEmail(stored, feed);
    const existing = extractItems(await svc.FeedItem.filter({ feed_id: feed.id, guid: item.guid }, '-created_date', 1));
    if (existing.length) {
      await svc.NewsletterEmail.update(stored.id, { feed_item_id: existing[0].id, ingest_status: 'duplicate' }).catch(() => {});
      return Response.json({ success: true, duplicate: true });
    }
    const created = await svc.FeedItem.create(item);
    await svc.NewsletterEmail.update(stored.id, { feed_item_id: created.id }).catch(() => {});
    await svc.Feed.update(feed.id, {
      item_count: (feed.item_count || 0) + 1,
      last_fetched: now,
      last_successful_fetch_at: now,
      fetch_error: '',
      consecutive_errors: 0,
    }).catch(() => {});
    triggerEnrichment(base44, [created.id]);

    return Response.json({ success: true, ingested: true, feed_item_id: created.id });
  } catch (error) {
    console.error('[mailgunWebhook] error:', error);
    return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
});
