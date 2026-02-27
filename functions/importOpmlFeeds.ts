import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Maps OPML category names to our app categories
const CATEGORY_MAP = {
  'Technology': 'Tech',
  'Science': 'Tech',
  'Business & Economy': 'Finance',
  'Finance': 'Finance',
  'Startups': 'Finance',
  'World News': 'News',
  'News': 'News',
  'US News': 'News',
  'Politics': 'News',
  'Markets': 'Markets',
  'Investing': 'Markets',
  'Stocks': 'Markets',
  'Cryptocurrency': 'Crypto',
  'Crypto': 'Crypto',
  'Bitcoin': 'Crypto',
  'Artificial Intelligence': 'AI',
  'Machine Learning': 'AI',
  'AI': 'AI',
  'Real Estate': 'CRE',
  'CRE': 'CRE',
};

function mapCategory(raw) {
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'Other';
}

function parseOpml(xmlText) {
  const feeds = [];
  // Extract category from outer outline
  const categoryMatch = xmlText.match(/<outline[^>]+text="([^"]+)"[^>]*>\s*<outline/);
  const rawCategory = categoryMatch ? categoryMatch[1] : 'Other';
  const category = mapCategory(rawCategory);

  // Extract all feed outlines
  const feedRegex = /<outline[^>]+xmlUrl="([^"]+)"[^>]+text="([^"]+)"(?:[^>]+description="([^"]*)")?[^>]*\/>/g;
  const feedRegex2 = /<outline[^>]+text="([^"]+)"[^>]+xmlUrl="([^"]+)"(?:[^>]+description="([^"]*)")?[^>]*\/>/g;

  let match;
  while ((match = feedRegex.exec(xmlText)) !== null) {
    feeds.push({
      url: match[1],
      name: match[2],
      description: match[3] || '',
      category,
      rawCategory,
    });
  }

  // Try alternate attribute order if none found
  if (feeds.length === 0) {
    while ((match = feedRegex2.exec(xmlText)) !== null) {
      feeds.push({
        url: match[2],
        name: match[1],
        description: match[3] || '',
        category,
        rawCategory,
      });
    }
  }

  return feeds;
}

// Curated list of OPML files from the awesome-rss-feeds repo
const OPML_SOURCES = [
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Business%20%26%20Economy.opml', tags: ['business', 'economy'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Science.opml', tags: ['science'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Programming.opml', tags: ['programming', 'coding'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Gaming.opml', tags: ['gaming'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Food.opml', tags: ['food'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Health%20%26%20Fitness.opml', tags: ['health', 'fitness'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Movies.opml', tags: ['movies', 'entertainment'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Space.opml', tags: ['space', 'science'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Sports.opml', tags: ['sports'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Android.opml', tags: ['android', 'tech'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Apple.opml', tags: ['apple', 'tech'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Design.opml', tags: ['design'] },
  { url: 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/Books.opml', tags: ['books'] },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { source_url, tags: extraTags = [], dry_run = false } = body;

    // If a specific URL is passed, just fetch that one
    const sources = source_url
      ? [{ url: source_url, tags: extraTags }]
      : OPML_SOURCES;

    const results = [];
    let totalImported = 0;
    let totalSkipped = 0;

    for (const source of sources) {
      const res = await fetch(source.url);
      if (!res.ok) {
        results.push({ source: source.url, error: `HTTP ${res.status}` });
        continue;
      }
      const xml = await res.text();
      const parsed = parseOpml(xml);

      const imported = [];
      const skipped = [];

      for (const feed of parsed) {
         if (!dry_run) {
           // Check for duplicates by URL
           const existing = await base44.asServiceRole.entities.DirectoryFeed.filter({ url: feed.url });
           if (existing.length > 0) {
             skipped.push(feed.name);
             totalSkipped++;
             continue;
           }

           await base44.asServiceRole.entities.DirectoryFeed.create({
             name: feed.name,
             url: feed.url,
             category: feed.category,
             tags: [...(source.tags || []), feed.rawCategory.toLowerCase().replace(/[^a-z0-9]/g, '-')],
             description: feed.description ? feed.description.substring(0, 200) : `${feed.name} RSS feed`,
             added_count: 0,
             upvotes: 0,
             downvotes: 0,
           });
         }
         imported.push(feed.name);
         totalImported++;
       }

      results.push({
        source: source.url,
        parsed: parsed.length,
        imported: imported.length,
        skipped: skipped.length,
        feeds: dry_run ? parsed.map(f => ({ name: f.name, url: f.url, category: f.category, tags: source.tags })) : undefined,
      });
    }

    return Response.json({
      success: true,
      dry_run,
      total_imported: totalImported,
      total_skipped: totalSkipped,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});