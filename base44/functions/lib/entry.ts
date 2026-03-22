/**
 * functions/lib.js — MergeRSS Shared Backend Utility Layer
 *
 * NOTE: Base44 does NOT support local imports between function files.
 * This file is a REFERENCE / documentation artifact — not deployed as shared code.
 *
 * The actual utilities are inlined (with CANONICAL COPY comments) into each function.
 *
 * MAINTENANCE RULE:
 * When editing a canonical pattern here, also update all inlined copies in:
 *   - fetchFeeds.js  (primary — contains parseFeed, buildDedupSets, isDuplicate, buildFeedItemRecord)
 *   - recoverFeeds.js (carries CANONICAL COPY of parseFeed + dedup helpers — must stay in sync)
 *   - clusterStories.js, scoreClusters.js, generateDigests.js, enrichFeedItems.js (extractItems, auth)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERN 1: extractItems — normalize any Base44 SDK response to a clean array
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * function extractItems(raw) {
 *     if (!raw) return [];
 *     if (Array.isArray(raw)) return raw;
 *     if (typeof raw !== 'object') return [];
 *     if (Array.isArray(raw.items))   return raw.items;
 *     if (Array.isArray(raw.data))    return raw.data;
 *     if (Array.isArray(raw.results)) return raw.results;
 *     const found = Object.values(raw).find(v => Array.isArray(v));
 *     return found || [];
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERN 2: safeFilter / safeList — always return clean arrays
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * async function safeFilter(entity, query, sort, limit = 500) {
 *     return extractItems(await entity.filter(query, sort, limit));
 * }
 *
 * async function safeList(entity, sort, limit = 500) {
 *     return extractItems(await entity.list(sort, limit));
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERN 3: Auth — requireAdminOrScheduler
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * async function requireAdminOrScheduler(base44) {
 *     try {
 *         const user = await base44.auth.me();
 *         if (user && user.role !== 'admin') {
 *             return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
 *         }
 *         return { user: user || null };
 *     } catch {
 *         return { user: null }; // scheduler — allow
 *     }
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERN 3b: Dedup helpers (fetchFeeds + recoverFeeds)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * function buildDedupSets(existingItems) {
 *     const guids = new Set(existingItems.map(i => i.guid).filter(Boolean));
 *     const urls  = new Set(existingItems.map(i => i.url).filter(Boolean));
 *     const titleKeys = new Set(
 *         existingItems
 *             .filter(i => i.title && i.published_date)
 *             .map(i => `${i.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}|${i.published_date?.slice(0, 10)}`)
 *     );
 *     return { guids, urls, titleKeys };
 * }
 *
 * function isDuplicate(item, dedupSets) {
 *     if (!item.guid && !item.url) return true;
 *     if (item.guid && dedupSets.guids.has(item.guid)) return true;
 *     if (item.url && dedupSets.urls.has(item.url)) return true;
 *     if (item.title && item.published_date) {
 *         const key = `${item.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}|${item.published_date.slice(0, 10)}`;
 *         if (dedupSets.titleKeys.has(key)) return true;
 *     }
 *     return false;
 * }
 *
 * function buildFeedItemRecord(item, feed) {
 *     return {
 *         feed_id: feed.id,
 *         title: String(item.title || '').slice(0, 500),
 *         url: String(item.url || ''),
 *         description: String(item.description || '').slice(0, 2000),
 *         content: String(item.content || '').slice(0, 5000),
 *         author: String(item.author || '').slice(0, 200),
 *         published_date: item.published_date,
 *         guid: String(item.guid || item.url || ''),
 *         category: feed.category,
 *         tags: feed.tags || [],
 *         is_read: false,
 *         enrichment_status: 'pending',   // set by enrichFeedItems to 'done' or 'fallback'
 *     };
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERN 4: Batch helpers
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * function chunkArray(arr, size) {
 *     const chunks = [];
 *     for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
 *     return chunks;
 * }
 *
 * async function withConcurrencyLimit(limit, tasks) {
 *     const results = new Array(tasks.length);
 *     let idx = 0;
 *     async function worker() {
 *         while (idx < tasks.length) {
 *             const i = idx++;
 *             results[i] = await tasks[i]().catch(err => ({ __err: err.message }));
 *         }
 *     }
 *     await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
 *     return results;
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERN 5: Pipeline health classification
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rules:
 *   - healthy:  expected output was produced (items > 0, clusters > 0, etc.)
 *   - degraded: ran but produced no output — possible upstream data issue
 *   - stale:    last run was too long ago (> 2x expected interval)
 *   - failed:   threw an error or lock was never acquired
 *
 * IMPORTANT: empty output is NOT automatically success.
 * Each function must explicitly check and classify its output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE: Every new scheduled function MUST include all 5 patterns above.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// This file intentionally exports nothing — it is a documentation artifact only.
// See pattern descriptions above.

Deno.serve(async () => {
    return Response.json({
        message: 'lib.js is a documentation file — not a callable function',
        patterns: ['extractItems', 'safeFilter', 'safeList', 'requireAdminOrScheduler', 'chunkArray', 'withConcurrencyLimit'],
    });
});