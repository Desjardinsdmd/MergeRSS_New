import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * seedAuthorityAndBackfill — one-time admin function.
 * Actions (pass action in body):
 *   "seed_authority" — Updates SourceAuthority records with proper tier assignments
 *   "backfill_7d"    — Re-scores last 7 days of FeedItems using new multi-lens enrichment
 */

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Tier assignments per user spec
const TIER1_DOMAINS = new Set([
    'bankofcanada.ca', 'osfi-bsif.gc.ca', 'cmhc-schl.gc.ca',
    'cbre.ca', 'cbre.com', 'jll.com', 'colliers.com', 'avisonyoung.com',
    'altusgroup.com', 'urbanation.ca', 'irei.com',
    'perenews.com', 'ipe.com', 'realassets.ipe.com',
    'ft.com', 'economist.com',
    'stratechery.com', 'marginalrevolution.com',
    'foreignaffairs.com',
    'mckinsey.com',
    'oxfordeconomics.com',
    'schneier.com', 'krebsonsecurity.com',
    'technologyreview.com',
    'cbinsights.com', 'theinformation.com', 'pitchbook.com',
    'benchmark.com',
    'crefc.org',
    'rentals.ca',
]);

const TIER3_DOMAINS = new Set([
    'news.google.com', 'google.com',
    'news.ycombinator.com', 'ycombinator.com',
    'reddit.com', 'old.reddit.com',
    'producthunt.com',
    'mashable.com',
    'slashdot.org',
    'flipboard.com', 'feedly.com', 'alltop.com',
    'medium.com',
]);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin required' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const action = body.action;

        if (action === 'seed_authority') {
            // Load all feeds
            const feeds = extractItems(await base44.asServiceRole.entities.Feed.filter(
                { status: 'active' }, '-created_date', 500
            ));
            // Load existing authority records
            const existing = extractItems(await base44.asServiceRole.entities.SourceAuthority.list('-created_date', 500));
            const existingByDomain = {};
            for (const a of existing) { existingByDomain[a.domain?.toLowerCase()] = a; }

            let updated = 0, created = 0;

            for (const feed of feeds) {
                let domain;
                try {
                    domain = new URL(feed.url || '').hostname.replace(/^www\./, '').toLowerCase();
                } catch { continue; }

                const tier = TIER1_DOMAINS.has(domain) ? 'tier1'
                    : TIER3_DOMAINS.has(domain) ? 'tier3' : 'tier2';
                const score = tier === 'tier1' ? 85 : tier === 'tier3' ? 40 : 60;

                const existingRecord = existingByDomain[domain];
                if (existingRecord) {
                    // Update if different
                    if (existingRecord.tier !== tier || existingRecord.authority_score !== score) {
                        await base44.asServiceRole.entities.SourceAuthority.update(existingRecord.id, {
                            tier, authority_score: score,
                            feed_id: feed.id, feed_name: feed.name,
                            is_manual_override: true,
                            auto_score_basis: `manual_${tier}`,
                            last_evaluated_at: new Date().toISOString(),
                        });
                        updated++;
                    }
                } else {
                    // Create new
                    await base44.asServiceRole.entities.SourceAuthority.create({
                        domain, tier, authority_score: score,
                        feed_id: feed.id, feed_name: feed.name,
                        is_manual_override: true,
                        auto_score_basis: `manual_${tier}`,
                        last_evaluated_at: new Date().toISOString(),
                    });
                    created++;
                }
                await sleep(50);
            }

            return Response.json({ action: 'seed_authority', updated, created, feeds_processed: feeds.length });
        }

        if (action === 'backfill_7d') {
            const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const feeds = extractItems(await base44.entities.Feed.filter(
                { created_by: user.email, status: 'active' }, '-created_date', 500
            ));
            const feedIds = feeds.map(f => f.id);

            const items = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
                { feed_id: { $in: feedIds }, published_date: { $gte: since7d } },
                '-published_date', 500
            ));

            console.log(`[backfill] Found ${items.length} items from last 7 days to re-score`);

            // Capture before-state for report
            const beforeSamples = items.slice(0, 5).map(i => ({
                id: i.id, title: (i.title || '').slice(0, 80),
                before_score: i.importance_score, before_tag: i.intelligence_tag,
            }));

            // Process in batches of 15 via enrichFeedItems with force_rescore
            let totalEnriched = 0, totalFailed = 0;
            const batchSize = 15;
            for (let i = 0; i < items.length; i += batchSize) {
                const batchIds = items.slice(i, i + batchSize).map(item => item.id);
                try {
                    const res = await base44.asServiceRole.functions.invoke('enrichFeedItems', {
                        item_ids: batchIds,
                        force_rescore: true,
                    });
                    totalEnriched += res?.enriched || 0;
                    totalFailed += res?.failed || 0;
                    console.log(`[backfill] Batch ${Math.floor(i/batchSize)+1}: enriched=${res?.enriched} failed=${res?.failed}`);
                } catch (e) {
                    console.error(`[backfill] Batch error:`, e.message);
                    totalFailed += batchIds.length;
                }
                await sleep(2000); // Rate limit between batches
            }

            // Fetch after-state for the same 5 samples
            const afterSamples = [];
            for (const s of beforeSamples) {
                try {
                    const updated = extractItems(await base44.asServiceRole.entities.FeedItem.filter(
                        { id: s.id }, '-created_date', 1
                    ));
                    if (updated[0]) {
                        afterSamples.push({
                            ...s,
                            after_score: updated[0].importance_score,
                            after_tag: updated[0].intelligence_tag,
                            after_lens: updated[0].scoring_lens,
                        });
                    }
                } catch {}
            }

            return Response.json({
                action: 'backfill_7d',
                total_items: items.length,
                enriched: totalEnriched,
                failed: totalFailed,
                sample_comparisons: afterSamples,
            });
        }

        return Response.json({ error: 'Unknown action. Use "seed_authority" or "backfill_7d"' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});