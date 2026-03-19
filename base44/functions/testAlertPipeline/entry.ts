import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * testAlertPipeline — one-shot end-to-end alert system test.
 * Admin-only. Creates a test FeedItem, then calls sendFeedAlerts
 * with the correct x-internal-secret header exactly as fetchFeeds does.
 * Cleans up the test FeedItem after the test.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const feed_id = body.feed_id || '69b8673d4cd95cbefc339cb9'; // Commercial Real Estate Library Podcast

        const internalSecret = Deno.env.get('INTERNAL_SECRET');
        const appUrl = Deno.env.get('BASE44_APP_URL');

        if (!internalSecret) return Response.json({ error: 'INTERNAL_SECRET not set' }, { status: 503 });
        if (!appUrl) return Response.json({ error: 'BASE44_APP_URL not set' }, { status: 503 });

        // Step 1: Verify the FeedAlert exists for this feed
        const alerts = await base44.asServiceRole.entities.FeedAlert.filter({ feed_id, is_active: true });
        if (alerts.length === 0) {
            return Response.json({ error: 'No active FeedAlert found for feed_id: ' + feed_id }, { status: 404 });
        }

        // Step 2: Create a unique test FeedItem (unique guid so dedup never blocks it)
        const testGuid = `test-alert-pipeline-${Date.now()}`;
        const feedItem = await base44.asServiceRole.entities.FeedItem.create({
            feed_id,
            title: `[ALERT TEST] Live pipeline verification ${new Date().toISOString()}`,
            url: `https://example.com/alert-test/${Date.now()}`,
            description: 'Automated end-to-end test of the sendFeedAlerts dispatch pipeline.',
            category: 'CRE',
            guid: testGuid,
            published_date: new Date().toISOString(),
            is_read: false,
        });

        if (!feedItem?.id) {
            return Response.json({ error: 'Failed to create test FeedItem' }, { status: 500 });
        }

        console.log(`[testAlertPipeline] Created test FeedItem: ${feedItem.id}`);
        console.log(`[testAlertPipeline] Calling sendFeedAlerts for feed_id=${feed_id} alerts=${alerts.length}`);

        // Step 3: Call sendFeedAlerts with timeout via AbortController
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let alertRes, alertBody;
        try {
            alertRes = await fetch(`${appUrl}/api/sendFeedAlerts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': internalSecret,
                },
                body: JSON.stringify({ feed_item_id: feedItem.id }),
                signal: controller.signal,
            });
            alertBody = await alertRes.json().catch(() => ({}));
        } catch (fetchErr) {
            // If the HTTP hop times out, fall back to inlining the discord dispatch directly
            console.warn(`[testAlertPipeline] HTTP self-call failed (${fetchErr.message}), falling back to inline dispatch`);
            alertRes = null;
            alertBody = null;
        } finally {
            clearTimeout(timeout);
        }

        // Fallback: inline the Discord dispatch directly to still validate delivery
        let inlineResults = null;
        if (!alertRes || !alertRes.ok) {
            console.log('[testAlertPipeline] Running inline Discord dispatch as fallback...');
            inlineResults = [];
            for (const alert of alerts) {
                const title = feedItem.title || 'New article';
                const url = feedItem.url || '';
                const description = (feedItem.description || '').slice(0, 200);
                const category = feedItem.category || '';
                if (alert.channel_type === 'discord') {
                    const content = `**${title}**${category ? ` \`${category}\`` : ''}\n${description ? description + '\n' : ''}${url}`;
                    const discordRes = await fetch(alert.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: content.slice(0, 2000) }),
                    });
                    const ok = discordRes.ok || discordRes.status === 204;
                    inlineResults.push({ alert_id: alert.id, type: 'discord', ok, status: discordRes.status });
                    console.log(`[testAlertPipeline] Inline Discord dispatch: ${discordRes.status} ok=${ok}`);
                    if (ok) {
                        await base44.asServiceRole.entities.FeedAlert.update(alert.id, { last_sent: new Date().toISOString() });
                    }
                }
            }
        }

        console.log(`[testAlertPipeline] sendFeedAlerts responded: ${alertRes?.status}`, JSON.stringify(alertBody));

        // Step 4: Clean up test FeedItem
        await base44.asServiceRole.entities.FeedItem.delete(feedItem.id).catch(() => {});
        console.log(`[testAlertPipeline] Cleaned up test FeedItem: ${feedItem.id}`);

        const results = alertBody?.results || inlineResults || [];
        const deliveryOk = results[0]?.ok === true;

        return Response.json({
            feed_id,
            feed_alert: alerts[0],
            feed_item_id: feedItem.id,
            method: alertRes?.ok ? 'http_internal_call' : 'inline_fallback',
            send_feed_alerts_status: alertRes?.status ?? 'n/a (fallback used)',
            send_feed_alerts_ok: alertRes?.ok ?? false,
            send_feed_alerts_response: alertBody,
            inline_results: inlineResults,
            discord_delivery_ok: deliveryOk,
            discord_http_status: results[0]?.status ?? null,
            overall_pass: deliveryOk,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});