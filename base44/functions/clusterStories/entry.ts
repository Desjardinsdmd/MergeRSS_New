/**
 * clusterStories — downstream story deduplication and clustering layer.
 *
 * This function is intentionally DOWNSTREAM from ingestion.
 * It NEVER modifies FeedItem content, only assigns cluster_id and
 * creates/updates StoryCluster records.
 *
 * Algorithm:
 * 1. Load recent FeedItems (configurable window, default 24h)
 * 2. Normalize titles and extract keywords
 * 3. Build clusters using Jaccard similarity on keyword sets
 * 4. Time-gate: articles >TIME_WINDOW_HOURS apart cannot cluster together
 * 5. Per cluster: upsert StoryCluster, write cluster_id back to each FeedItem
 *
 * Similarity threshold: 0.40 (tuned to story-level, not topic-level)
 * Conservative — prefer under-merging to over-merging.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const TIME_WINDOW_HOURS = 24;       // articles must be within this window to cluster
const SIMILARITY_THRESHOLD = 0.40;  // Jaccard threshold — tuned conservatively
const MIN_WORD_LENGTH = 4;          // ignore short stop words in similarity
const BATCH_WRITE_DELAY_MS = 120;   // delay between cluster DB writes
const MAX_ITEMS_TO_CLUSTER = 2000;  // cap to avoid runaway processing

// Common news stop-words to exclude from keyword extraction
const STOP_WORDS = new Set([
    'that', 'this', 'with', 'from', 'have', 'will', 'been', 'says', 'said',
    'after', 'over', 'their', 'what', 'about', 'which', 'when', 'could',
    'year', 'years', 'more', 'than', 'into', 'would', 'there', 'they',
    'report', 'reports', 'first', 'news', 'update', 'latest', 'breaking',
    'week', 'today', 'just', 'like', 'time', 'also', 'were', 'make',
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeTitle(title = '') {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractKeywords(title = '') {
    const norm = normalizeTitle(title);
    return norm
        .split(' ')
        .filter(w => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w));
}

function jaccardSimilarity(setA, setB) {
    if (!setA.size || !setB.size) return 0;
    let intersection = 0;
    for (const w of setA) if (setB.has(w)) intersection++;
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

// Extract domain from URL for source diversity tracking
function extractDomain(url = '') {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url.slice(0, 40) || 'unknown';
    }
}

// Choose the best representative from a cluster (highest importance, or most complete)
function choosePrimary(items) {
    return items.reduce((best, cur) => {
        const bestScore = best.importance_score ?? 0;
        const curScore = cur.importance_score ?? 0;
        if (curScore > bestScore) return cur;
        // Tie-break: prefer item with ai_summary
        if (curScore === bestScore && cur.ai_summary && !best.ai_summary) return cur;
        return best;
    });
}

Deno.serve(async (req) => {
    let base44;
    try {
        base44 = createClientFromRequest(req);
    } catch {
        try {
            const { createClient } = await import('npm:@base44/sdk@0.8.21');
            base44 = createClient();
        } catch (bootErr) {
            return Response.json({ error: `SDK boot failed: ${bootErr.message}` }, { status: 500 });
        }
    }

    // Allow admin-only or scheduled invocation
    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch {
        // Called from scheduler (no user) — allow
    }

    // Parse optional params
    let body = {};
    try { body = await req.json(); } catch {}
    const windowHours = body.window_hours || TIME_WINDOW_HOURS;
    const dryRun = body.dry_run === true;

    const runStartMs = Date.now();
    const windowStart = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

    // ── 1. Load recent feed items ──────────────────────────────────────────────
    let items = [];
    try {
        items = await base44.asServiceRole.entities.FeedItem.filter(
            { published_date: { $gte: windowStart } },
            '-published_date',
            MAX_ITEMS_TO_CLUSTER
        ) || [];
    } catch (e) {
        return Response.json({ error: `Failed to load items: ${e.message}` }, { status: 500 });
    }

    console.log(`[clusterStories] Loaded ${items.length} items from last ${windowHours}h`);

    if (items.length === 0) {
        return Response.json({ success: true, clusters_created: 0, clusters_updated: 0, items_clustered: 0, message: 'No items in window' });
    }

    // ── 2. Pre-compute keyword sets for all items ──────────────────────────────
    const itemMeta = items.map(item => ({
        item,
        keywords: new Set(extractKeywords(item.title || '')),
        publishedMs: item.published_date ? new Date(item.published_date).getTime() : Date.now(),
        domain: item.url ? extractDomain(item.url) : (item.feed_id || 'unknown'),
    }));

    // Sort by publish time descending (newest first — gives newest article priority as primary)
    itemMeta.sort((a, b) => b.publishedMs - a.publishedMs);

    // ── 3. Greedy clustering with time-gating ─────────────────────────────────
    const assigned = new Set(); // item IDs already in a cluster
    const rawClusters = [];     // [ { primary: itemMeta, members: [itemMeta, ...] } ]

    for (let i = 0; i < itemMeta.length; i++) {
        const pivot = itemMeta[i];
        if (assigned.has(pivot.item.id)) continue;

        assigned.add(pivot.item.id);
        const members = [pivot];

        for (let j = i + 1; j < itemMeta.length; j++) {
            const candidate = itemMeta[j];
            if (assigned.has(candidate.item.id)) continue;

            // Time gate — must be within window of the pivot
            const timeDiffHours = Math.abs(pivot.publishedMs - candidate.publishedMs) / 3600000;
            if (timeDiffHours > windowHours) continue;

            // Keyword similarity gate
            const sim = jaccardSimilarity(pivot.keywords, candidate.keywords);
            if (sim >= SIMILARITY_THRESHOLD) {
                members.push(candidate);
                assigned.add(candidate.item.id);
            }
        }

        rawClusters.push({ pivot, members });
    }

    console.log(`[clusterStories] Formed ${rawClusters.length} raw clusters from ${items.length} items`);

    if (dryRun) {
        const preview = rawClusters
            .filter(c => c.members.length > 1)
            .slice(0, 20)
            .map(c => ({
                representative: c.pivot.item.title,
                article_count: c.members.length,
                sources: [...new Set(c.members.map(m => m.domain))],
                titles: c.members.map(m => m.item.title),
            }));
        return Response.json({
            dry_run: true,
            total_items: items.length,
            total_clusters: rawClusters.length,
            multi_article_clusters: rawClusters.filter(c => c.members.length > 1).length,
            preview,
        });
    }

    // ── 4. Load existing clusters for upsert matching ──────────────────────────
    let existingClusters = [];
    try {
        existingClusters = await base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'active', last_updated_at: { $gte: windowStart } },
            '-last_updated_at',
            500
        ) || [];
    } catch (e) {
        console.warn(`[clusterStories] Could not load existing clusters: ${e.message}`);
    }

    // Index existing clusters by normalized representative title for fast lookup
    const existingByTitle = {};
    for (const ec of existingClusters) {
        if (ec.normalized_title) existingByTitle[ec.normalized_title] = ec;
    }

    // ── 5. Persist clusters and back-annotate FeedItems ───────────────────────
    let created = 0, updated = 0, itemsAnnotated = 0;

    for (const { pivot, members } of rawClusters) {
        const allItems = members.map(m => m.item);
        const primary = choosePrimary(allItems);

        const articleIds = allItems.map(i => i.id);
        const feedIds = [...new Set(allItems.map(i => i.feed_id).filter(Boolean))];
        const sourceDomains = [...new Set(members.map(m => m.domain).filter(Boolean))];
        const publishedDates = members.map(m => m.publishedMs).filter(isFinite);
        const firstSeenMs = Math.min(...publishedDates);
        const lastUpdatedMs = Math.max(...publishedDates);
        const maxImportance = Math.max(...allItems.map(i => i.importance_score ?? 0));
        const intelligenceTag = allItems.find(i => i.intelligence_tag && i.intelligence_tag !== 'Neutral')?.intelligence_tag || 'Neutral';
        const category = primary.category || allItems.find(i => i.category)?.category || null;
        const normTitle = normalizeTitle(primary.title || '');

        const clusterData = {
            representative_title: primary.title || 'Untitled',
            normalized_title: normTitle,
            representative_item_id: primary.id,
            article_ids: articleIds,
            feed_ids: feedIds,
            source_domains: sourceDomains,
            article_count: allItems.length,
            source_count: sourceDomains.length,
            category,
            tags: primary.tags || [],
            first_seen_at: new Date(firstSeenMs).toISOString(),
            last_updated_at: new Date(lastUpdatedMs).toISOString(),
            importance_score: maxImportance,
            intelligence_tag: intelligenceTag,
            cluster_window_hours: windowHours,
            status: 'active',
        };

        let clusterId = null;

        // Check if an existing cluster can be updated (same normalized title, within window)
        const existing = existingByTitle[normTitle];
        if (existing) {
            try {
                await base44.asServiceRole.entities.StoryCluster.update(existing.id, clusterData);
                clusterId = existing.id;
                updated++;
            } catch (e) {
                console.warn(`[clusterStories] Update failed for cluster "${primary.title}": ${e.message}`);
            }
        } else {
            try {
                const newCluster = await base44.asServiceRole.entities.StoryCluster.create(clusterData);
                clusterId = newCluster?.id;
                if (clusterId) existingByTitle[normTitle] = { id: clusterId, normalized_title: normTitle };
                created++;
            } catch (e) {
                console.warn(`[clusterStories] Create failed for cluster "${primary.title}": ${e.message}`);
            }
        }

        // Back-annotate each FeedItem with its cluster_id
        if (clusterId && allItems.length > 1) {
            for (const item of allItems) {
                if (item.cluster_id === clusterId) continue; // already correct
                await base44.asServiceRole.entities.FeedItem.update(item.id, { cluster_id: clusterId })
                    .catch(() => {});
                itemsAnnotated++;
                await sleep(30); // micro-delay to avoid rate limits on bulk writes
            }
        }

        await sleep(BATCH_WRITE_DELAY_MS);
    }

    // ── 6. Mark old clusters stale ────────────────────────────────────────────
    const staleThreshold = new Date(Date.now() - windowHours * 2 * 3600 * 1000).toISOString();
    let markedStale = 0;
    try {
        const stale = await base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'active', last_updated_at: { $lt: staleThreshold } },
            '-last_updated_at',
            200
        ) || [];
        for (const s of stale) {
            await base44.asServiceRole.entities.StoryCluster.update(s.id, { status: 'stale' }).catch(() => {});
            markedStale++;
            await sleep(50);
        }
    } catch (e) {
        console.warn(`[clusterStories] Stale sweep failed: ${e.message}`);
    }

    const runDurationMs = Date.now() - runStartMs;
    const summary = {
        total_items_processed: items.length,
        total_clusters: rawClusters.length,
        multi_article_clusters: rawClusters.filter(c => c.members.length > 1).length,
        clusters_created: created,
        clusters_updated: updated,
        items_annotated: itemsAnnotated,
        clusters_marked_stale: markedStale,
        run_duration_ms: runDurationMs,
        window_hours: windowHours,
    };

    console.log(`[clusterStories] DONE — ${JSON.stringify(summary)}`);
    return Response.json({ success: true, ...summary });
});