import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all directory feeds
    const allFeeds = await base44.asServiceRole.entities.DirectoryFeed.list();
    
    // Group by URL to find duplicates
    const urlMap = {};
    const duplicates = [];
    
    for (const feed of allFeeds) {
      const url = feed.url;
    ...
        duplicates.push({
          url: url,
          deletedId: feeds[i].id,
          name: feeds[i].name,
          keptId: feeds[0].id
        });
        }
      }
    }

    return Response.json({
      success: true,
      totalFeeds: allFeeds.length,
      duplicatesRemoved: duplicates.length,
      details: duplicates
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});