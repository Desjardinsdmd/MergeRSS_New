import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const validateFeedUrl = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0; +https://mergerss.com)' }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return false;
    const content = await response.text();
    return (content.includes('<rss') || content.includes('<feed') || content.includes('<?xml')) && content.length > 100;
  } catch (e) {
    return false;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { query, category = 'Other', dry_run = false } = await req.json();

    if (!query) {
      return Response.json({ error: 'query is required' }, { status: 400 });
    }

    const feedSchema = {
      type: "object",
      properties: {
        feeds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string" },
              description: { type: "string" },
              tags: { type: "array", items: { type: "string" } }
            },
            required: ["name", "url"]
          }
        }
      }
    };

    const makePrompt = (q, angle) =>
      `Search the internet and find real, active RSS/Atom feeds related to: "${q}". Focus on ${angle}.
For each feed provide: name, url (must be a direct feed URL ending in /feed, /rss, .xml, /atom, etc — NOT a homepage), description (one sentence), tags (2-4 keywords).
Return up to 20 feeds. Only include feeds you are highly confident exist and are active in 2024-2025. Do NOT invent URLs.`;

    // Run 3 parallel searches with different angles for broader coverage
    const [r1, r2, r3] = await Promise.all([
      base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: makePrompt(query, 'major publishers, mainstream media outlets, and well-known news sources'),
        add_context_from_internet: true,
        response_json_schema: feedSchema
      }),
      base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: makePrompt(query, 'popular independent blogs, newsletters with RSS feeds, and niche expert sites'),
        add_context_from_internet: true,
        response_json_schema: feedSchema
      }),
      base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: makePrompt(query, 'official organizational feeds, trade publications, industry journals, and authoritative sources'),
        add_context_from_internet: true,
        response_json_schema: feedSchema
      }),
    ]);

    // Merge and deduplicate by URL
    const allRaw = [
      ...(r1?.feeds || []),
      ...(r2?.feeds || []),
      ...(r3?.feeds || []),
    ];
    const seenUrls = new Set();
    const discoveredFeeds = allRaw.filter(f => {
      if (!f.url) return false;
      const norm = f.url.toLowerCase().trim();
      if (seenUrls.has(norm)) return false;
      seenUrls.add(norm);
      return true;
    });

    // Get existing directory feeds to avoid duplicates
    const existing = await base44.asServiceRole.entities.DirectoryFeed.list();
    const existingUrls = new Set(existing.map(f => f.url.toLowerCase().trim()));

    // Validate URLs in batches of 5
    const validated = [];
    const skipped = [];
    const failed = [];

    const batchSize = 5;
    for (let i = 0; i < discoveredFeeds.length; i += batchSize) {
      const batch = discoveredFeeds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (feed) => {
          if (!feed.url || !feed.url.startsWith('http')) {
            return { feed, status: 'invalid_url' };
          }
          const normalizedUrl = feed.url.toLowerCase().trim();
          if (existingUrls.has(normalizedUrl)) {
            return { feed, status: 'duplicate' };
          }
          const isValid = await validateFeedUrl(feed.url);
          return { feed, status: isValid ? 'valid' : 'unreachable' };
        })
      );

      for (const { feed, status } of results) {
        if (status === 'valid') {
          validated.push(feed);
        } else if (status === 'duplicate') {
          skipped.push({ ...feed, reason: 'Already in directory' });
        } else {
          failed.push({ ...feed, reason: status === 'invalid_url' ? 'Invalid URL format' : 'Feed URL not reachable' });
        }
      }
    }

    // Add validated feeds to directory (unless dry_run)
    let added = 0;
    if (!dry_run) {
      for (const feed of validated) {
        await base44.asServiceRole.entities.DirectoryFeed.create({
          name: feed.name,
          url: feed.url,
          description: feed.description || '',
          category,
          tags: feed.tags || [],
        });
        added++;
        existingUrls.add(feed.url.toLowerCase().trim());
      }
    }

    return Response.json({
      query,
      category,
      dry_run,
      discovered: discoveredFeeds.length,
      validated: validated.length,
      added,
      skipped: skipped.length,
      failed: failed.length,
      validated_feeds: validated,
      skipped_feeds: skipped,
      failed_feeds: failed
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});