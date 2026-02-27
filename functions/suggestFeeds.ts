import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const testFeedUrl = async (url) => {
  try {
    const res = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml'
      },
      redirect: 'follow'
    });
    if (!res.ok) return false;
    const content = await res.text();
    // Check if it's valid RSS/Atom/XML feed
    return (content.includes('<rss') || content.includes('<feed') || content.includes('<?xml')) && 
           (content.includes('<item') || content.includes('<entry'));
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { query, existingCategories } = await req.json();

    // Use InvokeLLM with web search to find relevant RSS feeds
    const prompt = `You are an RSS feed discovery expert. A user is looking for RSS feeds.

User query: "${query || ''}"
${existingCategories?.length ? `User's existing feed categories: ${existingCategories.join(', ')}` : ''}

Search the web and find 6-10 highly relevant, real, active RSS feed URLs that match this query. For each feed, provide:
- A clear display name
- The actual RSS/Atom feed URL (must be a real, working RSS feed URL ending in .rss, .xml, /feed, /rss, etc.)
- A brief description (1-2 sentences) explaining the content
- A relevance score from 1-10 explaining why it matches the query
- The best category from: CRE, Markets, Tech, News, Finance, Crypto, AI, Other
- 2-4 relevant tags

Return ONLY real, working RSS feed URLs. Do not make up URLs. Search for actual RSS feeds from reputable sources.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          feeds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                url: { type: 'string' },
                description: { type: 'string' },
                relevance_score: { type: 'number' },
                relevance_reason: { type: 'string' },
                category: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          summary: { type: 'string' }
        }
      }
    });

    // Test each feed and filter out broken ones
    const testedFeeds = [];
    for (const feed of result.feeds || []) {
      const isValid = await testFeedUrl(feed.url);
      if (isValid) {
        testedFeeds.push(feed);
        
        // Check if this feed already exists in directory
        const existing = await base44.asServiceRole.entities.DirectoryFeed.filter({ url: feed.url });
        if (existing.length === 0) {
          // Add to directory automatically
          await base44.asServiceRole.entities.DirectoryFeed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || 'Other',
            tags: feed.tags || [],
            description: feed.description,
          });
        }
      }
    }

    return Response.json({ ...result, feeds: testedFeeds });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});