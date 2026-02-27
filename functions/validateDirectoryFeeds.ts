import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const validateFeedUrl = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!response.ok) return false;
    
    const content = await response.text();
    return content.includes('<rss') || content.includes('<feed') || content.includes('<?xml');
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

    const feeds = await base44.asServiceRole.entities.DirectoryFeed.list();
    
    let validated = 0;
    let deleted = 0;
    const invalidFeeds = [];
    
    // Test feeds in batches of 10
    const batchSize = 10;
    for (let i = 0; i < feeds.length; i += batchSize) {
      const batch = feeds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(feed => validateFeedUrl(feed.url).then(isValid => ({ feed, isValid })))
      );
      
      for (const { feed, isValid } of results) {
        if (isValid) {
          validated++;
        } else {
          invalidFeeds.push({ id: feed.id, name: feed.name, url: feed.url });
          await base44.asServiceRole.entities.DirectoryFeed.delete(feed.id);
          deleted++;
        }
      }
    }

    return Response.json({
      total: feeds.length,
      validated,
      deleted,
      invalidFeeds
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});