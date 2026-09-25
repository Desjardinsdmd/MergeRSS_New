import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { hmac } from 'npm:@noble/hashes@1.4.0/hmac';
import { sha1 } from 'npm:@noble/hashes@1.4.0/sha1';

/**
 * postToX — X (Twitter) channel adapter.
 * Posts single tweets or threads using X API v2 with OAuth 1.0a user context.
 *
 * Expects: { post_id: string }
 *
 * Security (2026-09-25 hardening):
 *   - Admin only. Publications are an owner feature; no other account may post.
 *   - Credentials come from backend secrets X_API_KEY, X_API_SECRET,
 *     X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET. The legacy plaintext
 *     Publication.credentials_ref is used only as a fallback until the
 *     secrets are set, then should be cleared.
 *   - Idempotency: refuses to post a post that already has tweet IDs, and
 *     refuses to post a cluster that already went out for this publication.
 *   - A post is only marked "posted" when X returns an ID for every tweet.
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

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

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`X API error ${res.status}: ${JSON.stringify(data)}`);
    }
    const id = data?.data?.id;
    if (!id) throw new Error(`X API returned no tweet id: ${JSON.stringify(data)}`);
    return id;
}

function loadCredentials(pub) {
    const fromEnv = {
        api_key: Deno.env.get('X_API_KEY'),
        api_secret: Deno.env.get('X_API_SECRET'),
        access_token: Deno.env.get('X_ACCESS_TOKEN'),
        access_token_secret: Deno.env.get('X_ACCESS_TOKEN_SECRET'),
    };
    if (fromEnv.api_key && fromEnv.api_secret && fromEnv.access_token && fromEnv.access_token_secret) {
        return { creds: fromEnv, source: 'secrets' };
    }
    // Legacy fallback: plaintext on the Publication record. Remove once secrets are set.
    const legacy = JSON.parse(pub.credentials_ref || '{}');
    if (!legacy.api_key || !legacy.api_secret || !legacy.access_token || !legacy.access_token_secret) {
        throw new Error('No X credentials found in secrets or on the publication');
    }
    return { creds: legacy, source: 'legacy_record' };
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { post_id } = await req.json().catch(() => ({}));
    if (!post_id) return Response.json({ error: 'post_id required' }, { status: 400 });

    const svc = base44.asServiceRole.entities;

    const post = extractItems(await svc.PublicationPost.filter({ id: post_id }, '-created_date', 1))[0];
    if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });
    if (!['approved', 'scheduled'].includes(post.status)) {
        return Response.json({ error: `Post status is "${post.status}", must be approved or scheduled` }, { status: 400 });
    }
    if (post.external_post_ids?.length) {
        return Response.json({ error: 'Post already has tweet IDs; refusing to post twice' }, { status: 409 });
    }
    if (post.scheduled_for && new Date(post.scheduled_for) > new Date()) {
        return Response.json({ error: 'Post is scheduled for the future', scheduled_for: post.scheduled_for }, { status: 400 });
    }

    const pub = extractItems(await svc.Publication.filter({ id: post.publication_id }, '-created_date', 1))[0];
    if (!pub) return Response.json({ error: 'Publication not found' }, { status: 404 });
    if (pub.channel_type !== 'x') return Response.json({ error: `Channel type "${pub.channel_type}" not supported yet` }, { status: 400 });
    if (pub.status === 'paused' || pub.status === 'draft_only') {
        return Response.json({ error: `Publication is ${pub.status}; not posting` }, { status: 409 });
    }

    // Idempotency: never post the same story twice for this publication.
    if (post.cluster_id) {
        const already = extractItems(await svc.PublicationPost.filter(
            { publication_id: pub.id, cluster_id: post.cluster_id, status: 'posted' }, '-created_date', 5
        )).filter(p => p.id !== post.id);
        if (already.length) {
            await svc.PublicationPost.update(post.id, {
                status: 'archived',
                error_message: `Duplicate: cluster already posted as ${already[0].id}`,
            });
            return Response.json({ error: 'Cluster already posted for this publication', existing_post_id: already[0].id }, { status: 409 });
        }
    }

    let creds, credSource;
    try {
        ({ creds, source: credSource } = loadCredentials(pub));
    } catch (e) {
        await svc.PublicationPost.update(post.id, { status: 'failed', error_message: `Invalid credentials: ${e.message}` });
        return Response.json({ error: e.message }, { status: 400 });
    }

    const content = (post.final_content?.length ? post.final_content : null)
        ?? post.draft_variants?.[post.chosen_variant_index ?? 0]?.content
        ?? [];
    if (!content.length) {
        await svc.PublicationPost.update(post.id, { status: 'failed', error_message: 'No content to post' });
        return Response.json({ error: 'No content to post' }, { status: 400 });
    }

    const tweetIds = [];
    try {
        let lastTweetId = null;
        for (const text of content) {
            const tweetId = await postTweet(text, creds, lastTweetId);
            tweetIds.push(tweetId);
            lastTweetId = tweetId;
        }

        await svc.PublicationPost.update(post.id, {
            status: 'posted',
            posted_at: new Date().toISOString(),
            external_post_ids: tweetIds,
            final_content: content,
            error_message: '',
        });

        return Response.json({ success: true, tweet_ids: tweetIds, credential_source: credSource });
    } catch (postErr) {
        console.error(`[postToX] Failed: ${postErr.message}`);
        // Record any tweets that did go out so a retry never duplicates them.
        await svc.PublicationPost.update(post.id, {
            status: 'failed',
            error_message: tweetIds.length
                ? `Partial thread: ${tweetIds.length}/${content.length} posted. ${postErr.message}`
                : postErr.message,
            external_post_ids: tweetIds,
        });
        return Response.json({ error: postErr.message, posted_tweet_ids: tweetIds }, { status: 500 });
    }
});
