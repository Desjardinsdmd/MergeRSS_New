// Starter packs for the Welcome flow. `dirCategories` match DirectoryFeed.category values;
// `keywords` match directory feed names/tags; `category` is stamped on feeds added from the
// pack; `fallback` tops the list up to a useful size when the directory is thin.

export const STARTER_PACKS = [
  {
    id: 'tech_ai', label: 'Tech & AI', category: 'Tech', dirCategories: ['Tech', 'AI'], keywords: ['ai', 'tech', 'software'],
    fallback: [
      { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
      { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
      { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
      { name: 'Hacker News (front page)', url: 'https://hnrss.org/frontpage' },
      { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/' },
      { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
      { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'AI' },
      { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', category: 'AI' },
    ],
  },
  {
    id: 'markets_finance', label: 'Markets & Finance', category: 'Markets', dirCategories: ['Markets', 'Finance'], keywords: ['market', 'finance', 'stocks', 'economy'],
    fallback: [
      { name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
      { name: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
      { name: 'Calculated Risk', url: 'https://www.calculatedriskblog.com/feeds/posts/default' },
      { name: 'Federal Reserve press releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'Finance' },
      { name: 'The Economist: Finance & economics', url: 'https://www.economist.com/finance-and-economics/rss.xml', category: 'Finance' },
      { name: 'Investing.com News', url: 'https://www.investing.com/rss/news.rss' },
      { name: 'Seeking Alpha Market Currents', url: 'https://seekingalpha.com/market_currents.xml' },
    ],
  },
  {
    id: 'real_estate', label: 'Real estate', category: 'CRE', dirCategories: ['CRE'], keywords: ['real estate', 'housing', 'multifamily', 'cre', 'property'],
    fallback: [
      { name: 'The Real Deal', url: 'https://therealdeal.com/feed/' },
      { name: 'Commercial Observer', url: 'https://commercialobserver.com/feed/' },
      { name: 'GlobeSt', url: 'https://www.globest.com/feed/' },
      { name: 'Multifamily Dive', url: 'https://www.multifamilydive.com/feeds/news/' },
      { name: 'Construction Dive', url: 'https://www.constructiondive.com/feeds/news/' },
      { name: 'HousingWire', url: 'https://www.housingwire.com/feed/' },
      { name: 'Inman', url: 'https://www.inman.com/feed/' },
      { name: 'Calculated Risk', url: 'https://www.calculatedriskblog.com/feeds/posts/default' },
    ],
  },
  {
    id: 'crypto', label: 'Crypto', category: 'Crypto', dirCategories: ['Crypto'], keywords: ['crypto', 'bitcoin', 'ethereum', 'defi'],
    fallback: [
      { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
      { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
      { name: 'Decrypt', url: 'https://decrypt.co/feed' },
      { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
      { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
      { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/' },
      { name: 'Blockworks', url: 'https://blockworks.co/feed' },
      { name: 'The Defiant', url: 'https://thedefiant.io/feed' },
    ],
  },
  {
    id: 'politics_world', label: 'Politics & world news', category: 'News', dirCategories: ['News'], keywords: ['politic', 'world', 'news'],
    fallback: [
      { name: 'BBC News: World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
      { name: 'The Guardian: World', url: 'https://www.theguardian.com/world/rss' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
      { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml' },
      { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
      { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all' },
      { name: 'The Hill', url: 'https://thehill.com/feed/' },
    ],
  },
  {
    id: 'science', label: 'Science', category: 'Science', dirCategories: [], keywords: ['science', 'research', 'physics', 'space'],
    fallback: [
      { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml' },
      { name: 'Nature', url: 'https://www.nature.com/nature.rss' },
      { name: 'Phys.org', url: 'https://phys.org/rss-feed/' },
      { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/' },
      { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/' },
      { name: 'NASA Breaking News', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
      { name: 'Ars Technica: Science', url: 'https://feeds.arstechnica.com/arstechnica/science' },
      { name: 'The Guardian: Science', url: 'https://www.theguardian.com/science/rss' },
    ],
  },
  {
    id: 'marketing_growth', label: 'Marketing & growth', category: 'Marketing', dirCategories: [], keywords: ['marketing', 'seo', 'growth', 'advertising'],
    fallback: [
      { name: 'HubSpot Marketing Blog', url: 'https://blog.hubspot.com/marketing/rss.xml' },
      { name: 'Search Engine Land', url: 'https://searchengineland.com/feed' },
      { name: 'Search Engine Journal', url: 'https://www.searchenginejournal.com/feed/' },
      { name: 'MarTech', url: 'https://martech.org/feed/' },
      { name: 'Social Media Examiner', url: 'https://www.socialmediaexaminer.com/feed/' },
      { name: 'Content Marketing Institute', url: 'https://contentmarketinginstitute.com/feed/' },
      { name: "Seth's Blog", url: 'https://seths.blog/feed/' },
      { name: 'Marketing Dive', url: 'https://www.marketingdive.com/feeds/news/' },
    ],
  },
  {
    id: 'startups_vc', label: 'Startups & VC', category: 'Startups', dirCategories: ['Tech'], keywords: ['startup', 'venture', 'vc', 'founder'],
    fallback: [
      { name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/' },
      { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/' },
      { name: 'Hacker News (front page)', url: 'https://hnrss.org/frontpage' },
      { name: 'AVC (Fred Wilson)', url: 'https://avc.com/feed/' },
      { name: 'Tomasz Tunguz', url: 'https://tomtunguz.com/index.xml' },
      { name: 'Paul Graham essays', url: 'http://www.aaronsw.com/2002/feeds/pgessays.rss' },
      { name: 'Sifted', url: 'https://sifted.eu/feed' },
      { name: 'First Round Review', url: 'https://review.firstround.com/feed.xml' },
    ],
  },
  {
    id: 'health_medicine', label: 'Health & medicine', category: 'Health', dirCategories: [], keywords: ['health', 'medic', 'pharma', 'biotech'],
    fallback: [
      { name: 'STAT', url: 'https://www.statnews.com/feed/' },
      { name: 'KFF Health News', url: 'https://kffhealthnews.org/feed/' },
      { name: 'Medical Xpress', url: 'https://medicalxpress.com/rss-feed/' },
      { name: 'ScienceDaily: Health & medicine', url: 'https://www.sciencedaily.com/rss/health_medicine.xml' },
      { name: 'NYT Health', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml' },
      { name: 'Fierce Healthcare', url: 'https://www.fiercehealthcare.com/rss/xml' },
      { name: 'MedPage Today', url: 'https://www.medpagetoday.com/rss/headlines.xml' },
      { name: 'NIH News Releases', url: 'https://www.nih.gov/news-releases/feed.xml' },
    ],
  },
  {
    id: 'sports', label: 'Sports', category: 'Sports', dirCategories: [], keywords: ['sport', 'football', 'soccer', 'nba', 'nfl'],
    fallback: [
      { name: 'ESPN Top Headlines', url: 'https://www.espn.com/espn/rss/news' },
      { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
      { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
      { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/' },
      { name: 'The Guardian: Sport', url: 'https://www.theguardian.com/sport/rss' },
      { name: 'NYT Sports', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml' },
      { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
      { name: 'Sports Illustrated', url: 'https://www.si.com/rss/si_topstories.rss' },
    ],
  },
];

export const CUSTOM_PACK_ID = 'custom';

export function urlKey(u) {
  if (!u) return '';
  try {
    const s = String(u).trim();
    const p = new URL(s.startsWith('http') ? s : `https://${s}`);
    return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '') + p.search).toLowerCase();
  } catch {
    return String(u).trim().toLowerCase();
  }
}

/**
 * Build the suggested source list for the selected packs.
 * Directory feeds first (by category, then keyword), topped up with each pack's fallback list.
 * Returns [{ key, name, url, category, directory_feed_id?, description?, origin }].
 */
export function buildSuggestions(packIds, directoryFeeds = [], { max = 12 } = {}) {
  const packs = STARTER_PACKS.filter(p => packIds.includes(p.id));
  if (!packs.length) return [];
  const perPack = Math.max(4, Math.ceil(max / packs.length));
  const seen = new Set();
  const out = [];
  const push = (f, origin) => {
    const key = urlKey(f.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    out.push({ ...f, key, origin });
    return true;
  };

  for (const pack of packs) {
    let taken = 0;
    const dirCap = Math.ceil(perPack * 0.6);
    const matches = (directoryFeeds || []).filter(f => {
      if (f.added_by_me) return false;
      const cat = String(f.category || '');
      if (pack.dirCategories.includes(cat)) return true;
      const hay = `${f.name || ''} ${(f.tags || []).join(' ')}`.toLowerCase();
      return pack.keywords.some(k => hay.includes(k));
    });
    for (const f of matches) {
      if (taken >= dirCap) break;
      if (push({
        name: f.name,
        url: f.url,
        category: pack.dirCategories.includes(f.category) ? f.category : pack.category,
        description: f.description || f.public_description || '',
        ...(f.source === 'directory' ? { directory_feed_id: f.id } : {}),
      }, 'directory')) taken++;
    }
    for (const f of pack.fallback) {
      if (taken >= perPack) break;
      if (push({ name: f.name, url: f.url, category: f.category || pack.category }, 'starter')) taken++;
    }
  }
  return out.slice(0, max);
}
