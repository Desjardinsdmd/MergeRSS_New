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

    for (const feed of feeds) {
      const isValid = await validateFeedUrl(feed.url);
      
      if (isValid) {
        validated++;
      } else {
        invalidFeeds.push({ id: feed.id, name: feed.name, url: feed.url });
        await base44.asServiceRole.entities.DirectoryFeed.delete(feed.id);
        deleted++;
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