/**
 * processGmailNewsletters
 * Gmail connector automation handler.
 * The platform pre-enriches the payload with data.new_message_ids before calling this function.
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

  // The platform pre-populates data.new_message_ids — no manual Pub/Sub decoding needed
  const messageIds = body?.data?.new_message_ids ?? [];
  console.log(`[processGmailNewsletters] Received ${messageIds.length} new message IDs`);

  if (messageIds.length === 0) {
    return Response.json({ status: 'no_new_messages' });
  }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Check if sync is enabled
  const syncStates = await base44.asServiceRole.entities.SyncState.filter({ key: 'gmail_newsletters' });
  const syncRecord = syncStates[0] || null;
  if (syncRecord && syncRecord.enabled === false) {
    return Response.json({ status: 'disabled' });
  }

  // Load active subscriptions and build sender map
  const subscriptions = await base44.asServiceRole.entities.EmailSubscription.filter({ is_active: true }, '-created_date', 200);
  const senderMap = {};
  for (const sub of subscriptions) {
    for (const email of (sub.sender_emails || [])) {
      senderMap[email.toLowerCase()] = sub;
    }
  }

  let processed = 0;
  let created = 0;

  for (const msgId of messageIds) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: authHeader }
    );
    if (!msgRes.ok) {
      console.warn(`[processGmailNewsletters] Failed to fetch message ${msgId}: ${msgRes.status}`);
      continue;
    }

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
    if (!matchedSub) {
      console.log(`[processGmailNewsletters] No subscription match for sender: ${senderEmail}`);
      continue;
    }

    // Dedupe
    const existing = await base44.asServiceRole.entities.NewsletterEmail.filter({ gmail_message_id: msgId }, '-created_date', 1);
    if (existing.length > 0) {
      console.log(`[processGmailNewsletters] Duplicate skipped: ${msgId}`);
      continue;
    }

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

    await base44.asServiceRole.entities.EmailSubscription.update(matchedSub.id, {
      email_count: (matchedSub.email_count || 0) + 1,
      last_received_at: receivedAt,
    });

    created++;
    await sleep(100);
  }

  console.log(`[processGmailNewsletters] processed=${processed} created=${created}`);
  return Response.json({ status: 'ok', processed, created });
});