import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has an email feed
    const existingFeeds = await base44.entities.EmailFeed.filter({ user_email: user.email });
    if (existingFeeds.length > 0) {
      return Response.json({ 
        email_feed: existingFeeds[0],
        message: 'Email feed already exists'
      });
    }

    // Generate unique email address using user ID hash
    const uniquePart = btoa(user.email).slice(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    const uniqueEmail = `newsletter-${uniquePart}@${mailgunDomain}`;

    // Create EmailFeed record
    const emailFeed = await base44.entities.EmailFeed.create({
      user_email: user.email,
      unique_email: uniqueEmail,
      is_active: true,
      total_received: 0
    });

    return Response.json({ 
      success: true,
      email_feed: emailFeed
    });
  } catch (error) {
    console.error('initEmailFeed error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});