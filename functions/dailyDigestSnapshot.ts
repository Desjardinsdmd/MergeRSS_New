import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userFeeds = await base44.entities.Feed.filter({ created_by: user.email, status: 'active' });
    const feedIds = userFeeds.map(f => f.id);

    if (feedIds.length === 0) {
      return Response.json({ snapshot: null, reason: 'no_feeds' });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allItems = await base44.entities.FeedItem.list('-published_date', 60);
    const todayItems = allItems.filter(item =>
      feedIds.includes(item.feed_id) && item.published_date >= cutoff
    );

    if (todayItems.length === 0) {
      return Response.json({ snapshot: null, reason: 'no_articles_today' });
    }

    const headlines = todayItems.slice(0, 40).map(i => `- ${i.title}`).join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a sharp news editor. Summarize today's top stories from these headlines into a concise 3-sentence "Today's Brief" for a busy professional. Be direct, informative, and highlight the most important themes.

Headlines from today:
${headlines}

Write exactly 3 sentences. No bullet points, no headers. Just 3 flowing sentences that capture the day's key stories.`,
      add_context_from_internet: false,
      response_json_schema: {
        type: 'object',
        properties: {
          brief: { type: 'string' },
          top_categories: { type: 'array', items: { type: 'string' } },
          article_count: { type: 'number' }
        }
      }
    });

    return Response.json({
      snapshot: {
        brief: result.brief,
        top_categories: result.top_categories || [],
        article_count: todayItems.length,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});