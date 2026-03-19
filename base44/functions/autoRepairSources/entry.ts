import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all feeds with degrading or failing health
    const healthData = await base44.entities.SourceHealth.list('-evaluated_at', 1000);
    const problematicFeeds = healthData.filter(h =>
      h.health_state === 'failing' || h.health_state === 'degrading'
    );

    if (problematicFeeds.length === 0) {
      return Response.json({ repaired: 0, escalated: 0, results: [] });
    }

    // Fetch corresponding Feed records
    const feedIds = problematicFeeds.map(h => h.feed_id);
    const feeds = await base44.entities.Feed.filter(
      { id: { $in: feedIds }, created_by: user.email }
    );

    const feedMap = Object.fromEntries(feeds.map(f => [f.id, f]));
    const results = [];

    // Process each problematic source
    for (const health of problematicFeeds) {
      const feed = feedMap[health.feed_id];
      if (!feed) continue;

      // Skip if already actively repairing
      if (feed.repair_status === 'retrying' || feed.repair_status === 'repairing') {
        continue;
      }

      // Skip if repair was recently attempted (< 1 hour ago)
      if (feed.last_repair_attempt_at) {
        const hourAgo = new Date(Date.now() - 3600000);
        if (new Date(feed.last_repair_attempt_at) > hourAgo) {
          continue;
        }
      }

      // Attempt repairs
      const repairResult = await attemptRepairs(base44, feed, health);
      results.push(repairResult);

      // Update feed with repair tracking
      const updateData = {
        repair_status: repairResult.status,
        last_repair_attempt_at: new Date().toISOString(),
        repair_attempt_count: (feed.repair_attempt_count || 0) + 1,
      };

      if (repairResult.actions.length > 0) {
        const existing = feed.repair_actions_taken || [];
        updateData.repair_actions_taken = [...existing, ...repairResult.actions];
      }

      if (repairResult.status === 'resolved') {
        updateData.status = 'active';
        updateData.escalation_reason = null;
      } else if (repairResult.status === 'failed') {
        updateData.escalation_reason = repairResult.escalation_reason;
      }

      await base44.entities.Feed.update(feed.id, updateData);
    }

    const repaired = results.filter(r => r.status === 'resolved').length;
    const escalated = results.filter(r => r.status === 'failed').length;

    return Response.json({ repaired, escalated, results });

  } catch (error) {
    console.error('[autoRepairSources] Error:', error);
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

// ─── Repair Orchestration ───

async function attemptRepairs(base44, feed, health) {
  const actions = [];

  // Step 1: Retry fetch with backoff
  console.log(`[repair] Retrying fetch for ${feed.id}`);
  let retryResult = await retryFetch(feed.url);
  actions.push({
    action: 'retry_fetch',
    result: retryResult.success ? 'success' : 'failed',
    reason: retryResult.reason,
    attempted_at: new Date().toISOString(),
  });

  if (retryResult.success) {
    return {
      status: 'resolved',
      escalation_reason: null,
      actions,
    };
  }

  // Step 2: Re-run RSS discovery if original was website
  if (!feed.source_type || feed.source_type !== 'rss_native') {
    console.log(`[repair] Re-running RSS discovery for ${feed.id}`);
    let discoveryResult = await discoverRssFeeds(feed.original_submitted_url || feed.url);
    actions.push({
      action: 'rss_discovery',
      result: discoveryResult.success ? 'success' : 'failed',
      reason: discoveryResult.reason,
      attempted_at: new Date().toISOString(),
    });

    if (discoveryResult.success) {
      // Update feed with discovered URL
      await base44.entities.Feed.update(feed.id, {
        url: discoveryResult.feedUrl,
        resolved_url: discoveryResult.feedUrl,
        source_type: 'rss_discovered',
      });
      return {
        status: 'resolved',
        escalation_reason: null,
        actions,
      };
    }
  }

  // Step 3: Try alternate feed endpoints
  console.log(`[repair] Trying alternate endpoints for ${feed.id}`);
  let altResult = await tryAlternateEndpoints(feed.original_submitted_url || feed.url);
  actions.push({
    action: 'alternate_endpoints',
    result: altResult.success ? 'success' : 'failed',
    reason: altResult.reason,
    attempted_at: new Date().toISOString(),
  });

  if (altResult.success) {
    await base44.entities.Feed.update(feed.id, {
      url: altResult.feedUrl,
      resolved_url: altResult.feedUrl,
    });
    return {
      status: 'resolved',
      escalation_reason: null,
      actions,
    };
  }

  // Step 4: Fallback to generator if not already generated
  if (feed.source_type !== 'generated') {
    console.log(`[repair] Falling back to generator for ${feed.id}`);
    let genResult = await tryGenerator(feed.original_submitted_url || feed.url);
    actions.push({
      action: 'generator_fallback',
      result: genResult.success ? 'success' : 'failed',
      reason: genResult.reason,
      attempted_at: new Date().toISOString(),
    });

    if (genResult.success) {
      await base44.entities.Feed.update(feed.id, {
        source_type: 'generated',
        metadata_json: JSON.stringify({
          ...JSON.parse(feed.metadata_json || '{}'),
          rssXml: genResult.rssXml,
        }),
      });
      return {
        status: 'resolved',
        escalation_reason: null,
        actions,
      };
    }
  }

  // Step 5: Revalidate parsing (basic check)
  console.log(`[repair] Revalidating parsing for ${feed.id}`);
  let validateResult = await revalidateParsing(feed.url);
  actions.push({
    action: 'revalidate_parsing',
    result: validateResult.success ? 'success' : 'failed',
    reason: validateResult.reason,
    attempted_at: new Date().toISOString(),
  });

  if (validateResult.success) {
    return {
      status: 'resolved',
      escalation_reason: null,
      actions,
    };
  }

  // All repairs failed
  let escalationReason = 'The system could not automatically recover this source. ';

  // Provide context-aware guidance
  if (feed.source_type === 'generated') {
    escalationReason += 'Try a more specific URL (e.g., /blog or /news instead of the homepage).';
  } else if (health.articles_last_7d === 0) {
    escalationReason += 'The feed appears to be inactive or empty. Try a different feed URL.';
  } else {
    escalationReason += 'The feed may have moved or changed format.';
  }

  return {
    status: 'failed',
    escalation_reason: escalationReason,
    actions,
  };
}

// ─── Repair Helpers ───

async function retryFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { success: false, reason: `HTTP ${res.status}` };
    }

    const text = await res.text();
    const isValid = isRssFeed(text) || (text.length > 500 && text.includes('<'));

    return {
      success: isValid,
      reason: isValid ? 'Fetch succeeded' : 'Response is not RSS or HTML',
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function discoverRssFeeds(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { success: false, reason: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const feedUrls = extractFeedLinks(html, url);

    for (const candidateUrl of feedUrls.slice(0, 8)) {
      try {
        const feedRes = await fetch(candidateUrl, {
          signal: AbortSignal.timeout(5000),
        });

        if (!feedRes.ok) continue;
        const feedText = await feedRes.text();
        if (!isRssFeed(feedText)) continue;

        return {
          success: true,
          feedUrl: candidateUrl,
          reason: 'Discovered feed link in HTML',
        };
      } catch {}
    }

    return { success: false, reason: 'No valid feed links found' };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function tryAlternateEndpoints(baseUrl) {
  const base = new URL(baseUrl);
  const alternates = [
    '/feed',
    '/rss',
    '/atom',
    '/feed.xml',
    '/rss.xml',
    '/atom.xml',
    '/feeds',
  ];

  for (const path of alternates) {
    try {
      const altUrl = new URL(path, base).href;
      const res = await fetch(altUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;
      const text = await res.text();
      if (!isRssFeed(text)) continue;

      return {
        success: true,
        feedUrl: altUrl,
        reason: `Found feed at ${path}`,
      };
    } catch {}
  }

  return { success: false, reason: 'No alternate endpoints returned valid feeds' };
}

async function tryGenerator(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { success: false, reason: `HTTP ${res.status}` };
    }

    const html = await res.text();

    // Basic extraction
    const items = extractArticleItems(html, url, 10);

    if (items.length === 0) {
      return { success: false, reason: 'No articles extractable' };
    }

    const metadata = extractMetadata(html, url);
    const rssXml = buildRssXml(metadata.title, metadata.description, url, items);

    return {
      success: true,
      rssXml,
      reason: 'Generated feed from HTML extraction',
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function revalidateParsing(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { success: false, reason: `HTTP ${res.status}` };
    }

    const text = await res.text();
    const isRss = isRssFeed(text);
    const isHtml = text.includes('<');

    return {
      success: isRss || isHtml,
      reason: isRss ? 'Valid RSS' : 'Valid HTML',
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

// ─── Utility Functions ───

function isRssFeed(text) {
  const t = (text || '').trimStart();
  return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed') || t.startsWith('<rdf:RDF')) &&
    (t.includes('<item>') || t.includes('<entry>') || t.includes('<channel>'));
}

function extractFeedLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = [];

  const linkRe = /<link[^>]+>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!tag.includes('alternate')) continue;
    const typeM = tag.match(/type=["']([^"']+)["']/i);
    const hrefM = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefM) continue;
    const type = (typeM?.[1] || '').toLowerCase();
    if (type.includes('rss') || type.includes('atom')) {
      try {
        links.push(new URL(hrefM[1], base).href);
      } catch {}
    }
  }

  for (const path of ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml']) {
    try {
      links.push(new URL(path, base).href);
    } catch {}
  }

  return [...new Set(links)];
}

function extractMetadata(html, pageUrl) {
  const get = (re) => {
    const m = html.match(re);
    return m ? (m[1] || '').slice(0, 300) : '';
  };
  const title = get(/<title[^>]*>([^<]{1,200})<\/title>/i) || new URL(pageUrl).hostname;
  const description = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i) || '';
  return { title, description };
}

function extractArticleItems(html, baseUrl, limit = 10) {
  const base = new URL(baseUrl);
  const items = [];
  const seen = new Set();

  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null && items.length < limit) {
    const block = m[1];
    const linkM = block.match(/<a[^>]+href=["']([^"'#?][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkM) continue;

    let href = linkM[1];
    try {
      href = new URL(href, base).href;
      if (new URL(href).hostname !== base.hostname) continue;
    } catch { continue; }

    if (seen.has(href)) continue;
    seen.add(href);

    const headM = block.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
    const title = (headM?.[1] || linkM[2] || '').replace(/<[^>]+>/g, '').slice(0, 200);
    if (!title || title.length < 8) continue;

    items.push({ title, url: href, description: '', pubDate: '', author: '' });
  }

  return items.slice(0, limit);
}

function buildRssXml(title, description, pageUrl, items) {
  const now = new Date().toUTCString();
  const esc = (s) => (s || '').replace(/]]>/g, ']]]]><![CDATA[>');

  const itemsXml = items.map(item => `
    <item>
      <title><![CDATA[${esc(item.title)}]]></title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <description><![CDATA[${esc(item.description || '')}]]></description>
      <pubDate>${item.pubDate || now}</pubDate>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${esc(title)}]]></title>
    <link>${pageUrl}</link>
    <description><![CDATA[${esc(description || 'Feed generated by MergeRSS')}]]></description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>MergeRSS (mergerss.app)</generator>
${itemsXml}
  </channel>
</rss>`;
}