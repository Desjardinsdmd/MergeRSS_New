import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Decode common HTML entities from feed text so titles and snippets display correctly */
function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&ndash;/g, '–')
        .replace(/&mdash;/g, '—')
        .replace(/&lsquo;/g, '\u2018')
        .replace(/&rsquo;/g, '\u2019')
        .replace(/&ldquo;/g, '\u201C')
        .replace(/&rdquo;/g, '\u201D')
        .replace(/&hellip;/g, '…')
        .replace(/&copy;/g, '©')
        .replace(/&reg;/g, '®')
        .replace(/&trade;/g, '™')
        .replace(/&bull;/g, '•')
        .replace(/&amp;/g, '&');
}

async function parseFeed(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MergeRSS/1.0; +https://mergerss.app)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
    });

    if (response.status === 429) throw new Error('Rate limit exceeded — try again later');
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';
    const xml = await response.text();

    // Detect HTML responses (redirects to login pages, error pages, etc.)
    if (
        contentType.includes('text/html') &&
        !contentType.includes('xml') &&
        xml.trimStart().toLowerCase().startsWith('<!doctype html')
    ) {
        throw new Error('Feed returned HTML instead of XML — URL may have changed or requires auth');
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
        allowBooleanAttributes: true,
    });

    const parsed = parser.parse(xml);

    // RSS 2.0
    if (parsed.rss?.channel) {
        const channel = parsed.rss.channel;
        const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
        return items.map(item => ({
            title: item.title || 'Untitled',
            url: item.link || (typeof item.guid === 'string' ? item.guid : item.guid?.['#text']) || '',
            description: item.description || '',
            content: item['content:encoded'] || item.description || '',
            author: item.author || item['dc:creator'] || '',
            published_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            guid: typeof item.guid === 'string' ? item.guid : (item.guid?.['#text'] || item.link || ''),
        }));
    }

    // Atom 1.0
    if (parsed.feed) {
        const entries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : (parsed.feed.entry ? [parsed.feed.entry] : []);
        return entries.map(entry => {
            const links = Array.isArray(entry.link) ? entry.link : (entry.link ? [entry.link] : []);
            const link = links.find(l => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href'] || links[0]?.['@_href'] || '';
            return {
                title: typeof entry.title === 'string' ? entry.title : (entry.title?.['#text'] || 'Untitled'),
                url: link,
                description: typeof entry.summary === 'string' ? entry.summary : (entry.summary?.['#text'] || ''),
                content: typeof entry.content === 'string' ? entry.content : (entry.content?.['#text'] || ''),
                author: entry.author?.name || '',
                published_date: entry.updated || entry.published ? new Date(entry.updated || entry.published).toISOString() : new Date().toISOString(),
                guid: entry.id || link,
            };
        });
    }

    // RDF/RSS 1.0
    if (parsed['rdf:RDF'] || parsed.RDF) {
        const rdf = parsed['rdf:RDF'] || parsed.RDF;
        const items = Array.isArray(rdf.item) ? rdf.item : (rdf.item ? [rdf.item] : []);
        return items.map(item => ({
            title: typeof item.title === 'string' ? item.title : (item.title?.['#text'] || 'Untitled'),
            url: typeof item.link === 'string' ? item.link : (item.link?.['#text'] || ''),
            description: typeof item.description === 'string' ? item.description : (item.description?.['#text'] || ''),
            content: typeof item['content:encoded'] === 'string' ? item['content:encoded'] : '',
            author: item['dc:creator'] || '',
            published_date: item['dc:date'] ? new Date(item['dc:date']).toISOString() : new Date().toISOString(),
            guid: item['@_rdf:about'] || typeof item.link === 'string' ? item.link : '',
        }));
    }

    // Dump first 200 chars of response for debugging
    throw new Error(`Unrecognized feed format — starts with: ${xml.substring(0, 120).replace(/\s+/g, ' ').trim()}`);
}

async function fetchFeedsWithThrottling(feeds, base44, batchSize = 5, delayBetweenBatches = 1000) {
    const results = [];
    
    for (let i = 0; i < feeds.length; i += batchSize) {
        const batch = feeds.slice(i, i + batchSize);
        
        // Fetch all feeds in batch in parallel
        const batchResults = await Promise.allSettled(
            batch.map(feed => 
                parseFeed(feed.url)
                    .then(items => ({ feed, items, error: null }))
                    .catch(err => ({ feed, items: [], error: err.message }))
            )
        );

        // Get existing items for all feeds in batch (one query)
        const existingItems = await base44.asServiceRole.entities.FeedItem.filter({ 
            feed_id: { $in: batch.map(f => f.id) } 
        });
        const itemsByFeed = {};
        batch.forEach(f => itemsByFeed[f.id] = []);
        existingItems.forEach(item => {
            if (itemsByFeed[item.feed_id]) itemsByFeed[item.feed_id].push(item);
        });

        // Process results and prepare bulk creates
        const itemsToCreate = [];
        
        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            const feed = batch[j];
            
            if (result.status === 'rejected' || result.value.error) {
                const error = result.status === 'rejected' ? result.reason.message : result.value.error;
                const isRateLimit = error.includes('429') || error.toLowerCase().includes('rate limit');
                
                // Only update status on non-rate-limit errors
                if (!isRateLimit) {
                    await base44.asServiceRole.entities.Feed.update(feed.id, {
                        status: 'error',
                        fetch_error: error,
                    });
                }
                results.push({ feed: feed.name, error, status: isRateLimit ? 'rate_limited' : 'error' });
                continue;
            }

            const items = result.value.items;
            const feedExisting = itemsByFeed[feed.id] || [];
            const existingGuids = new Set(feedExisting.map(i => i.guid).filter(Boolean));
            const existingUrls = new Set(feedExisting.map(i => i.url).filter(Boolean));

            let newCount = 0;
            for (const item of items.slice(0, 50)) {
                if (!item.guid && !item.url) continue;
                if (existingGuids.has(item.guid) || existingUrls.has(item.url)) continue;

                itemsToCreate.push({
                    feed_id: feed.id,
                    title: String(item.title || '').slice(0, 500),
                    url: String(item.url || ''),
                    description: String(item.description || '').slice(0, 2000),
                    content: String(item.content || '').slice(0, 5000),
                    author: String(item.author || '').slice(0, 200),
                    published_date: item.published_date,
                    guid: String(item.guid || item.url || ''),
                    category: feed.category,
                    tags: feed.tags || [],
                    is_read: false,
                });
                newCount++;
            }

            await base44.asServiceRole.entities.Feed.update(feed.id, {
                last_fetched: new Date().toISOString(),
                item_count: feedExisting.length + newCount,
                status: 'active',
                fetch_error: '',
            });

            results.push({ feed: feed.name, new_items: newCount, status: 'ok' });
        }

        // Bulk create all items from this batch
        if (itemsToCreate.length > 0) {
            await base44.asServiceRole.entities.FeedItem.bulkCreate(itemsToCreate);
        }

        // Delay between batches to avoid rate limiting
        if (i + batchSize < feeds.length) {
            await sleep(delayBetweenBatches);
        }
    }
    
    return results;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify this is called by the scheduler or a valid service request
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const startedAt = new Date().toISOString();

        const feeds = await base44.asServiceRole.entities.Feed.filter({ status: 'active' });
        const results = await fetchFeedsWithThrottling(feeds, base44, 5, 1000);

        await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'feed_fetch',
            status: 'completed',
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            metadata: { feeds_processed: feeds.length, results },
        });

        return Response.json({ success: true, feeds_processed: feeds.length, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});