/**
 * processGmailNewsletters
 * Gmail connector automation handler.
 * Watches for new emails from configured subscriptions (EmailSubscription entity).
 * Stores caught emails as NewsletterEmail records — displayed in the EmailFeeds inbox.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeMimePart(part) {
  if (!part) return '';
  if (part.body?.data) {
    return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }
  if (part.parts) {
    for (const p of part.parts) {
      const decoded = decodeMimePart(p);
      if (decoded) return decoded;
    }
  }
  return '';
}

function extractEmailBody(payload) {
  if (!payload) return { html: '', text: '' };
  if (payload.mimeType === 'text/html') return { html: decodeMimePart(payload), text: '' };
  if (payload.mimeType === 'text/plain') return { html: '', text: decodeMimePart(payload) };
  if (payload.parts) {
    let html = '';
    let text = '';
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html') html = decodeMimePart(part);
      else if (part.mimeType === 'text/plain') text = decodeMimePart(part);
      else if (part.mimeType?.startsWith('multipart/')) {
        const nested = extractEmailBody(part);
        if (nested.html) html = nested.html;
        if (nested.text) text = nested.text;
      }
    }
    return { html, text };
  }
  return { html: '', text: '' };
}

function extractTextFromHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html) {
  if (!html) return [];
  const links = [];
  const seen = new Set();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].trim();
    const rawText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Filter out unsubscribe, tracking, and non-http links
    if (!url.startsWith('http')) continue;
    if (/unsubscribe|optout|opt-out|track|click\.|\?r=|utm_/i.test(url)) continue;
    if (rawText.length < 3 || rawText.length > 150) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ url, text: rawText });
    if (links.length >= 30) break;
  }
  return links;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body = {};
  try { body = await req.json(); } catch {}

  const messageData = body?.data?.message?.data;
  if (!messageData) return Response.json({ status: 'no_message_data' });

  let decoded;
  try { decoded = JSON.parse(atob(messageData)); } catch {
    return Response.json({ status: 'decode_error' });
  }

  const currentHistoryId = String(decoded.historyId);

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Load sync state
  const syncStates = await base44.asServiceRole.entities.SyncState.filter({ key: 'gmail_newsletters' });
  const syncRecord = syncStates[0] || null;

  if (!syncRecord) {
    await base44.asServiceRole.entities.SyncState.create({ key: 'gmail_newsletters', history_id: currentHistoryId, enabled: true });
    return Response.json({ status: 'initialized', historyId: currentHistoryId });
  }

  if (syncRecord.enabled === false) {
    return Response.json({ status: 'disabled' });
  }

  const prevHistoryId = syncRecord.history_id;

  // Fetch history
  const historyRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${prevHistoryId}&historyTypes=messageAdded`,
    { headers: authHeader }
  );

  if (!historyRes.ok) {
    const err = await historyRes.text();
    console.error(`[processGmailNewsletters] history.list failed: ${err}`);
    return Response.json({ status: 'history_error', detail: err });
  }

  const historyData = await historyRes.json();
  const histories = historyData.history || [];

  // Load active subscriptions and build sender map
  const subscriptions = await base44.asServiceRole.entities.EmailSubscription.filter({ is_active: true }, '-created_date', 200);
  const senderMap = {}; // email -> subscription
  for (const sub of subscriptions) {
    for (const email of (sub.sender_emails || [])) {
      senderMap[email.toLowerCase()] = sub;
    }
  }

  let processed = 0;
  let created = 0;

  for (const history of histories) {
    for (const added of (history.messagesAdded || [])) {
      const msgId = added.message?.id;
      if (!msgId) continue;

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: authHeader }
      );
      if (!msgRes.ok) continue;

      const msg = await msgRes.json();
      processed++;

      const headers = msg.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const fromHeader = getHeader('From');
      const subject = getHeader('Subject');
      const dateHeader = getHeader('Date');

      const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/(\S+@\S+)/);
      const senderEmail = emailMatch ? emailMatch[1].toLowerCase() : fromHeader.toLowerCase().trim();
      const senderName = fromHeader.match(/^([^<]+)</) ? fromHeader.match(/^([^<]+)</)[1].trim() : senderEmail;

      const matchedSub = senderMap[senderEmail];
      if (!matchedSub) continue;

      // Dedupe
      const existing = await base44.asServiceRole.entities.NewsletterEmail.filter({ gmail_message_id: msgId }, '-created_date', 1);
      if (existing.length > 0) continue;

      const { html, text } = extractEmailBody(msg.payload);
      const textContent = html ? extractTextFromHtml(html) : text;
      const links = extractLinks(html || text);

      const receivedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

      await base44.asServiceRole.entities.NewsletterEmail.create({
        gmail_message_id: msgId,
        subscription_id: matchedSub.id,
        from_email: senderEmail,
        from_name: senderName,
        subject: subject || '(No Subject)',
        received_at: receivedAt,
        text_content: textContent.slice(0, 8000),
        links,
        is_read: false,
      });

      // Update subscription stats
      await base44.asServiceRole.entities.EmailSubscription.update(matchedSub.id, {
        email_count: (matchedSub.email_count || 0) + 1,
        last_received_at: receivedAt,
      });

      created++;
      await sleep(100);
    }
  }

  await base44.asServiceRole.entities.SyncState.update(syncRecord.id, { history_id: currentHistoryId });

  console.log(`[processGmailNewsletters] processed=${processed} created=${created}`);
  return Response.json({ status: 'ok', processed, created });
});