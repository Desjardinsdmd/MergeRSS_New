import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function verifyMailgunSignature(token, timestamp, signature) {
  const apiKey = Deno.env.get('MAILGUN_API_KEY');
  if (!apiKey) return false;
  const value = timestamp + token;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

let base44;

// Parse email body and extract links/content
function extractArticles(htmlContent, textContent) {
  const articles = [];
  
  // Try to extract from HTML first
  if (htmlContent) {
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      if (url.startsWith('http') && title.length > 0) {
        articles.push({ url, title });
      }
    }
  }

  // Fallback to text content if no articles found
  if (articles.length === 0 && textContent) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    let match;
    while ((match = urlRegex.exec(textContent)) !== null) {
      articles.push({ url: match[0], title: match[0] });
    }
  }

  return articles.slice(0, 20); // Limit to 20 articles per email
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    base44 = createClientFromRequest(req);
    const formData = await req.formData();
    const recipient = formData.get('recipient');
    const sender = formData.get('sender');
    const senderName = formData.get('from') || sender;
    const subject = formData.get('subject') || 'Untitled';
    const htmlContent = formData.get('html-body') || '';
    const textContent = formData.get('text-body') || '';

    if (!recipient || !sender) {
      return Response.json({ error: 'Missing recipient or sender' }, { status: 400 });
    }

    // Find the EmailFeed by unique email
    const emailFeeds = await base44.asServiceRole.entities.EmailFeed.filter({
      unique_email: recipient
    });

    if (emailFeeds.length === 0) {
      return Response.json({ error: 'Email feed not found' }, { status: 404 });
    }

    const emailFeed = emailFeeds[0];
    const articles = extractArticles(htmlContent, textContent);

    if (articles.length === 0) {
      // Email received but no articles extracted
      await base44.asServiceRole.entities.EmailFeed.update(emailFeed.id, {
        total_received: (emailFeed.total_received || 0) + 1,
        last_email_date: new Date().toISOString()
      });
      return Response.json({ success: true, articles_found: 0 });
    }

    // Find or create newsletter subscription
    let subscription = (await base44.asServiceRole.entities.NewsletterSubscription.filter({
      email_feed_id: emailFeed.id,
      from_email: sender
    }))[0];

    if (!subscription) {
      subscription = await base44.asServiceRole.entities.NewsletterSubscription.create({
        email_feed_id: emailFeed.id,
        from_email: sender,
        from_name: senderName,
        newsletter_name: senderName.split('@')[0] || senderName,
        subscribed_date: new Date().toISOString(),
        email_count: 1,
        last_email_date: new Date().toISOString(),
        is_active: true
      });
    } else {
      // Update subscription stats
      await base44.asServiceRole.entities.NewsletterSubscription.update(subscription.id, {
        email_count: (subscription.email_count || 0) + 1,
        last_email_date: new Date().toISOString()
      });
    }

    // Create feed items for each article
    const feedItems = [];
    for (const article of articles) {
      try {
        const item = await base44.asServiceRole.entities.FeedItem.create({
          feed_id: emailFeed.id,
          title: article.title,
          url: article.url,
          description: `From: ${senderName} - ${subject}`,
          content: '',
          author: senderName,
          published_date: new Date().toISOString(),
          category: 'Email',
          is_read: false
        });
        feedItems.push(item);
      } catch (e) {
        console.error('Error creating feed item:', e);
      }
    }

    // Update email feed stats
    await base44.asServiceRole.entities.EmailFeed.update(emailFeed.id, {
      total_received: (emailFeed.total_received || 0) + 1,
      last_email_date: new Date().toISOString()
    });

    return Response.json({ 
      success: true,
      articles_found: feedItems.length,
      newsletter: subscription.newsletter_name
    });
  } catch (error) {
    console.error('mailgunWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});