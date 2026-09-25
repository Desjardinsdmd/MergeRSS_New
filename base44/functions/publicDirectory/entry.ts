import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * publicDirectory — the only way public feeds/digests are listed across tenants.
 * Feed and Digest are owner-only under RLS, so the Directory page reads through here.
 * Returns a whitelist of fields: no owner emails, webhook URLs, Slack channels,
 * fetch errors, or anything else private to the owner.
 */
function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const looksPrivate = (url = '') => /[?&](token|key|auth|secret|sig|signature|access_token)=|kill-the-newsletter|\/private\//i.test(url);

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;
    const feeds = extractItems(await svc.Feed.filter({ is_public: true }, '-created_date', 500))
        .filter(f => !looksPrivate(f.url))
        .map(f => pick(f, ['id', 'name', 'url', 'category', 'tags', 'public_description', 'is_public']));
    const digests = extractItems(await svc.Digest.filter({ is_public: true }, '-created_date', 500))
        .map(d => pick(d, ['id', 'name', 'description', 'public_description', 'categories', 'tags', 'frequency',
            'output_length', 'is_public', 'added_count', 'upvotes', 'downvotes']));
    return Response.json({ feeds, digests });
});
