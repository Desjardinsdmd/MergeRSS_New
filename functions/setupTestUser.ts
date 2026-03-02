import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const testEmail = 'test@mergerss.com';
    
    // Invite test user
    await base44.users.inviteUser(testEmail, 'user');

    // Create sample feeds for the test user
    const feeds = await base44.asServiceRole.entities.Feed.bulkCreate([
      {
        name: 'TechCrunch',
        url: 'https://techcrunch.com/feed/',
        category: 'Tech',
        tags: ['startups', 'innovation'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'The Verge',
        url: 'https://www.theverge.com/rss/index.xml',
        category: 'Tech',
        tags: ['gadgets', 'reviews'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'Bloomberg Markets',
        url: 'https://feeds.bloomberg.com/markets/news.rss',
        category: 'Finance',
        tags: ['markets', 'investing'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'Hacker News',
        url: 'https://news.ycombinator.com/rss',
        category: 'Tech',
        tags: ['programming', 'ai'],
        status: 'active',
        created_by: testEmail
      },
      {
        name: 'Crypto News',
        url: 'https://feeds.bloomberg.com/markets/cryptocurrency.rss',
        category: 'Crypto',
        tags: ['blockchain', 'bitcoin'],
        status: 'active',
        created_by: testEmail
      }
    ]);

    // Create sample articles for test feeds
    const articles = [];
    for (let i = 0; i < feeds.length; i++) {
      for (let j = 0; j < 8; j++) {
        articles.push({
          feed_id: feeds[i].id,
          title: `${feeds[i].name} Article ${j + 1}: Lorem ipsum dolor sit amet consectetur`,
          url: `https://example.com/article-${i}-${j}`,
          description: `This is a test article from ${feeds[i].name}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
          author: `Author ${j + 1}`,
          published_date: new Date(Date.now() - (j * 86400000)).toISOString(),
          category: feeds[i].category,
          tags: feeds[i].tags,
          is_read: j > 4,
          created_by: testEmail
        });
      }
    }

    if (articles.length > 0) {
      await base44.asServiceRole.entities.FeedItem.bulkCreate(articles);
    }

    // Create sample digest
    await base44.asServiceRole.entities.Digest.create({
      name: 'Daily Tech Digest',
      description: 'Daily roundup of tech news',
      categories: ['Tech'],
      frequency: 'daily',
      schedule_time: '09:00',
      output_length: 'medium',
      delivery_web: true,
      delivery_email: false,
      status: 'active',
      created_by: testEmail
    });

    return Response.json({ 
      message: 'Test user setup complete',
      email: testEmail,
      feedsCreated: feeds.length,
      articlesCreated: articles.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});