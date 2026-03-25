/**
 * processGmailNewsletters
 * Gmail connector automation handler.
 * Watches for new emails from newsletter senders configured as Feed records (source_type='email').
 * Extracts article content and creates FeedItem records.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  if (!payload) return '';
  // Prefer text/html
  if (payload.mimeType === 'text/html') return decodeMimePart(payload);
  if (payload.mimeType === 'text/plain') return decodeMimePart(payload);
  if (payload.parts) {
    let html = '';
    let text = '';
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html') html = decodeMimePart(part);
      else if (part.mimeType === 'text/plain') text = decodeMimePart(part);
      else if (part.mimeType?.startsWith('multipart/')) {
        const nested = extractEmailBody(part);
        if (nested) { html = nested; break; }
      }
    }
    return html || text;
  }
  return '';
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body = {};
  try { body = await req.json(); } catch {}

  // 1. Decode Pub/Sub notification
  const messageData = body?.data?.message?.data;
  if (!messageData) {
    return Response.json({ status: 'no_message_data' });
  }

  let decoded;
  try {
    decoded = JSON.parse(atob(messageData));
  } catch {
    return Response.json({ status: 'decode_error' });
  }

  const currentHistoryId = String(decoded.historyId);

  // 2. Get Gmail access token
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // 3. Load previous historyId
  const syncStates = await base44.asServiceRole.entities.SyncState.filter({ key: 'gmail_newsletters' });
  const syncRecord = syncStates.length > 0 ? syncStates[0] : null;

  if (!syncRecord) {
    await base44.asServiceRole.entities.SyncState.create({ key: 'gmail_newsletters', history_id: currentHistoryId, enabled: true });
    return Response.json({ status: 'initialized', historyId: currentHistoryId });
  }

  // Check if watcher is disabled
  if (syncRecord.enabled === false) {
    return Response.json({ status: 'disabled' });
  }

  const prevHistoryId = syncRecord.history_id;

  // 4. Fetch history since last known historyId
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

  // 5. Load all email-type Feed records to match senders
  const emailFeeds = await base44.asServiceRole.entities.Feed.filter({ source_type: 'email' }, '-created_date', 200);

  // Build sender → feed map from metadata_json
  const senderFeedMap = {};
  for (const feed of emailFeeds) {
    if (feed.status !== 'active') continue;
    let meta = {};
    try { meta = JSON.parse(feed.metadata_json || '{}'); } catch {}
    const senderEmails = meta.sender_emails || [];
    for (const email of senderEmails) {
      senderFeedMap[email.toLowerCase()] = feed;
    }
  }

  let processed = 0;
  let created = 0;

  for (const history of histories) {
    for (const added of (history.messagesAdded || [])) {
      const msgId = added.message?.id;
      if (!msgId) continue;

      // Fetch full message
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: authHeader }
      );
      if (!msgRes.ok) continue;

      const msg = await msgRes.json();
      processed++;

      // Extract headers
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const fromHeader = getHeader('From');
      const subject = getHeader('Subject');
      const dateHeader = getHeader('Date');

      // Parse sender email from "Name <email>" format
      const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/(\S+@\S+)/);
      const senderEmail = emailMatch ? emailMatch[1].toLowerCase() : fromHeader.toLowerCase().trim();

      // Find matching feed
      const matchedFeed = senderFeedMap[senderEmail];
      if (!matchedFeed) continue;

      // Extract body
      const rawBody = extractEmailBody(msg.payload);
      const textContent = extractTextFromHtml(rawBody);

      // Dedupe check
      const existingItems = await base44.asServiceRole.entities.FeedItem.filter(
        { feed_id: matchedFeed.id, guid: msgId },
        '-created_date', 1
      );
      if (existingItems.length > 0) continue;

      // Create FeedItem
      const publishedDate = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

      await base44.asServiceRole.entities.FeedItem.create({
        feed_id: matchedFeed.id,
        title: subject || 'Newsletter Email',
        url: `gmail://message/${msgId}`,
        description: textContent.slice(0, 500),
        content: textContent.slice(0, 5000),
        author: fromHeader,
        published_date: publishedDate,
        guid: msgId,
        enrichment_status: 'pending',
      });

      // Update feed item_count and last_fetched
      await base44.asServiceRole.entities.Feed.update(matchedFeed.id, {
        item_count: (matchedFeed.item_count || 0) + 1,
        last_fetched: new Date().toISOString(),
        last_successful_fetch_at: new Date().toISOString(),
      });

      created++;
      await sleep(100);
    }
  }

  // 6. Update stored historyId
  await base44.asServiceRole.entities.SyncState.update(syncRecord.id, { history_id: currentHistoryId });

  console.log(`[processGmailNewsletters] processed=${processed} created=${created}`);
  return Response.json({ status: 'ok', processed, created });
});