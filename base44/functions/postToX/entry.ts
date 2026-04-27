import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { hmac } from 'npm:@noble/hashes@1.4.0/hmac';
import { sha1 } from 'npm:@noble/hashes@1.4.0/sha1';

/**
 * postToX — X (Twitter) channel adapter.
 * Posts single tweets or threads using X API v2 with OAuth 1.0a user context.
 *
 * Expects: { post_id: string }
 * The PublicationPost must be in "approved" or "scheduled" status.
 * Credentials are stored encrypted in the Publication's credentials_ref field
 * as a JSON string: { api_key, api_secret, access_token, access_token_secret }
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

// OAuth 1.0a signature generation for X API
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    const sig = hmac(sha1, new TextEncoder().encode(signingKey), new TextEncoder().encode(baseString));
    return btoa(String.fromCharCode(...sig));
}

function generateNonce() {
    return crypto.randomUUID().replace(/-/g, '');
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

async function postTweet(text, creds, replyToId = null) {
    const url = 'https://api.twitter.com/2/tweets';
    const body = { text };
    if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

    const authHeader = buildAuthHeader('POST', url, creds);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`X API error ${res.status}: ${JSON.stringify(data)}`);
    }
    return data.data?.id;
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { post_id } = await req.json().catch(() => ({}));
    if (!post_id) return Response.json({ error: 'post_id required' }, { status: 400 });

    // Load the post (user-scoped via RLS)
    const posts = extractItems(await base44.entities.PublicationPost.filter({ id: post_id }, '-created_date', 1));
    const post = posts[0];
    if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });
    if (!['approved', 'scheduled'].includes(post.status)) {
        return Response.json({ error: `Post status is "${post.status}", must be approved or scheduled` }, { status: 400 });
    }

    // If scheduled_for is in the future, don't post yet
    if (post.scheduled_for && new Date(post.scheduled_for) > new Date()) {
        return Response.json({ error: 'Post is scheduled for the future', scheduled_for: post.scheduled_for }, { status: 400 });
    }

    // Load publication to get credentials
    const pubs = extractItems(await base44.entities.Publication.filter({ id: post.publication_id }, '-created_date', 1));
    const pub = pubs[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });
    if (pub.channel_type !== 'x') return Response.json({ error: `Channel type "${pub.channel_type}" not supported yet` }, { status: 400 });

    // Parse credentials
    let creds;
    try {
        creds = JSON.parse(pub.credentials_ref);
        if (!creds.api_key || !creds.api_secret || !creds.access_token || !creds.access_token_secret) {
            throw new Error('Missing credential fields');
        }
    } catch (e) {
        await base44.entities.PublicationPost.update(post.id, { status: 'failed', error_message: `Invalid credentials: ${e.message}` });
        return Response.json({ error: 'Invalid X credentials on publication' }, { status: 400 });
    }

    // Get content to post
    const content = post.final_content || (post.draft_variants?.[post.chosen_variant_index ?? 0]?.content) || [];
    if (!content.length) {
        await base44.entities.PublicationPost.update(post.id, { status: 'failed', error_message: 'No content to post' });
        return Response.json({ error: 'No content to post' }, { status: 400 });
    }

    // Post: single tweet or thread
    const tweetIds = [];
    try {
        let lastTweetId = null;
        for (const text of content) {
            const tweetId = await postTweet(text, creds, lastTweetId);
            tweetIds.push(tweetId);
            lastTweetId = tweetId;
        }

        await base44.entities.PublicationPost.update(post.id, {
            status: 'posted',
            posted_at: new Date().toISOString(),
            external_post_ids: tweetIds,
        });

        return Response.json({ success: true, tweet_ids: tweetIds });
    } catch (postErr) {
        console.error(`[postToX] Failed: ${postErr.message}`);
        await base44.entities.PublicationPost.update(post.id, {
            status: 'failed',
            error_message: postErr.message,
        });
        return Response.json({ error: postErr.message }, { status: 500 });
    }
});