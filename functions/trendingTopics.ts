import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get recent feed items for this user's feeds (last 48 hours)
    const userFeeds = await base44.entities.Feed.filter({ created_by: user.email, status: 'active' });
    const feedIds = userFeeds.map(f => f.id);

    if (feedIds.length === 0) return Response.json({ topics: [], summary: 'No active feeds found.' });

    // Fetch recent items across all feeds
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const allItems = await base44.entities.FeedItem.list('-published_date', 100);
    const recentItems = allItems.filter(item =>
      feedIds.includes(item.feed_id) &&
      item.published_date >= cutoff
    );

    if (recentItems.length === 0) {
      return Response.json({ topics: [], summary: 'No recent articles in the last 48 hours.' });
    }

    const headlines = recentItems.slice(0, 80).map(i => i.title).join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze these recent article headlines from an RSS feed reader and identify the top trending topics.

Headlines:
${headlines}

Identify 5-8 distinct trending topics. For each topic:
- A short topic name (2-4 words)
- A brief description (1 sentence) of what's trending
- Approximate article count covering it
- A category: CRE, Markets, Tech, News, Finance, Crypto, AI, or Other
- 2-3 relevant keywords`,
      add_context_from_internet: false,
      response_json_schema: {
        type: 'object',
        properties: {
          topics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                article_count: { type: 'number' },
                category: { type: 'string' },
                keywords: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          summary: { type: 'string' }
        }
      }
    });

    return Response.json({ topics: result.topics || [], summary: result.summary || '', article_count: recentItems.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});