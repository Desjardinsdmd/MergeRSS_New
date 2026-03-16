import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { feed_item_id } = body;

        if (!feed_item_id) {
            return Response.json({ error: 'feed_item_id required' }, { status: 400 });
        }

        // Get the feed item by ID directly
        const feedItems = await base44.asServiceRole.entities.FeedItem.filter({ id: feed_item_id }, '-created_date', 1);
        const feedItem = feedItems[0];
        if (!feedItem) {
            return Response.json({ error: 'Feed item not found' }, { status: 404 });
        }

        // Get active alerts for this feed
        const alerts = await base44.asServiceRole.entities.FeedAlert.filter({ feed_id: feedItem.feed_id, is_active: true });

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