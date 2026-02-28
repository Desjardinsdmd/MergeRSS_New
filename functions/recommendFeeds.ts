import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get user's current feeds
    const userFeeds = await base44.entities.Feed.filter({ created_by: user.email });
    const userFeedUrls = new Set(userFeeds.map(f => f.url));

    if (userFeeds.length === 0) {
      return Response.json({ recommendations: [], summary: 'Add some feeds first to get personalized recommendations.' });
    }

    // Get all directory feeds NOT already subscribed to
    const directoryFeeds = await base44.asServiceRole.entities.DirectoryFeed.list('-added_count', 50);
    const unseenFeeds = directoryFeeds.filter(f => !userFeedUrls.has(f.url));

    const userProfile = userFeeds.map(f =>
      `${f.name} (${f.category || 'Other'}) - tags: ${(f.tags || []).join(', ')}`
    ).join('\n');

    const candidates = unseenFeeds.slice(0, 30).map(f =>
      `ID:${f.id} | ${f.name} | ${f.category} | ${f.description || ''} | subscribers: ${f.added_count || 0}`
    ).join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a content recommendation engine. Based on this user's current feed subscriptions, recommend the most relevant feeds they are not yet subscribed to.

User's current feeds:
${userProfile}

Available feeds to recommend from (ID | Name | Category | Description | Subscribers):
${candidates}

Select the top 6 best matches based on topic overlap, category similarity, and complementary coverage. For each recommendation explain why it fits their interests.`,
      add_context_from_internet: false,
      response_json_schema: {
        type: 'object',
        properties: {
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                directory_feed_id: { type: 'string' },
                reason: { type: 'string' }
              }
            }
          },
          summary: { type: 'string' }
        }
      }
    });

    // Map recommendations back to full feed data
    const feedMap = Object.fromEntries(unseenFeeds.map(f => [f.id, f]));
    const enriched = (result.recommendations || [])
      .map(r => {
        const feed = feedMap[r.directory_feed_id];
        if (!feed) return null;
        return { ...feed, reason: r.reason };
      })
      .filter(Boolean);

    return Response.json({ recommendations: enriched, summary: result.summary || '' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});