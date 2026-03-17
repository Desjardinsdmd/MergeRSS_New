import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    // Try last 48h, fall back to last 7 days so the brief always generates
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const cutoff7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Group feeds by category for even cross-category distribution
    const feedsByCategory = {};
    userFeeds.forEach(f => {
      const cat = f.category || 'Other';
      if (!feedsByCategory[cat]) feedsByCategory[cat] = [];
      feedsByCategory[cat].push(f);
    });

    const categories = Object.keys(feedsByCategory);
    const TARGET_TOTAL = 200;
    const perCategoryTarget = Math.ceil(TARGET_TOTAL / categories.length);

    // Fetch items per feed sequentially in small batches to avoid rate limits
    async function fetchInBatches(feeds, limitPerFeed, batchSize = 4) {
      const results = [];
      for (let i = 0; i < feeds.length; i += batchSize) {
        const batch = feeds.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(f => base44.entities.FeedItem.filter({ feed_id: f.id }, '-published_date', limitPerFeed))
        );
        for (const r of batchResults) {
          if (r.status === 'fulfilled') results.push(...(r.value || []));
        }
      }
      return results;
    }

    // Fetch items per category using batched queries
    const perCategoryItems = {};
    for (const cat of categories) {
      const feeds = feedsByCategory[cat];
      const perFeedLimit = Math.max(5, Math.ceil(perCategoryTarget / feeds.length));
      perCategoryItems[cat] = await fetchInBatches(feeds, perFeedLimit);
    }

    // If some categories have fewer items than target, the total may be under TARGET_TOTAL — that's fine.
    // Merge all items
    const allItems = Object.values(perCategoryItems).flat();

    let todayItems = allItems.filter(item => item.published_date >= cutoff48h);

    // Widen window if not enough articles
    if (todayItems.length < 3) {
      todayItems = allItems.filter(item => item.published_date >= cutoff7d);
    }

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

    // Helper to pick top related articles for a set of items (with full data for UI rendering)
    const topArticles = (items, n = 5) =>
      items.slice(0, n).map(i => ({ 
        title: i.title, 
        url: i.url,
        description: i.description,
        content: i.content,
        published_date: i.published_date,
        category: i.category
      }));

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
    const briefCategories = Object.keys(byCategory).filter(cat => byCategory[cat].length >= 1);
    const categoryBriefs = {};

    for (const cat of briefCategories) {
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
    }

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