import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';


// ── SSRF guard (2026-09-25) ────────────────────────────────────────────────────
// Every outbound fetch of a user-supplied URL goes through safeFetch: http(s) only, no
// localhost / private / link-local / metadata hosts, DNS answers checked when the runtime
// allows it, and redirects followed manually so each hop is re-validated (a public URL that
// 302s to 169.254.169.254 used to sail through).
const __BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0']);
function __isPrivateIp(ip) {
    const h = ip.replace(/^\[|\]$/g, '').toLowerCase();
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true; // CGNAT
    if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    if (/^::ffff:/.test(h)) return __isPrivateIp(h.replace(/^::ffff:/, ''));
    return false;
}
async function __assertPublicUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('SSRF_BLOCKED: invalid URL'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('SSRF_BLOCKED: scheme');
    const host = u.hostname.toLowerCase();
    if (__BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || __isPrivateIp(host)) {
        throw new Error('SSRF_BLOCKED: private host');
    }
    if (!/^[\d.]+$/.test(host) && !host.includes(':')) {
        for (const type of ['A', 'AAAA']) {
            let answers = [];
            try { answers = await Deno.resolveDns(host, type); } catch { answers = []; }
            if (answers.some(__isPrivateIp)) throw new Error('SSRF_BLOCKED: resolves to private address');
        }
    }
    return u;
}
async function safeFetch(url, init = {}) {
    let current = String(url);
    for (let hop = 0; hop <= 5; hop++) {
        await __assertPublicUrl(current);
        const res = await fetch(current, { ...init, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            current = new URL(res.headers.get('location'), current).toString();
            continue;
        }
        return res;
    }
    throw new Error('SSRF_BLOCKED: too many redirects');
}
// ───────────────────────────────────────────────────────────────────────────────

const testFeedUrl = async (url) => {
  try {
    const res = await safeFetch(url, { 
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
        // Only admins' searches add to the public directory; a regular user's LLM-steered
        // query could otherwise publish unvetted feeds there (2026-09-25).
        const existing = user.role === 'admin'
          ? await base44.asServiceRole.entities.DirectoryFeed.filter({ url: feed.url })
          : [{ skip: true }];
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