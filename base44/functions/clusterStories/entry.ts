/**
 * clusterStories — hardened downstream story clustering layer.
 *
 * Key improvements over v1:
 * - Stable cluster fingerprint (keyword set hash + date bucket), not just normalized title
 * - Stale cluster reactivation — resurfacing stories reconnect to prior cluster
 * - Singletons are always assigned a cluster (cluster_id is universal)
 * - Explicit reassignment policy with previous_cluster_id logging
 * - Blended importance score = LLM base + structural multiplier
 * - Publisher suffix stripping for better title normalization
 * - Extended time window for strong-similarity matches
 * - Broad-topic over-merge guard (min meaningful keyword count)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ── Tuning constants ──────────────────────────────────────────────────────────
const PRIMARY_WINDOW_HOURS   = 24;   // standard clustering window
const EXTENDED_WINDOW_HOURS  = 48;   // extended window for high-similarity matches (≥0.60)
const PRIMARY_THRESHOLD      = 0.40; // Jaccard similarity to join a cluster
const EXTENDED_THRESHOLD     = 0.60; // higher bar required for extended-window matches
const STALE_REACTIVATE_THRESHOLD = 0.55; // min similarity to reactivate a stale cluster
const STALE_WINDOW_HOURS     = 72;   // how far back to search for reactivatable stale clusters
const MIN_KEYWORDS_FOR_CLUSTER = 2;  // guard against broad-topic over-merging
const MAX_ITEMS_TO_CLUSTER   = 2000;
const BATCH_WRITE_DELAY_MS   = 100;
const ITEM_WRITE_DELAY_MS    = 25;

// ── Stop words ────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
    'that', 'this', 'with', 'from', 'have', 'will', 'been', 'says', 'said',
    'after', 'over', 'their', 'what', 'about', 'which', 'when', 'could',
    'year', 'years', 'more', 'than', 'into', 'would', 'there', 'they',
    'report', 'reports', 'first', 'news', 'update', 'latest', 'breaking',
    'week', 'today', 'just', 'like', 'time', 'also', 'were', 'make',
    'says', 'show', 'shows', 'using', 'used', 'amid', 'amid', 'over',
    'here', 'your', 'these', 'those', 'some', 'than', 'been', 'being',
]);

// Common publisher suffixes to strip from titles before comparison
const PUBLISHER_SUFFIX_RE = /[\|\-–—]\s*[A-Z][a-zA-Z\s&\.]{2,40}$/;
// Boilerplate openers to strip
const BOILERPLATE_OPENER_RE = /^(exclusive|breaking|watch|listen|read|analysis|opinion|explainer)[:\s]+/i;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Title normalization (improved) ────────────────────────────────────────────
function normalizeTitle(title = '') {
    return title
        .replace(PUBLISHER_SUFFIX_RE, '')      // strip " | Reuters", " - Bloomberg" etc.
        .replace(BOILERPLATE_OPENER_RE, '')    // strip "BREAKING: ", "Analysis: " etc.
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractKeywords(title = '') {
    const norm = normalizeTitle(title);
    return norm
        .split(' ')
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
}

function jaccardSimilarity(setA, setB) {
    if (!setA.size || !setB.size) return 0;
    let intersection = 0;
    for (const w of setA) if (setB.has(w)) intersection++;
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function extractDomain(url = '') {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url.slice(0, 40) || 'unknown'; }
}

// ── Cluster fingerprint ───────────────────────────────────────────────────────
// Built from sorted top-keywords + date bucket.
// This is the stable identity key — does NOT depend on which article is "primary".
function buildFingerprint(keywords, publishedMs) {
    const dateBucket = new Date(publishedMs).toISOString().slice(0, 10); // YYYY-MM-DD
    const topWords = [...keywords].sort().slice(0, 8).join(',');
    return `${dateBucket}:${topWords}`;
}

// Fingerprint similarity: Jaccard on the keyword portion of each fingerprint
function fingerprintSimilarity(fpA, fpB) {
    const wordsA = new Set(fpA.split(':')[1]?.split(',') || []);
    const wordsB = new Set(fpB.split(':')[1]?.split(',') || []);
    return jaccardSimilarity(wordsA, wordsB);
}

// ── Primary selection ─────────────────────────────────────────────────────────
function choosePrimary(items) {
    return items.reduce((best, cur) => {
        const bestScore = best.importance_score ?? 0;
        const curScore  = cur.importance_score ?? 0;
        if (curScore > bestScore) return cur;
        if (curScore === bestScore && cur.ai_summary && !best.ai_summary) return cur;
        return best;
    });
}

// ── Blended importance score ──────────────────────────────────────────────────
// Base = LLM score of primary article (or 50 fallback).
// Structural boost: source diversity + cluster size + recency.
// Final = clamp(base * 0.6 + structural * 0.4, 0, 100)
function computeBlendedImportance(primaryItem, allItems, sourceDomains) {
    const llmBase = primaryItem.importance_score ?? 50;

    // Source diversity bonus: 0 (1 source) → 25 (5+ sources)
    const sourceFactor = Math.min(sourceDomains.length - 1, 4) * 6.25; // 0–25

    // Article count bonus: 0 (1 article) → 15 (6+ articles)
    const countFactor = Math.min(allItems.length - 1, 5) * 3; // 0–15

    // Recency: freshest article in cluster — bonus 0–10 based on how recent
    const newestMs = Math.max(...allItems.map(i => i.published_date ? new Date(i.published_date).getTime() : 0));
    const hoursOld = (Date.now() - newestMs) / 3600000;
    const recencyFactor = Math.max(0, 10 - hoursOld / 2.4); // 10 @ 0h → 0 @ 24h

    const structural = sourceFactor + countFactor + recencyFactor; // 0–50

    return Math.round(Math.min(100, llmBase * 0.6 + structural * 0.4));
}

// ─────────────────────────────────────────────────────────────────────────────

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

    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch { /* scheduled — allow */ }

    let body = {};
    try { body = await req.json(); } catch {}
    const windowHours = body.window_hours || PRIMARY_WINDOW_HOURS;
    const dryRun = body.dry_run === true;

    const runStartMs = Date.now();
    const windowStart = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const extendedWindowStart = new Date(Date.now() - EXTENDED_WINDOW_HOURS * 3600 * 1000).toISOString();
    const staleWindowStart = new Date(Date.now() - STALE_WINDOW_HOURS * 3600 * 1000).toISOString();

    // ── 1. Load recent feed items ─────────────────────────────────────────────
    let items = [];
    try {
        const raw = await base44.asServiceRole.entities.FeedItem.filter(
            { published_date: { $gte: extendedWindowStart } },
            '-published_date',
            MAX_ITEMS_TO_CLUSTER
        );
        // Guard: API may return a paginated object instead of array for very large result sets
        items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? []);
    } catch (e) {
        return Response.json({ error: `Failed to load items: ${e.message}` }, { status: 500 });
    }

    if (!Array.isArray(items)) {
        return Response.json({ error: 'FeedItem query returned unexpected format — aborting' }, { status: 500 });
    }

    console.log(`[clusterStories] Loaded ${items.length} items from last ${EXTENDED_WINDOW_HOURS}h`);
    if (items.length === 0) {
        return Response.json({ success: true, message: 'No items in window' });
    }

    // ── 2. Pre-compute metadata per item ─────────────────────────────────────
    const itemMeta = items.map(item => {
        const keywords = new Set(extractKeywords(item.title || ''));
        const publishedMs = item.published_date ? new Date(item.published_date).getTime() : Date.now();
        const domain = item.url ? extractDomain(item.url) : (item.feed_id || 'unknown');
        const fingerprint = buildFingerprint(keywords, publishedMs);
        return { item, keywords, publishedMs, domain, fingerprint };
    });

    // Sort: newest first — gives freshest article priority as pivot/primary
    itemMeta.sort((a, b) => b.publishedMs - a.publishedMs);

    // ── 3. Greedy clustering with time-gating + extended window ──────────────
    const assigned = new Set();
    const rawClusters = []; // { pivot, members: [itemMeta] }

    for (let i = 0; i < itemMeta.length; i++) {
        const pivot = itemMeta[i];
        if (assigned.has(pivot.item.id)) continue;

        // Guard: skip merging if too few keywords (broad topic → singleton)
        if (pivot.keywords.size < MIN_KEYWORDS_FOR_CLUSTER) {
            assigned.add(pivot.item.id);
            rawClusters.push({ pivot, members: [pivot] });
            continue;
        }

        assigned.add(pivot.item.id);
        const members = [pivot];

        for (let j = i + 1; j < itemMeta.length; j++) {
            const candidate = itemMeta[j];
            if (assigned.has(candidate.item.id)) continue;

            const timeDiffHours = Math.abs(pivot.publishedMs - candidate.publishedMs) / 3600000;
            const sim = jaccardSimilarity(pivot.keywords, candidate.keywords);

            // Primary window: standard threshold
            if (timeDiffHours <= windowHours && sim >= PRIMARY_THRESHOLD && candidate.keywords.size >= MIN_KEYWORDS_FOR_CLUSTER) {
                members.push(candidate);
                assigned.add(candidate.item.id);
                continue;
            }
            // Extended window: higher similarity required
            if (timeDiffHours <= EXTENDED_WINDOW_HOURS && sim >= EXTENDED_THRESHOLD && candidate.keywords.size >= MIN_KEYWORDS_FOR_CLUSTER) {
                members.push(candidate);
                assigned.add(candidate.item.id);
            }
        }

        rawClusters.push({ pivot, members });
    }

    console.log(`[clusterStories] Formed ${rawClusters.length} raw clusters (${rawClusters.filter(c => c.members.length > 1).length} multi-article)`);

    if (dryRun) {
        const preview = rawClusters
            .filter(c => c.members.length > 1)
            .slice(0, 20)
            .map(c => ({
                representative: c.pivot.item.title,
                article_count: c.members.length,
                sources: [...new Set(c.members.map(m => m.domain))],
                fingerprint: c.pivot.fingerprint,
                titles: c.members.map(m => m.item.title),
            }));
        return Response.json({
            dry_run: true,
            total_items: items.length,
            total_clusters: rawClusters.length,
            multi_article_clusters: rawClusters.filter(c => c.members.length > 1).length,
            singletons: rawClusters.filter(c => c.members.length === 1).length,
            preview,
        });
    }

    // ── 4. Load existing active + stale clusters for upsert matching ──────────
    let activeClusters = [], staleClusters = [];
    try {
        activeClusters = await base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'active' }, '-last_updated_at', 500
        ) || [];
        staleClusters = await base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'stale', last_updated_at: { $gte: staleWindowStart } },
            '-last_updated_at', 200
        ) || [];
    } catch (e) {
        console.warn(`[clusterStories] Could not load existing clusters: ${e.message}`);
    }

    // Index: fingerprint → cluster record
    const activeByFingerprint = {};
    for (const ec of activeClusters) {
        if (ec.cluster_fingerprint) activeByFingerprint[ec.cluster_fingerprint] = ec;
    }

    // ── 5. Persist clusters ───────────────────────────────────────────────────
    let created = 0, updated = 0, reactivated = 0, itemsAnnotated = 0, reassigned = 0;

    for (const { pivot, members } of rawClusters) {
        const allItems = members.map(m => m.item);
        const allKeywords = new Set(members.flatMap(m => [...m.keywords]));
        const primary = choosePrimary(allItems);
        const articleIds = allItems.map(i => i.id);
        const feedIds = [...new Set(allItems.map(i => i.feed_id).filter(Boolean))];
        const sourceDomains = [...new Set(members.map(m => m.domain).filter(Boolean))];
        const publishedTimes = members.map(m => m.publishedMs).filter(isFinite);
        const firstSeenMs = Math.min(...publishedTimes);
        const lastUpdatedMs = Math.max(...publishedTimes);
        const intelligenceTag = allItems.find(i => i.intelligence_tag && i.intelligence_tag !== 'Neutral')?.intelligence_tag || 'Neutral';
        const category = primary.category || allItems.find(i => i.category)?.category || null;

        // Compute fingerprint for this cluster (based on merged keyword set + date bucket of pivot)
        const clusterFingerprint = buildFingerprint(allKeywords, pivot.publishedMs);
        const blendedImportance = computeBlendedImportance(primary, allItems, sourceDomains);

        const clusterData = {
            representative_title: primary.title || 'Untitled',
            normalized_title: normalizeTitle(primary.title || ''),
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
            importance_score: blendedImportance,
            intelligence_tag: intelligenceTag,
            cluster_window_hours: windowHours,
            cluster_fingerprint: clusterFingerprint,
            status: 'active',
        };

        let clusterId = null;
        let matchedExisting = null;

        // ── Upsert strategy ─────────────────────────────────────────────────
        // Priority 1: exact fingerprint match (same keywords + date bucket)
        if (activeByFingerprint[clusterFingerprint]) {
            matchedExisting = activeByFingerprint[clusterFingerprint];
        }

        // Priority 2: fuzzy fingerprint match among active clusters (handles representative changes)
        if (!matchedExisting) {
            let bestSim = 0;
            let bestMatch = null;
            for (const ec of activeClusters) {
                if (!ec.cluster_fingerprint) continue;
                const sim = fingerprintSimilarity(clusterFingerprint, ec.cluster_fingerprint);
                if (sim >= 0.65 && sim > bestSim) {
                    bestSim = sim;
                    bestMatch = ec;
                }
            }
            if (bestMatch) matchedExisting = bestMatch;
        }

        // Priority 3: reactivate a matching stale cluster
        let reactivatedFrom = null;
        if (!matchedExisting) {
            let bestSim = 0;
            let bestStale = null;
            for (const sc of staleClusters) {
                if (!sc.cluster_fingerprint) continue;
                const sim = fingerprintSimilarity(clusterFingerprint, sc.cluster_fingerprint);
                if (sim >= STALE_REACTIVATE_THRESHOLD && sim > bestSim) {
                    bestSim = sim;
                    bestStale = sc;
                }
            }
            if (bestStale) {
                matchedExisting = bestStale;
                reactivatedFrom = bestStale.id;
            }
        }

        if (matchedExisting) {
            try {
                const updatePayload = {
                    ...clusterData,
                    ...(reactivatedFrom ? {
                        reactivated_from_id: reactivatedFrom,
                        reactivation_count: (matchedExisting.reactivation_count || 0) + 1,
                    } : {}),
                };
                await base44.asServiceRole.entities.StoryCluster.update(matchedExisting.id, updatePayload);
                clusterId = matchedExisting.id;
                // Keep index fresh
                activeByFingerprint[clusterFingerprint] = { ...matchedExisting, id: matchedExisting.id };
                if (reactivatedFrom) reactivated++;
                else updated++;
            } catch (e) {
                console.warn(`[clusterStories] Update failed for "${primary.title}": ${e.message}`);
            }
        } else {
            try {
                const newCluster = await base44.asServiceRole.entities.StoryCluster.create(clusterData);
                clusterId = newCluster?.id;
                if (clusterId) activeByFingerprint[clusterFingerprint] = { id: clusterId, cluster_fingerprint: clusterFingerprint };
                created++;
            } catch (e) {
                console.warn(`[clusterStories] Create failed for "${primary.title}": ${e.message}`);
            }
        }

        // ── Back-annotate FeedItems (ALL items, including singletons) ────────
        if (clusterId) {
            for (const item of allItems) {
                if (item.cluster_id === clusterId) continue; // no change needed

                const wasReassigned = !!item.cluster_id && item.cluster_id !== clusterId;
                const updatePayload = { cluster_id: clusterId };
                if (wasReassigned) {
                    updatePayload.previous_cluster_id = item.cluster_id;
                    reassigned++;
                }
                await base44.asServiceRole.entities.FeedItem.update(item.id, updatePayload)
                    .catch(() => {});
                itemsAnnotated++;
                await sleep(ITEM_WRITE_DELAY_MS);
            }
        }

        await sleep(BATCH_WRITE_DELAY_MS);
    }

    // ── 6. Mark old clusters stale ────────────────────────────────────────────
    const staleThreshold = new Date(Date.now() - windowHours * 2 * 3600 * 1000).toISOString();
    let markedStale = 0;
    try {
        const toStale = await base44.asServiceRole.entities.StoryCluster.filter(
            { status: 'active', last_updated_at: { $lt: staleThreshold } },
            '-last_updated_at', 200
        ) || [];
        for (const s of toStale) {
            await base44.asServiceRole.entities.StoryCluster.update(s.id, { status: 'stale' }).catch(() => {});
            markedStale++;
            await sleep(50);
        }
    } catch (e) {
        console.warn(`[clusterStories] Stale sweep failed: ${e.message}`);
    }

    const summary = {
        total_items_processed: items.length,
        total_clusters: rawClusters.length,
        singletons: rawClusters.filter(c => c.members.length === 1).length,
        multi_article_clusters: rawClusters.filter(c => c.members.length > 1).length,
        clusters_created: created,
        clusters_updated: updated,
        clusters_reactivated: reactivated,
        clusters_marked_stale: markedStale,
        items_annotated: itemsAnnotated,
        items_reassigned: reassigned,
        run_duration_ms: Date.now() - runStartMs,
        window_hours: windowHours,
    };
    console.log(`[clusterStories] DONE — ${JSON.stringify(summary)}`);
    return Response.json({ success: true, ...summary });
});