import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { XMLParser } from 'npm:fast-xml-parser@4.3.6';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const startedAt = new Date().toISOString();

        const feeds = await base44.asServiceRole.entities.Feed.filter({ status: 'active' });
        const results = [];

        for (const feed of feeds) {
            // Small delay between requests to avoid hammering servers
            await sleep(300);
            try {
                const items = await parseFeed(feed.url);

                // Get recent existing items for dedup (last 200)
                const existingItems = await base44.asServiceRole.entities.FeedItem.list('-created_date', 200);
                const feedExisting = existingItems.filter(i => i.feed_id === feed.id);
                const existingGuids = new Set(feedExisting.map(i => i.guid).filter(Boolean));
                const existingUrls = new Set(feedExisting.map(i => i.url).filter(Boolean));

                let newCount = 0;
                for (const item of items.slice(0, 50)) {
                    if (!item.guid && !item.url) continue;
                    if (existingGuids.has(item.guid) || existingUrls.has(item.url)) continue;

                    await base44.asServiceRole.entities.FeedItem.create({
                        feed_id: feed.id,
                        title: item.title,
                        url: item.url,
                        description: item.description,
                        content: item.content,
                        author: item.author,
                        published_date: item.published_date,
                        guid: item.guid || item.url,
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
            } catch (err) {
                await base44.asServiceRole.entities.Feed.update(feed.id, {
                    status: 'error',
                    fetch_error: err.message,
                });
                results.push({ feed: feed.name, error: err.message, status: 'error' });
            }
        }

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