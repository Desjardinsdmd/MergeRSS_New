import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * postToX — no longer calls the X API. Saves the post as an XDraft (status Draft)
 * for manual posting from the Drafts page. Name kept so existing callers work.
 * Expects: { post_id }
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

const isInternal = (u) => !u || /merge-rss|mergerss|base44\.app/i.test(u);

export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { post_id } = await req.json().catch(() => ({}));
        if (!post_id) return Response.json({ error: 'post_id required' }, { status: 400 });
        const svc = base44.asServiceRole.entities;

        const post = extractItems(await svc.PublicationPost.filter({ id: post_id }, '-created_date', 1))[0];
        if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });

        const existing = extractItems(await svc.XDraft.filter({ publication_post_id: post.id }, '-created_date', 1));
        if (existing.length) return Response.json({ success: true, draft_id: existing[0].id, already_queued: true });

        const content = (post.final_content?.length ? post.final_content : null)
            ?? post.draft_variants?.[post.chosen_variant_index ?? 0]?.content ?? [];
        if (!content.length) return Response.json({ error: 'No content to queue' }, { status: 400 });

        let article_url = '', article_title = '', source = '';
        if (post.cluster_id) {
            const cluster = extractItems(await svc.StoryCluster.filter({ id: post.cluster_id }, '-created_date', 1))[0];
            if (cluster) {
                article_title = cluster.representative_title || '';
                source = cluster.source_domains?.[0] || '';
                const ids = [cluster.representative_item_id, ...(cluster.article_ids || [])].filter(Boolean).slice(0, 10);
                const items = ids.length ? extractItems(await svc.FeedItem.filter({ id: { $in: ids } }, '-created_date', 10)) : [];
                const ordered = [...items].sort((a, b) => (b.id === cluster.representative_item_id) - (a.id === cluster.representative_item_id));
                for (const it of ordered) {
                    const u = [it.canonical_url, it.url].find(x => x && !isInternal(x));
                    if (u) { article_url = u; if (!article_title) article_title = it.title || ''; break; }
                }
            }
        }

        // Strip URLs from text; the article link is attached separately.
        const post_text = content.join('\n\n').replace(/https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n').trim();

        const draft = await svc.XDraft.create({
            post_text, article_url, article_title, source, status: 'Draft', publication_post_id: post.id,
        });
        await svc.PublicationPost.update(post.id, {
            status: 'archived', final_content: content, error_message: '', human_notes: 'Queued to X Drafts',
        });
        return Response.json({ success: true, draft_id: draft.id });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}