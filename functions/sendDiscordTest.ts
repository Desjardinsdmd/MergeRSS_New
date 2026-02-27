import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { digest_name, webhook_url } = await req.json();

        let url = webhook_url;
        if (!url && digest_name) {
            const digest = await base44.entities.Digest.filter({ name: digest_name });
            if (!digest || digest.length === 0) {
                return Response.json({ error: `Digest "${digest_name}" not found` }, { status: 404 });
            }
            url = digest[0].discord_webhook_url;
            if (!url) {
                return Response.json({ error: `Digest "${digest_name}" has no Discord webhook configured` }, { status: 400 });
            }
        }

        if (!url) return Response.json({ error: 'webhook_url or digest_name required' }, { status: 400 });

        let digest = null;
        if (digest_name) {
            const digests = await base44.entities.Digest.filter({ name: digest_name });
            digest = digests && digests.length > 0 ? digests[0] : null;
        }

        let content = `✅ **MergeRSS Test Message**\nYour Discord integration is working correctly! Digests will be delivered here.`;

        if (digest) {
            const recentItems = await base44.asServiceRole.entities.FeedItem.list('-published_date', 10);
            if (recentItems.length > 0) {
                const itemList = recentItems.slice(0, 5).map(item => `• **${item.title}**\n${item.url}`).join('\n\n');
                content = `📰 **${digest.name} - Test Digest**\n\n${itemList}`;
            }
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            return Response.json({ error: `Discord returned ${res.status}: ${text}` }, { status: 400 });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});