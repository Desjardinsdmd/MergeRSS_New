import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * summarizeArticle — on-demand 2-3 sentence summary for one article.
 *
 * Replaces the frontend writing ai_summary directly onto FeedItem, which let any
 * signed-in user overwrite the summary on any article in the system (including ones
 * feeding other users' digests and The Stack). The caller must own the article's feed.
 *
 * Body: { item_id }. Returns { summary }.
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { item_id } = await req.json().catch(() => ({}));
    if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
    const svc = base44.asServiceRole.entities;

    const item = extractItems(await svc.FeedItem.filter({ id: item_id }, '-created_date', 1))[0];
    if (!item) return Response.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'admin') {
        const feed = extractItems(await svc.Feed.filter({ id: item.feed_id, created_by: user.email }, '-created_date', 1))[0];
        if (!feed) return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (item.ai_summary) return Response.json({ summary: item.ai_summary, cached: true });

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Summarize the following article in 2-3 concise sentences. Focus on the key points and takeaways.\n\nTitle: ${item.title}\n\n${(item.description || item.content || 'No content available.').slice(0, 4000)}`,
    });
    const summary = typeof result === 'string' ? result : (result?.summary || result?.text || String(result));
    await svc.FeedItem.update(item.id, { ai_summary: summary });
    return Response.json({ summary });
});
