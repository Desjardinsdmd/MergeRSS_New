import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { digest_name, webhook_url } = await req.json();

        let url = webhook_url;
        let digest = null;

        if (digest_name) {
            const digests = await base44.entities.Digest.filter({ name: digest_name });
            if (!digests || digests.length === 0) {
                return Response.json({ error: `Digest "${digest_name}" not found` }, { status: 404 });
            }
            // Ownership check — prevent IDOR
            if (digests[0].created_by !== user.email) {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
            digest = digests[0];
            if (!url) {
                url = digest.discord_webhook_url;
                if (!url) {
                    return Response.json({ error: `Digest "${digest_name}" has no Discord webhook configured` }, { status: 400 });
                }
            }
        }

        if (!url) return Response.json({ error: 'webhook_url or digest_name required' }, { status: 400 });

        let content = `✅ **MergeRSS Test Message**\nYour Discord integration is working correctly! Digests will be delivered here.`;

        // Only include article content from feed items the authenticated user owns
        if (digest) {
            let recentItems = [];

            if (digest.feed_ids?.length > 0) {
                // Fetch items only from this digest's configured feeds (user-scoped)
                recentItems = await base44.entities.FeedItem.filter(
                    { feed_id: { $in: digest.feed_ids } },
                    '-published_date',
                    10
                );
            } else {
                // Fall back to the user's own feeds
                const userFeeds = await base44.entities.Feed.filter({ created_by: user.email, status: 'active' });
                const feedIds = userFeeds.map(f => f.id);
                if (feedIds.length > 0) {
                    recentItems = await base44.entities.FeedItem.filter(
                        { feed_id: { $in: feedIds } },
                        '-published_date',
                        10
                    );
                }
            }

            if (recentItems.length > 0) {
                let itemList = '';
                for (const item of recentItems) {
                    const itemText = `• **${item.title}**\n${item.url || ''}`;
                    if ((itemList + itemText).length > 1800) break;
                    itemList += (itemList ? '\n\n' : '') + itemText;
                }
                content = `📰 **${digest.name} - Test Digest**\n\n${itemList}`.substring(0, 2000);
            }
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
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