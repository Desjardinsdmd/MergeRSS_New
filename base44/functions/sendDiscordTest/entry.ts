import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';


// Strict webhook host check: parse the URL, https only, exact host or subdomain.
// (A substring check let "https://attacker.example/?hooks.slack.com" through.)
function isAllowedWebhook(url, hosts) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        return hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    } catch { return false; }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { digest_name, webhook_url } = await req.json();

        let url = webhook_url;
        let digest = null;

        if (digest_name) {
            // Filter by both name and owner to avoid fragile first-match behavior
            // when multiple users share the same digest name
            const digests = await base44.entities.Digest.filter({ name: digest_name, created_by: user.email });
            if (!digests || digests.length === 0) {
                return Response.json({ error: `Digest "${digest_name}" not found` }, { status: 404 });
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
        if (!isAllowedWebhook(url, ['discord.com', 'discordapp.com'])) {
            return Response.json({ error: 'Invalid Discord webhook URL' }, { status: 400 });
        }

        let content = `✅ **MergeRSS Test Message**\nYour Discord integration is working correctly! Digests will be delivered here.`;

        // Only include article content from feed items the authenticated user owns
        if (digest) {
            let recentItems = [];

            // Articles are admin-only at the entity level; read via service role but only
            // from feeds this user owns (a digest's feed_ids are user-editable, so intersect).
            const ownIds = new Set((await base44.entities.Feed.filter({ created_by: user.email })).map(f => f.id));
            const digestFeedIds = (digest.feed_ids || []).filter(id => ownIds.has(id));
            if (digestFeedIds.length > 0) {
                recentItems = await base44.asServiceRole.entities.FeedItem.filter(
                    { feed_id: { $in: digestFeedIds } },
                    '-published_date',
                    10
                );
            } else {
                // Fall back to the user's own feeds
                const userFeeds = await base44.entities.Feed.filter({ created_by: user.email, status: 'active' });
                const feedIds = userFeeds.map(f => f.id);
                if (feedIds.length > 0) {
                    recentItems = await base44.asServiceRole.entities.FeedItem.filter(
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
            return Response.json({ error: `Discord returned HTTP ${res.status}` }, { status: 400 });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});