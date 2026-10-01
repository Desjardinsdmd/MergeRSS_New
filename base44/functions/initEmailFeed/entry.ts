import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * initEmailFeed — legacy entry point, kept for older callers.
 *
 * Address provisioning now lives in newsletterInbox (action 'get_or_create'), which uses one
 * Mailgun catch-all route for the whole domain instead of a route per user and replaces the old
 * guessable newsletter-<base64(email)> addresses. This function just delegates to it as the caller.
 *
 * Returns the newsletterInbox state plus `email_feed: { unique_email }` for backwards compatibility.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const res = await base44.functions.invoke('newsletterInbox', { action: 'get_or_create' });
    const data = res?.data || {};
    if (data.configured === false) {
      return Response.json({ configured: false, reason: data.reason || 'newsletter inbox not configured' });
    }
    return Response.json({
      ...data,
      email_feed: data.address ? { user_email: user.email, unique_email: data.address, is_active: true } : null,
      message: data.address ? 'Newsletter inbox ready' : 'Newsletter inbox unavailable',
    });
  } catch (error) {
    const msg = error?.response?.data?.error || error?.message || 'Server error';
    console.error('initEmailFeed error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
});
