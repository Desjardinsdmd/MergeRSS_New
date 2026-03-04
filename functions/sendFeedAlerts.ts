import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { feed_item_id } = body;

        if (!feed_item_id) {
            return Response.json({ error: 'feed_item_id required' }, { status: 400 });
        }

        // Get the feed item
        const allItems = await base44.asServiceRole.entities.FeedItem.list('-created_date', 200);
        const feedItem = allItems.find(i => i.id === feed_item_id);
        if (!feedItem) {
            return Response.json({ error: 'Feed item not found' }, { status: 404 });
        }

        // Get active alerts for this feed
        const allAlerts = await base44.asServiceRole.entities.FeedAlert.list();
        const alerts = allAlerts.filter(a => a.feed_id === feedItem.feed_id && a.is_active !== false);

        if (alerts.length === 0) {
            return Response.json({ success: true, sent: 0 });
        }

        const results = [];

        for (const alert of alerts) {
            const title = feedItem.title || 'New article';
            const url = feedItem.url || '';
            const description = (feedItem.description || '').slice(0, 200);
            const category = feedItem.category || '';

            if (alert.channel_type === 'slack') {
                const text = `*${title}*${category ? ` [${category}]` : ''}\n${description ? description + '\n' : ''}<${url}|Read more>`;
                const res = await fetch(alert.webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, mrkdwn: true }),
                });
                results.push({ alert_id: alert.id, type: 'slack', ok: res.ok, status: res.status });
            } else if (alert.channel_type === 'discord') {
                const content = `**${title}**${category ? ` \`${category}\`` : ''}\n${description ? description + '\n' : ''}${url}`;
                const res = await fetch(alert.webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: content.slice(0, 2000) }),
                });
                const ok = res.ok || res.status === 204;
                results.push({ alert_id: alert.id, type: 'discord', ok, status: res.status });
            }

            await base44.asServiceRole.entities.FeedAlert.update(alert.id, {
                last_sent: new Date().toISOString(),
            });
        }

        return Response.json({ success: true, sent: results.length, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});