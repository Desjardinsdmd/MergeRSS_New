import sys

def rep(path, old, new, count=1):
    s = open(path).read()
    n = s.count(old)
    if n != count:
        print(f'FAIL {path}: expected {count} match(es), found {n}: {old[:60]!r}'); sys.exit(1)
    open(path, 'w').write(s.replace(old, new))
    print('ok', path)

HOSTCHECK = '''
// Strict webhook host check: parse the URL, https only, exact host or subdomain.
// (A substring check let "https://attacker.example/?hooks.slack.com" through.)
function isAllowedWebhook(url, hosts) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        return hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    } catch { return false; }
}
'''

# 1. fetchFeeds: alerts only fire for the feed's own owner, to allowed hosts
rep('base44/functions/fetchFeeds/entry.ts',
"""        const allAlerts = extractItems(await base44.asServiceRole.entities.FeedAlert.filter({ is_active: true }));
        for (const alert of allAlerts) {""",
"""        const allAlerts = extractItems(await base44.asServiceRole.entities.FeedAlert.filter({ is_active: true }));
        // Tenant guard (2026-09-25): FeedAlert create is open, so a user could point an alert at
        // someone else's feed_id and have new items POSTed to their own webhook. Only honour
        // alerts created by the feed's owner, sent to real Slack/Discord hosts.
        const feedOwner = Object.fromEntries(allFeeds.map(f => [f.id, f.created_by]));
        const hostsFor = { slack: ['hooks.slack.com'], discord: ['discord.com', 'discordapp.com'] };
        for (const alert of allAlerts) {
            if (!feedOwner[alert.feed_id] || feedOwner[alert.feed_id] !== alert.created_by) continue;
            const hosts = hostsFor[alert.channel_type] || [];
            let okHost = false;
            try { const u = new URL(alert.webhook_url); okHost = u.protocol === 'https:' && hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { okHost = false; }
            if (!okHost) continue;""")

# 2. generateDigests: only the digest owner's feeds, even if feed_ids lists others
p = 'base44/functions/generateDigests/entry.ts'
rep(p,
"""                // Gather feed items scoped to digest owner
                let allItems = [];
                if (digest.feed_ids?.length > 0) {
                    allItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                        feed_id: { $in: digest.feed_ids },""",
"""                // Gather feed items scoped to digest owner. digest.feed_ids is user-editable, so it is
                // intersected with feeds the owner actually has (tenant guard, 2026-09-25).
                const ownerFeedIdSet = new Set(extractItems(await base44.asServiceRole.entities.Feed.filter({ created_by: digest.created_by })).map(f => f.id));
                const scopedFeedIds = (digest.feed_ids || []).filter(id => ownerFeedIdSet.has(id));
                let allItems = [];
                if (digest.feed_ids?.length > 0) {
                    allItems = scopedFeedIds.length === 0 ? [] : extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                        feed_id: { $in: scopedFeedIds },""")
rep(p,
"""                    if (digest.feed_ids?.length > 0) {
                        fallbackItems = extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                            feed_id: { $in: digest.feed_ids }
                        }, '-published_date', 50));""",
"""                    if (digest.feed_ids?.length > 0) {
                        fallbackItems = scopedFeedIds.length === 0 ? [] : extractItems(await base44.asServiceRole.entities.FeedItem.filter({
                            feed_id: { $in: scopedFeedIds }
                        }, '-published_date', 50));""")

# 3. sendSlackMessage: strict host, no upstream body echo
p = 'base44/functions/sendSlackMessage/entry.ts'
rep(p, "Deno.serve(async (req) => {", HOSTCHECK + "\nDeno.serve(async (req) => {")
rep(p, "if (!webhook_url || !webhook_url.includes('hooks.slack.com')) {",
       "if (!webhook_url || !isAllowedWebhook(webhook_url, ['hooks.slack.com'])) {")
rep(p, """            const errText = await res.text();
            return Response.json({ success: false, error: errText }, { status: 200 });""",
       """            // Never echo the upstream body back to the caller.
            return Response.json({ success: false, error: `Slack returned HTTP ${res.status}` }, { status: 200 });""")

# 4. sendDiscordTest: strict host on both supplied and stored URL, no echo
p = 'base44/functions/sendDiscordTest/entry.ts'
rep(p, "Deno.serve(async (req) => {", HOSTCHECK + "\nDeno.serve(async (req) => {")
rep(p, "        if (!url) return Response.json({ error: 'webhook_url or digest_name required' }, { status: 400 });",
       """        if (!url) return Response.json({ error: 'webhook_url or digest_name required' }, { status: 400 });
        if (!isAllowedWebhook(url, ['discord.com', 'discordapp.com'])) {
            return Response.json({ error: 'Invalid Discord webhook URL' }, { status: 400 });
        }""")
rep(p, """            const text = await res.text();
            return Response.json({ error: `Discord returned ${res.status}: ${text}` }, { status: 400 });""",
       """            return Response.json({ error: `Discord returned HTTP ${res.status}` }, { status: 400 });""")

# 5. visualIntelligence: paid image generation is admin-only (publication tooling)
rep('base44/functions/visualIntelligence/entry.ts',
"""    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });""",
"""    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Admin-only (2026-09-25): paid image generation with caller-controlled input and no
    // rate limit let any account spend the app's image budget.
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });""")

# 6. suggestFeeds: only admins auto-publish suggestions into the public directory
rep('base44/functions/suggestFeeds/entry.ts',
"""        const existing = await base44.asServiceRole.entities.DirectoryFeed.filter({ url: feed.url });
        if (existing.length === 0) {""",
"""        // Only admins' searches add to the public directory; a regular user's LLM-steered
        // query could otherwise publish unvetted feeds there (2026-09-25).
        const existing = user.role === 'admin'
          ? await base44.asServiceRole.entities.DirectoryFeed.filter({ url: feed.url })
          : [{ skip: true }];
        if (existing.length === 0) {""")
