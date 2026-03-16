import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CATEGORY_MAP = {
  'Technology': 'Tech', 'Science': 'Tech', 'Programming': 'Tech', 'Coding': 'Tech',
  'Business': 'Finance', 'Economy': 'Finance', 'Finance': 'Finance', 'Startups': 'Finance',
  'World News': 'News', 'News': 'News', 'US News': 'News', 'Politics': 'News',
  'Markets': 'Markets', 'Investing': 'Markets', 'Stocks': 'Markets',
  'Cryptocurrency': 'Crypto', 'Crypto': 'Crypto', 'Bitcoin': 'Crypto',
  'Artificial Intelligence': 'AI', 'Machine Learning': 'AI', 'AI': 'AI',
  'Real Estate': 'CRE', 'CRE': 'CRE',
};

function mapCategory(raw) {
  if (!raw) return 'Other';
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'Other';
}

function parseOpml(xmlText) {
  const feeds = [];

  // Handle nested outlines (grouped by category)
  const categoryBlockRegex = /<outline[^>]+text="([^"]+)"[^>]*>([\s\S]*?)<\/outline>/g;
  let catMatch;
  let found = false;

  while ((catMatch = categoryBlockRegex.exec(xmlText)) !== null) {
    const rawCategory = catMatch[1];
    const block = catMatch[2];
    const category = mapCategory(rawCategory);

    const feedRegex = /<outline[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*text="([^"]*)"[^>]*\/?>/gi;
    const feedRegex2 = /<outline[^>]*text="([^"]*)"[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*\/?>/gi;

    let m;
    while ((m = feedRegex.exec(block)) !== null) {
      feeds.push({ url: m[2], name: m[3] || m[2], category, rawCategory });
      found = true;
    }
    while ((m = feedRegex2.exec(block)) !== null) {
      feeds.push({ url: m[3], name: m[1] || m[3], category, rawCategory });
      found = true;
    }
  }

  // Flat OPML (no categories)
  if (!found) {
    const flatRegex = /<outline[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*text="([^"]*)"[^>]*\/?>/gi;
    const flatRegex2 = /<outline[^>]*text="([^"]*)"[^>]*(xmlUrl|xmlurl)="([^"]+)"[^>]*\/?>/gi;
    let m;
    while ((m = flatRegex.exec(xmlText)) !== null) {
      feeds.push({ url: m[2], name: m[3] || m[2], category: 'Other', rawCategory: 'Other' });
    }
    if (feeds.length === 0) {
      while ((m = flatRegex2.exec(xmlText)) !== null) {
        feeds.push({ url: m[3], name: m[1] || m[3], category: 'Other', rawCategory: 'Other' });
      }
    }
  }

  return feeds;
}

function parseUrlList(text) {
  return text
    .split(/[\n,]+/)
    .map(l => l.trim())
    .filter(l => l.startsWith('http'))
    .map(url => ({ url, name: url, category: 'Other', rawCategory: 'Other' }));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { content, format, mode, digest_name, category = 'Other', add_to_directory = false } = body;
    // format: 'opml' | 'urls'
    // mode: 'feeds' | 'digest'

    // Admin-only guard for directory writes
    if (add_to_directory && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    let parsedFeeds = [];

    if (format === 'opml') {
      parsedFeeds = parseOpml(content);
    } else {
      parsedFeeds = parseUrlList(content);
    }

    if (parsedFeeds.length === 0) {
      return Response.json({ error: 'No feeds found in the provided content.' }, { status: 400 });
    }

    if (mode === 'digest') {
      // Create feeds silently then create a digest referencing them
      const feedIds = [];
      for (const feed of parsedFeeds) {
        const existing = await base44.entities.Feed.filter({ url: feed.url });
        let feedRecord;
        if (existing.length > 0) {
          feedRecord = existing[0];
        } else {
          feedRecord = await base44.entities.Feed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || mapCategory(category),
            status: 'active',
          });
        }
        feedIds.push(feedRecord.id);
      }

      const digest = await base44.entities.Digest.create({
        name: digest_name || 'Imported Digest',
        frequency: 'daily',
        feed_ids: feedIds,
        delivery_web: true,
        status: 'active',
      });

      return Response.json({
        success: true,
        mode: 'digest',
        feeds_count: feedIds.length,
        digest_id: digest.id,
        digest_name: digest.name,
      });
    } else {
      // Mode: individual feeds — enforce free plan limit server-side
      if (!add_to_directory) {
        const FREE_FEED_LIMIT = 50;
        const isPremium = user.plan === 'premium';
        if (!isPremium) {
          const existingFeeds = await base44.entities.Feed.filter({});
          const remaining = FREE_FEED_LIMIT - existingFeeds.length;
          if (remaining <= 0) {
            return Response.json({ error: `Feed limit reached. Free plan allows ${FREE_FEED_LIMIT} feeds. Upgrade to Premium for unlimited feeds.` }, { status: 403 });
          }
          // Trim import to what's allowed
          parsedFeeds = parsedFeeds.slice(0, remaining);
        }
      }

      const created = [];
      const skipped = [];

      for (const feed of parsedFeeds) {
        const checkEntity = add_to_directory ? 'DirectoryFeed' : 'Feed';
        const existing = await base44.entities[checkEntity].filter({ url: feed.url });
        if (existing.length > 0) {
          skipped.push(feed.name);
          continue;
        }

        if (add_to_directory) {
          await base44.entities.DirectoryFeed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || mapCategory(category),
            description: '',
            added_count: 0,
            upvotes: 0,
            downvotes: 0,
          });
        } else {
          await base44.entities.Feed.create({
            name: feed.name,
            url: feed.url,
            category: feed.category || mapCategory(category),
            status: 'active',
          });
        }
        created.push(feed.name);
      }

      return Response.json({
        success: true,
        mode: 'feeds',
        created: created.length,
        skipped: skipped.length,
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});