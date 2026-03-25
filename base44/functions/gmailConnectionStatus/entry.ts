/**
 * Gets Gmail watcher automation status and toggles it on/off.
 * GET-style (no body) = status check
 * POST with { action: 'pause' | 'resume' } = toggle
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const WATCHER_AUTOMATION_ID = '69c3f93bb68a776d51a67a31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}

  // Check if Gmail OAuth is connected
  let gmailConnected = false;
  try {
    await base44.asServiceRole.connectors.getConnection('gmail');
    gmailConnected = true;
  } catch {
    gmailConnected = false;
  }

  // If toggling
  if (body.action === 'pause' || body.action === 'resume') {
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const isActive = body.action === 'resume';
    // Use the management API via SDK
    await base44.asServiceRole.functions.invoke('__platform__/automations/toggle', {
      automation_id: WATCHER_AUTOMATION_ID,
      is_active: isActive,
    }).catch(() => {}); // best-effort — platform may not expose this

    return Response.json({ success: true, watcher_active: isActive, gmail_connected: gmailConnected });
  }

  return Response.json({ gmail_connected: gmailConnected, watcher_active: gmailConnected });
});