import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const allFeeds = await base44.asServiceRole.entities.DirectoryFeed.list();

    const urlMap = {};
    const duplicates = [];

    for (const feed of allFeeds) {
      const url = feed.url;
      if (!urlMap[url]) urlMap[url] = [];
      urlMap[url].push(feed);
    }

    for (const url in urlMap) {
      const feeds = urlMap[url];
      if (feeds.length > 1) {
        feeds.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        for (let i = 1; i < feeds.length; i++) {
          await base44.asServiceRole.entities.DirectoryFeed.delete(feeds[i].id);
          duplicates.push({
            url,
            deletedId: feeds[i].id,
            name: feeds[i].name,
            keptId: feeds[0].id,
          });
        }
      }
    }

    return Response.json({
      success: true,
      totalFeeds: allFeeds.length,
      duplicatesRemoved: duplicates.length,
      details: duplicates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});