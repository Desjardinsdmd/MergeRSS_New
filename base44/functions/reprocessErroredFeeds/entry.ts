import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * reprocessErroredFeeds — deletes all errored Feed records and re-adds
 * each one via the addSource pipeline so they go through native RSS →
 * discovery → scrape/generate.
 */

function extractItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { dry_run = false } = body;

  // Fetch all errored feeds
  const errored = extractItems(await base44.asServiceRole.entities.Feed.filter(
    { status: 'error' }, '-created_date', 200
  ));

  if (!errored.length) {
    return Response.json({ message: 'No errored feeds found', count: 0 });
  }

  // Collect info before deleting
  const feedInfos = errored.map(f => ({
    id: f.id,
    name: f.name,
    url: f.original_submitted_url || f.url,
    category: f.category || 'Other',
    tags: f.tags || [],
    error: f.fetch_error,
  }));

  if (dry_run) {
    return Response.json({
      dry_run: true,
      count: feedInfos.length,
      feeds: feedInfos.map(f => ({ name: f.name, url: f.url, error: f.error })),
    });
  }

  const results = [];

  for (const info of feedInfos) {
    try {
      // Delete the broken feed
      await base44.asServiceRole.entities.Feed.delete(info.id);
      console.log(`[reprocess] Deleted feed: ${info.name} (${info.id})`);

      // Re-add via addSource
      const addResult = await base44.functions.invoke('addSource', {
        url: info.url,
        name: info.name,
        category: info.category,
        tags: info.tags,
      });

      const data = addResult?.data || addResult;
      results.push({
        name: info.name,
        url: info.url,
        status: data?.success ? 'readded' : 'failed',
        sourceType: data?.sourceType || null,
        error: data?.error || null,
      });

      console.log(`[reprocess] Re-added ${info.name}: ${data?.success ? 'OK' : data?.error}`);
    } catch (err) {
      results.push({
        name: info.name,
        url: info.url,
        status: 'failed',
        error: err.message,
      });
      console.error(`[reprocess] Error for ${info.name}: ${err.message}`);
    }

    // Small delay to avoid hammering external servers
    await sleep(2000);
  }

  const succeeded = results.filter(r => r.status === 'readded').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return Response.json({
    total: results.length,
    succeeded,
    failed,
    results,
  });
});