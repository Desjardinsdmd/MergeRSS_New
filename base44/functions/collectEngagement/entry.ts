import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { hmac } from 'npm:@noble/hashes@1.4.0/hmac';
import { sha1 } from 'npm:@noble/hashes@1.4.0/sha1';

/**
 * collectEngagement — daily job to fetch engagement metrics from X for posted items.
 * Runs as admin-only scheduled job.
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

function generateNonce() { return crypto.randomUUID().replace(/-/g, ''); }

function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    const sig = hmac(sha1, new TextEncoder().encode(signingKey), new TextEncoder().encode(baseString));
    return btoa(String.fromCharCode(...sig));
}

function buildAuthHeader(method, url, creds, extraParams = {}) {
    const oauthParams = {
        oauth_consumer_key: creds.api_key,
        oauth_nonce: generateNonce(),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: creds.access_token,
        oauth_version: '1.0',
        ...extraParams,
    };
    oauthParams.oauth_signature = generateOAuthSignature(
        method, url, oauthParams, creds.api_secret, creds.access_token_secret
    );
    const headerParts = Object.keys(oauthParams).sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
        .join(', ');
    return `OAuth ${headerParts}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    // Find posted items from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const postedPosts = extractItems(await base44.asServiceRole.entities.PublicationPost.filter(
        { status: 'posted', posted_at: { $gte: thirtyDaysAgo } },
        '-posted_at', 100
    ));

    if (!postedPosts.length) {
        return Response.json({ updated: 0, reason: 'no_posted_items' });
    }

    // Group by publication to load credentials once per pub
    const pubMap = {};
    for (const post of postedPosts) {
        if (!pubMap[post.publication_id]) pubMap[post.publication_id] = [];
        pubMap[post.publication_id].push(post);
    }

    let updated = 0, errors = 0;

    for (const [pubId, posts] of Object.entries(pubMap)) {
        const pubs = extractItems(await base44.asServiceRole.entities.Publication.filter({ id: pubId }, '-created_date', 1));
        const pub = pubs[0];
        if (!pub || pub.channel_type !== 'x' || !pub.credentials_ref) continue;

        let creds;
        try { creds = JSON.parse(pub.credentials_ref); } catch { continue; }
        if (!creds.api_key) continue;

        for (const post of posts) {
            const tweetIds = post.external_post_ids || [];
            if (!tweetIds.length) continue;

            // Fetch metrics for the first tweet (main post)
            const tweetId = tweetIds[0];
            try {
                const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`;
                const authHeader = buildAuthHeader('GET', url.split('?')[0], {
                    ...Object.fromEntries(new URL(url).searchParams),
                    oauth_consumer_key: creds.api_key,
                    oauth_nonce: generateNonce(),
                    oauth_signature_method: 'HMAC-SHA1',
                    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
                    oauth_token: creds.access_token,
                    oauth_version: '1.0',
                }, creds.api_secret, creds.access_token_secret);

                // Simpler approach: rebuild auth for GET with query params
                const baseUrl = `https://api.twitter.com/2/tweets/${tweetId}`;
                const getAuth = buildAuthHeader('GET', baseUrl, creds, { 'tweet.fields': 'public_metrics' });

                const res = await fetch(`${baseUrl}?tweet.fields=public_metrics`, {
                    headers: { 'Authorization': getAuth },
                });

                if (res.ok) {
                    const data = await res.json();
                    const metrics = data.data?.public_metrics;
                    if (metrics) {
                        await base44.asServiceRole.entities.PublicationPost.update(post.id, {
                            engagement_metrics: {
                                impressions: metrics.impression_count || 0,
                                likes: metrics.like_count || 0,
                                reposts: metrics.retweet_count || 0,
                                replies: metrics.reply_count || 0,
                                bookmarks: metrics.bookmark_count || 0,
                                fetched_at: new Date().toISOString(),
                            }
                        });
                        updated++;
                    }
                } else {
                    console.warn(`[collectEngagement] X API ${res.status} for tweet ${tweetId}`);
                    errors++;
                }
            } catch (e) {
                console.warn(`[collectEngagement] Error fetching ${tweetId}: ${e.message}`);
                errors++;
            }
            await sleep(200); // Rate limit respect
        }
    }

    return Response.json({ updated, errors, total_checked: postedPosts.length });
});