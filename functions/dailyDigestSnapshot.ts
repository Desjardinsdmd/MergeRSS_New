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
    const allItems = await base44.entities.FeedItem.list('-published_date', 100);
    const todayItems = allItems.filter(item =>
      feedIds.includes(item.feed_id) && item.published_date >= cutoff
    );

    if (todayItems.length === 0) {
      return Response.json({ snapshot: null, reason: 'no_articles_today' });
    }

    // Group by category
    const byCategory = {};
    todayItems.forEach(item => {
      const cat = item.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    });

    // Helper to pick top related articles for a set of items
    const topArticles = (items, n = 5) =>
      items.slice(0, n).map(i => ({ title: i.title, url: i.url }));

    // Generate overall brief
    const allHeadlines = todayItems.slice(0, 40).map(i => `[${i.title}]`).join('\n');
    const overallResult = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a sharp news editor. Summarize today's top stories from these headlines into a concise 3-sentence "Today's Brief" for a busy professional. Be direct, informative, and highlight the most important themes.

Headlines from today:
${allHeadlines}

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

    // Generate per-category briefs (only for categories with enough articles)
    const categories = Object.keys(byCategory).filter(cat => byCategory[cat].length >= 2);
    const categoryBriefs = {};

    await Promise.all(categories.map(async (cat) => {
      const items = byCategory[cat];
      const headlines = items.slice(0, 20).map(i => `- ${i.title}`).join('\n');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a sharp news editor covering the ${cat} sector. Summarize today's top ${cat} stories from these headlines into a concise 2-3 sentence brief for a busy professional. Be direct and specific.

Headlines:
${headlines}

Write 2-3 sentences max. No bullet points, no headers. Just flowing sentences about today's ${cat} news.`,
        add_context_from_internet: false,
        response_json_schema: {
          type: 'object',
          properties: {
            brief: { type: 'string' }
          }
        }
      });
      categoryBriefs[cat] = {
        brief: res.brief,
        article_count: items.length,
        related_articles: topArticles(items, 5),
      };
    }));

    return Response.json({
      snapshot: {
        brief: overallResult.brief,
        top_categories: Object.keys(byCategory),
        article_count: todayItems.length,
        generated_at: new Date().toISOString(),
        category_briefs: categoryBriefs,
        related_articles: topArticles(todayItems, 6),
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});