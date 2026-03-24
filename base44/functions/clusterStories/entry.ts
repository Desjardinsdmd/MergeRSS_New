/**
 * clusterStories — hardened downstream story clustering layer.
 *
 * Architecture patterns enforced (see functions/lib.js):
 *   [1] extractItems()         — safe array extraction from any SDK response
 *   [2] safeFilter()           — wrapper for all entity reads
 *   [3] requireAdminOrScheduler() — consistent auth handling
 *   [4] runJob()               — lock, heartbeat, structured result
 *   [5] pipeline health classification — empty output is NOT success
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ── Shared utilities (inlined — see functions/lib.js for canonical patterns) ──

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'object') return [];
    if (Array.isArray(raw.items))   return raw.items;
    if (Array.isArray(raw.data))    return raw.data;
    if (Array.isArray(raw.results)) return raw.results;
    const found = Object.values(raw).find(v => Array.isArray(v));
    return found || [];
}

async function safeFilter(entity, query, sort, limit = 500) {
    return extractItems(await entity.filter(query, sort, limit));
}

async function requireAdminOrScheduler(base44) {
    try {
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
        }
        return { user: user || null };
    } catch {
        return { user: null };
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeRunId() { return `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// ── Tuning constants ──────────────────────────────────────────────────────────
const PRIMARY_WINDOW_HOURS       = 24;
const EXTENDED_WINDOW_HOURS      = 48;
const PRIMARY_THRESHOLD          = 0.40;
const EXTENDED_THRESHOLD         = 0.60;
const STALE_REACTIVATE_THRESHOLD = 0.55;
const STALE_WINDOW_HOURS         = 72;
const MIN_KEYWORDS_FOR_CLUSTER   = 2;
const FETCH_LIMIT                = 500;
const BATCH_WRITE_DELAY_MS       = 200;
const ITEM_WRITE_DELAY_MS        = 200;
const ITEM_WRITE_BATCH_SIZE      = 10;
const ITEM_WRITE_BATCH_PAUSE_MS  = 500;
const LOCK_WINDOW_MS             = 10 * 60 * 1000;
const ZOMBIE_TTL_MS              = 15 * 60 * 1000;

const STOP_WORDS = new Set([
    'that','this','with','from','have','will','been','says','said',
    'after','over','their','what','about','which','when','could',
    'year','years','more','than','into','would','there','they',
    'report','reports','first','news','update','latest','breaking',
    'week','today','just','like','time','also','were','make',
    'show','shows','using','used','amid','here','your','these',
    'those','some','being',
]);
const PUBLISHER_SUFFIX_RE = /[\|\-–—]\s*[A-Z][a-zA-Z\s&\.]{2,40}$/;
const BOILERPLATE_OPENER_RE = /^(exclusive|breaking|watch|listen|read|analysis|opinion|explainer)[:\s]+/i;

// ── NLP helpers ───────────────────────────────────────────────────────────────
function normalizeTitle(title = '') {
    return title
        .replace(PUBLISHER_SUFFIX_RE, '')
        .replace(BOILERPLATE_OPENER_RE, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractKeywords(title = '') {
    return normalizeTitle(title).split(' ').filter(w => w.length >= 4 && !STOP_WORDS.has(w));
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
function buildFingerprint(keywords, publishedMs) {
    const dateBucket = new Date(publishedMs).toISOString().slice(0, 10);
    const topWords = [...keywords].sort().slice(0, 8).join(',');
    return `${dateBucket}:${topWords}`;
}
function fingerprintSimilarity(fpA, fpB) {
    const wordsA = new Set(fpA.split(':')[1]?.split(',') || []);
    const wordsB = new Set(fpB.split(':')[1]?.split(',') || []);
    return jaccardSimilarity(wordsA, wordsB);
}
function choosePrimary(items) {
    return items.reduce((best, cur) => {
        const bestScore = best.importance_score ?? 0;
        const curScore  = cur.importance_score ?? 0;
        if (curScore > bestScore) return cur;
        if (curScore === bestScore && cur.ai_summary && !best.ai_summary) return cur;
        return best;
    });
}
function computeBlendedImportance(primaryItem, allItems, sourceDomains) {
    const llmBase = primaryItem.importance_score ?? 50;
    const sourceFactor = Math.min(sourceDomains.length - 1, 4) * 6.25;
    const countFactor = Math.min(allItems.length - 1, 5) * 3;
    const newestMs = Math.max(...allItems.map(i => i.published_date ? new Date(i.published_date).getTime() : 0));
    const hoursOld = (Date.now() - newestMs) / 3600000;
    const recencyFactor = Math.max(0, 10 - hoursOld / 2.4);
    const structural = sourceFactor + countFactor + recencyFactor;
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
        } catch (e) {
            return Response.json({ error: `SDK boot failed: ${e.message}` }, { status: 500 });
        }
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { error: authError } = await requireAdminOrScheduler(base44);
    if (authError) return authError;

    let body = {};
    try { body = await req.json(); } catch {}
    const windowHours = body.window_hours || PRIMARY_WINDOW_HOURS;
    const dryRun = body.dry_run === true;
    const instanceId = makeRunId();

    // ── Lock ──────────────────────────────────────────────────────────────────
    const activeLocks = await safeFilter(
        base44.asServiceRole.entities.SystemHealth,
        { job_type: 'clustering', status: 'running' },
        '-started_at', 5
    );
    for (const stale of activeLocks) {
        const age = Date.now() - new Date(stale.started_at).getTime();
        if (age >= ZOMBIE_TTL_MS) {
            await base44.asServiceRole.entities.SystemHealth.update(stale.id, {
                status: 'failed', completed_at: new Date().toISOString(),
                error_message: `Zombie reclaimed by ${instanceId}`,
            }).catch(() => {});
        }
    }
    const liveLock = activeLocks.find(r => {
        const age = Date.now() - new Date(r.started_at).getTime();
        return age < LOCK_WINDOW_MS;
    });
    if (liveLock && !dryRun) {
        return Response.json({ skipped: true, reason: 'Another clustering run is active' });
    }

    let lockRecord = null;
    let heartbeatTimer = null;
    if (!dryRun) {
        try {
            lockRecord = await base44.asServiceRole.entities.SystemHealth.create({
                job_type: 'clustering', status: 'running',
                started_at: new Date().toISOString(),
                metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString() },
            });
            heartbeatTimer = setInterval(() => {
                base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                    metadata: { instance_id: instanceId, last_heartbeat_at: new Date().toISOString() },
                }).catch(() => {});
            }, 60000);
        } catch {}
    }

    const runStartMs = Date.now();
    const windowStart = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const staleWindowStart = new Date(Date.now() - STALE_WINDOW_HOURS * 3600 * 1000).toISOString();

    // ── 1. Load recent feed items — hard-capped to avoid envelope responses ───
    const items = await safeFilter(
        base44.asServiceRole.entities.FeedItem,
        { published_date: { $gte: windowStart } },
        '-published_date',
        FETCH_LIMIT
    );

    console.log(`[clusterStories][${instanceId}] Loaded ${items.length} items from last ${windowHours}h (cap=${FETCH_LIMIT})`);

    if (items.length === 0) {
        clearInterval(heartbeatTimer);
        if (lockRecord?.id) {
            await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
                status: 'completed', completed_at: new Date().toISOString(),
                // ── PIPELINE HEALTH: zero items is DEGRADED, not success ──────
                metadata: {
                    instance_id: instanceId, total_items_processed: 0,
                    pipeline_health: 'degraded',
                    pipeline_note: 'No items found in window — check fetchFeeds upstream',
                },
            }).catch(() => {});
        }
        return Response.json({
            success: true,
            pipeline_health: 'degraded',
            message: 'No items in window — check fetchFeeds upstream',
            total_items_processed: 0,
        });
    }

    // ── 2. Pre-compute metadata per item ─────────────────────────────────────
    const itemMeta = items.map(item => {
        const keywords = new Set(extractKeywords(item.title || ''));
        const publishedMs = item.published_date ? new Date(item.published_date).getTime() : Date.now();
        const domain = item.url ? extractDomain(item.url) : (item.feed_id || 'unknown');
        const fingerprint = buildFingerprint(keywords, publishedMs);
        return { item, keywords, publishedMs, domain, fingerprint };
    });
    itemMeta.sort((a, b) => b.publishedMs - a.publishedMs);

    // ── 3. Greedy clustering ──────────────────────────────────────────────────
    const assigned = new Set();
    const rawClusters = [];
    for (let i = 0; i < itemMeta.length; i++) {
        const pivot = itemMeta[i];
        if (assigned.has(pivot.item.id)) continue;
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
            if (timeDiffHours <= windowHours && sim >= PRIMARY_THRESHOLD && candidate.keywords.size >= MIN_KEYWORDS_FOR_CLUSTER) {
                members.push(candidate); assigned.add(candidate.item.id); continue;
            }
            if (timeDiffHours <= EXTENDED_WINDOW_HOURS && sim >= EXTENDED_THRESHOLD && candidate.keywords.size >= MIN_KEYWORDS_FOR_CLUSTER) {
                members.push(candidate); assigned.add(candidate.item.id);
            }
        }
        rawClusters.push({ pivot, members });
    }

    console.log(`[clusterStories][${instanceId}] Formed ${rawClusters.length} raw clusters (${rawClusters.filter(c => c.members.length > 1).length} multi-article)`);

    if (dryRun) {
        const preview = rawClusters.filter(c => c.members.length > 1).slice(0, 20).map(c => ({
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

    // ── 4. Load existing clusters for upsert ──────────────────────────────────
    const activeClusters = await safeFilter(
        base44.asServiceRole.entities.StoryCluster,
        { status: 'active' }, '-last_updated_at', 500
    );
    const staleClusters = await safeFilter(
        base44.asServiceRole.entities.StoryCluster,
        { status: 'stale', last_updated_at: { $gte: staleWindowStart } },
        '-last_updated_at', 200
    );

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

        if (activeByFingerprint[clusterFingerprint]) {
            matchedExisting = activeByFingerprint[clusterFingerprint];
        }
        if (!matchedExisting) {
            let bestSim = 0, bestMatch = null;
            for (const ec of activeClusters) {
                if (!ec.cluster_fingerprint) continue;
                const sim = fingerprintSimilarity(clusterFingerprint, ec.cluster_fingerprint);
                if (sim >= 0.65 && sim > bestSim) { bestSim = sim; bestMatch = ec; }
            }
            if (bestMatch) matchedExisting = bestMatch;
        }
        let reactivatedFrom = null;
        if (!matchedExisting) {
            let bestSim = 0, bestStale = null;
            for (const sc of staleClusters) {
                if (!sc.cluster_fingerprint) continue;
                const sim = fingerprintSimilarity(clusterFingerprint, sc.cluster_fingerprint);
                if (sim >= STALE_REACTIVATE_THRESHOLD && sim > bestSim) { bestSim = sim; bestStale = sc; }
            }
            if (bestStale) { matchedExisting = bestStale; reactivatedFrom = bestStale.id; }
        }

        if (matchedExisting) {
            let writeOk = false;
            for (let attempt = 0; attempt < 3 && !writeOk; attempt++) {
                try {
                    await base44.asServiceRole.entities.StoryCluster.update(matchedExisting.id, {
                        ...clusterData,
                        ...(reactivatedFrom ? {
                            reactivated_from_id: reactivatedFrom,
                            reactivation_count: (matchedExisting.reactivation_count || 0) + 1,
                        } : {}),
                    });
                    writeOk = true;
                } catch (e) {
                    if (e.message?.includes('429') || e.message?.includes('Rate limit')) {
                        await sleep(BATCH_WRITE_DELAY_MS * Math.pow(2, attempt + 1));
                    } else {
                        console.warn(`[clusterStories] Update failed: ${e.message}`);
                        break;
                    }
                }
            }
            if (writeOk) {
                clusterId = matchedExisting.id;
                activeByFingerprint[clusterFingerprint] = { ...matchedExisting, id: matchedExisting.id };
                if (reactivatedFrom) reactivated++; else updated++;
            }
        } else {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const newCluster = await base44.asServiceRole.entities.StoryCluster.create(clusterData);
                    clusterId = newCluster?.id;
                    if (clusterId) { activeByFingerprint[clusterFingerprint] = { id: clusterId, cluster_fingerprint: clusterFingerprint }; created++; }
                    break;
                } catch (e) {
                    if ((e.message?.includes('429') || e.message?.includes('Rate limit')) && attempt < 2) {
                        await sleep(BATCH_WRITE_DELAY_MS * Math.pow(2, attempt + 1));
                    } else {
                        console.warn(`[clusterStories] Create failed: ${e.message}`);
                        break;
                    }
                }
            }
        }

        // Only annotate items for multi-article clusters — singletons provide no grouping signal
        // and generate unnecessary write volume (the primary cause of 429 storms).
        if (clusterId && allItems.length > 1) {
            const itemsNeedingUpdate = allItems.filter(item => item.cluster_id !== clusterId);
            for (let wi = 0; wi < itemsNeedingUpdate.length; wi++) {
                const item = itemsNeedingUpdate[wi];
                const wasReassigned = !!item.cluster_id && item.cluster_id !== clusterId;
                const updatePayload = { cluster_id: clusterId };
                if (wasReassigned) { updatePayload.previous_cluster_id = item.cluster_id; reassigned++; }
                let writeOk = false;
                for (let attempt = 0; attempt < 3 && !writeOk; attempt++) {
                    try {
                        await base44.asServiceRole.entities.FeedItem.update(item.id, updatePayload);
                        writeOk = true;
                    } catch (e) {
                        if (e.message?.includes('429') || e.message?.includes('Rate limit')) {
                            await sleep(ITEM_WRITE_DELAY_MS * Math.pow(2, attempt + 1));
                        } else {
                            break;
                        }
                    }
                }
                if (writeOk) itemsAnnotated++;
                await sleep(ITEM_WRITE_DELAY_MS);
                // Extra pause every ITEM_WRITE_BATCH_SIZE writes
                if ((wi + 1) % ITEM_WRITE_BATCH_SIZE === 0) await sleep(ITEM_WRITE_BATCH_PAUSE_MS);
            }
        }
        await sleep(BATCH_WRITE_DELAY_MS);
    }

    // ── 6. Mark old clusters stale ────────────────────────────────────────────
    const staleThreshold = new Date(Date.now() - windowHours * 2 * 3600 * 1000).toISOString();
    let markedStale = 0;
    const toStale = await safeFilter(
        base44.asServiceRole.entities.StoryCluster,
        { status: 'active', last_updated_at: { $lt: staleThreshold } },
        '-last_updated_at', 200
    );
    for (const s of toStale) {
        await base44.asServiceRole.entities.StoryCluster.update(s.id, { status: 'stale' }).catch(() => {});
        markedStale++;
        await sleep(50);
    }

    // ── Pipeline health classification ────────────────────────────────────────
    // Healthy = at least some multi-article grouping occurred.
    // All-singleton output (no grouping) is 'degraded' — it means clustering produced no signal.
    const multiArticleCount = rawClusters.filter(c => c.members.length > 1).length;
    const pipelineHealth = multiArticleCount > 0 ? 'healthy' : (items.length > 0 ? 'degraded' : 'degraded');
    const pipelineNote = multiArticleCount === 0 && items.length > 0
        ? `Processed ${items.length} items but all were singletons — no story grouping occurred`
        : undefined;

    const summary = {
        total_items_processed: items.length,
        total_clusters: rawClusters.length,
        singletons: rawClusters.filter(c => c.members.length === 1).length,
        multi_article_clusters: multiArticleCount,
        clusters_created: created,
        clusters_updated: updated,
        clusters_reactivated: reactivated,
        clusters_marked_stale: markedStale,
        items_annotated: itemsAnnotated,
        items_reassigned: reassigned,
        run_duration_ms: Date.now() - runStartMs,
        window_hours: windowHours,
        pipeline_health: pipelineHealth,
        ...(pipelineNote ? { pipeline_note: pipelineNote } : {}),
        instance_id: instanceId,
    };

    console.log(`[clusterStories][${instanceId}] DONE — ${JSON.stringify(summary)}`);

    clearInterval(heartbeatTimer);
    if (lockRecord?.id) {
        await base44.asServiceRole.entities.SystemHealth.update(lockRecord.id, {
            status: 'completed', completed_at: new Date().toISOString(),
            metadata: summary,
        }).catch(() => {});
    }

    return Response.json({ success: true, ...summary });
});