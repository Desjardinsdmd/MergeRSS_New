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
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const webhookUrl = `${Deno.env.get('BASE44_APP_URL')}/api/functions/mailgunWebhook`;
    
    console.log('initEmailFeed started for:', user.email);
    console.log('Mailgun domain:', mailgunDomain);
    console.log('Webhook URL:', webhookUrl);

    if (!mailgunDomain || !mailgunApiKey) {
      return Response.json({ error: 'Mailgun credentials missing' }, { status: 500 });
    }

    const uniquePart = btoa(user.email).slice(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
    const uniqueEmail = `newsletter-${uniquePart}@${mailgunDomain}`;

    console.log('Unique email:', uniqueEmail);

    // Try to create Mailgun route with timeout
    let mailgunRouteId = null;
    try {
      const routeData = new FormData();
      routeData.append('priority', '10');
      routeData.append('description', `Newsletter feed for ${user.email}`);
      routeData.append('expression', `match_recipient("${uniqueEmail}")`);
      routeData.append('action', `store(notify="${webhookUrl}")`);

      console.log('Sending route creation request to Mailgun...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const routeResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/routes`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`
        },
        body: routeData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (routeResponse.ok) {
        const routeData2 = await routeResponse.json();
        mailgunRouteId = routeData2.route?.id;
        console.log('✅ Mailgun route created:', mailgunRouteId);
      } else {
        const errorText = await routeResponse.text();
        console.error('❌ Mailgun route creation failed');
        console.error('Status:', routeResponse.status);
        console.error('Response:', errorText);
      }
    } catch (err) {
      console.error('Mailgun route creation error:', err.message);
    }

    // Create or update EmailFeed record
    if (existingFeeds.length > 0) {
      console.log('Updating existing email feed');
      await base44.entities.EmailFeed.update(existingFeeds[0].id, {
        mailgun_route_id: mailgunRouteId
      });
      return Response.json({ 
        email_feed: existingFeeds[0],
        message: 'Email feed updated'
      });
    }

    console.log('Creating new email feed');
    const emailFeed = await base44.entities.EmailFeed.create({
      user_email: user.email,
      unique_email: uniqueEmail,
      is_active: true,
      total_received: 0,
      mailgun_route_id: mailgunRouteId
    });

    return Response.json({ 
      success: true,
      email_feed: emailFeed,
      message: 'Email feed created'
    });
  } catch (error) {
    console.error('initEmailFeed error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});