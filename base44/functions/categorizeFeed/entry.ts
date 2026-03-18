import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { event, data } = await req.json();

    // Only process newly created feeds that have no category or 'Other'
    if (event?.type !== 'create') return Response.json({ ok: true });

    const feed = data;
    if (!feed || (feed.category && feed.category !== 'Other')) {
      return Response.json({ ok: true, reason: 'already categorized' });
    }

    // Fetch a few items from the feed to understand content
    let contentSample = `Feed name: ${feed.name}\nFeed URL: ${feed.url}`;
    try {
      const items = await base44.asServiceRole.entities.FeedItem.filter({ feed_id: feed.id }, '-created_date', 5);
      if (items.length > 0) {
        contentSample += '\n\nSample articles:\n' + items.map(i => `- ${i.title}: ${i.description || ''}`).join('\n');
      }
    } catch {}

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this RSS feed and assign the best category from this exact list: CRE, Markets, Tech, News, Finance, Crypto, AI, Other.

${contentSample}

Rules:
- CRE = Commercial Real Estate
- Markets = Stock markets, equities, trading
- Tech = Technology, software, startups
- News = General news, politics, world events
- Finance = Banking, lending, personal finance
- Crypto = Cryptocurrency, blockchain, DeFi
- AI = Artificial intelligence, machine learning
- Other = Anything that doesn't fit above

Respond with ONLY the category name, nothing else.`,
      add_context_from_internet: false,
    });

    const category = String(result).trim().replace(/[^a-zA-Z]/g, '');
    const validCategories = ['CRE', 'Markets', 'Tech', 'News', 'Finance', 'Crypto', 'AI', 'Other'];
    const finalCategory = validCategories.includes(category) ? category : 'Other';

    if (finalCategory !== (feed.category || 'Other')) {
      await base44.asServiceRole.entities.Feed.update(feed.id, { category: finalCategory });
    }

    return Response.json({ ok: true, category: finalCategory });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});