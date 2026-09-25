import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * enrichArticles — scoring queue for the new Article model (shadow mode).
 *
 * Each Article is scored once, however many sources or users carry it.
 *
 * Queue rules:
 *   - Claims 'pending' Articles first seen 20 min to 48 h ago, oldest first, with a
 *     lease (enrich_lease_until + enrich_lease_owner, re-read to confirm). Leases
 *     that expire in 'processing' are reclaimed.
 *   - Pending Articles older than 48 h are marked 'skipped' and never sent to the
 *     LLM. This stops the migrated backlog (mostly job listings) from burning AI spend.
 *   - Shadow mode (adopt_legacy, default true): before calling the LLM, copy the
 *     score from a legacy FeedItem with the same URL that the old pipeline already
 *     enriched, plus its lens scores for lenses whose owner subscribes to a source
 *     carrying the article. The 20-min delay gives the old pipeline time to finish,
 *     so running both pipelines side by side does not double the AI bill.
 *   - Otherwise one LLM call per base lens batch, plus one per CustomLens whose
 *     owner subscribes to a source carrying the article. LensScores are written per
 *     owner; nothing crosses accounts.
 *
 * 45s budget, batches of 20. Admin / scheduler only.
 */

const BUDGET_MS = 45_000;
const BATCH = 20;
const LEASE_MS = 5 * 60_000;
const GRACE_MS = 20 * 60_000;
const MAX_AGE_MS = 48 * 3600_000;
const CHUNK = 100;

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

//__LENS_BLOCK__

const RESULT_SCHEMA = (withEntities) => ({
    type: 'object',
    properties: {
        results: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    index: { type: 'number' },
                    ai_summary: { type: 'string' },
                    importance_score: { type: 'number' },
                    intelligence_tag: { type: 'string', enum: ['Trending', 'Risk', 'Opportunity', 'Neutral'] },
                    ...(withEntities ? { entities: { type: 'array', items: { type: 'string' } } } : {}),
                },
                required: ['index', 'ai_summary', 'importance_score', 'intelligence_tag', ...(withEntities ? ['entities'] : [])],
            },
        },
    },
    required: ['results'],
});

async function skipStale(svc, cutoffIso, stats) {
    const stale = extractItems(await svc.Article.filter(
        { enrichment_status: 'pending', first_seen_at: { $lt: cutoffIso } }, 'first_seen_at', 200));
    for (const a of stale) await svc.Article.update(a.id, { enrichment_status: 'skipped' }).catch(() => {});
    stats.skipped_stale += stale.length;
}

async function claim(svc, runId) {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const window = { $gte: new Date(now - MAX_AGE_MS).toISOString(), $lte: new Date(now - GRACE_MS).toISOString() };
    const pending = extractItems(await svc.Article.filter({ enrichment_status: 'pending', first_seen_at: window }, 'first_seen_at', BATCH));
    const expired = pending.length < BATCH
        ? extractItems(await svc.Article.filter({ enrichment_status: 'processing', enrich_lease_until: { $lt: nowIso } }, 'first_seen_at', BATCH - pending.length))
        : [];
    const cands = [...pending, ...expired];
    if (!cands.length) return [];
    const lease = new Date(now + LEASE_MS).toISOString();
    for (const a of cands) await svc.Article.update(a.id, { enrichment_status: 'processing', enrich_lease_until: lease, enrich_lease_owner: runId });
    await sleep(300);
    const confirmed = extractItems(await svc.Article.filter({ id: { $in: cands.map(a => a.id) } }, 'first_seen_at', BATCH));
    return confirmed.filter(a => a.enrich_lease_owner === runId);
}

// Which users subscribe to which article (via SourceItem -> Subscription), with their per-subscription category/tags.
async function subscribersFor(svc, articles) {
    const links = [];
    for (const c of chunks(articles.map(a => a.id), CHUNK)) {
        links.push(...extractItems(await svc.SourceItem.filter({ article_id: { $in: c } }, '-created_date', CHUNK * 5)));
    }
    const sourceIds = [...new Set(links.map(l => l.source_id))];
    const subs = [];
    for (const c of chunks(sourceIds, CHUNK)) {
        subs.push(...extractItems(await svc.Subscription.filter({ source_id: { $in: c } }, 'created_date', 1000)));
    }
    const subsBySource = {};
    for (const s of subs) (subsBySource[s.source_id] ||= []).push(s);
    const byArticle = {};
    for (const l of links) (byArticle[l.article_id] ||= []).push(...(subsBySource[l.source_id] || []));
    return byArticle;
}

function lensMatches(lens, subs) {
    return subs.some(s => {
        if (s.user_email !== lens.created_by) return false;
        if (lens.feed_filter_categories?.length && !lens.feed_filter_categories.includes(s.category)) return false;
        if (lens.feed_filter_tags?.length) {
            const tags = (s.tags || []).map(t => String(t).toLowerCase());
            if (!lens.feed_filter_tags.some(t => tags.includes(String(t).toLowerCase()))) return false;
        }
        return true;
    });
}

Deno.serve(async (req) => {
    const t0 = Date.now();
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const adoptLegacy = body.adopt_legacy !== false;
    const svc = base44.asServiceRole.entities;
    const llm = base44.asServiceRole.integrations.Core.InvokeLLM;
    const runId = `ea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stats = { claimed: 0, adopted_legacy: 0, llm_scored: 0, llm_fallback: 0, lens_scores_written: 0, llm_calls: 0, skipped_stale: 0, errors: 0 };

    await skipStale(svc, new Date(Date.now() - MAX_AGE_MS).toISOString(), stats);

    const lenses = extractItems(await svc.CustomLens.filter({ is_active: true }, '-created_date', 200));
    const authority = {};
    for (const a of extractItems(await svc.SourceAuthority.list('-created_date', 500))) if (a.domain) authority[a.domain.toLowerCase()] = a;

    while (Date.now() - t0 < BUDGET_MS - 25_000) {
        const batch = await claim(svc, runId);
        if (!batch.length) break;
        stats.claimed += batch.length;

        const subsByArticle = await subscribersFor(svc, batch);
        const existingScores = new Set();
        for (const c of chunks(batch.map(a => a.id), CHUNK)) {
            for (const s of extractItems(await svc.LensScore.filter({ article_id: { $in: c } }, '-created_date', CHUNK * 5))) {
                existingScores.add(`${s.lens_id}|${s.article_id}`);
            }
        }
        const lensById = Object.fromEntries(lenses.map(l => [l.id, l]));
        const newScores = [];
        const addScore = (lens, article, r) => {
            const key = `${lens.id}|${article.id}`;
            if (existingScores.has(key)) return;
            existingScores.add(key);
            newScores.push({
                lens_id: lens.id, owner_email: lens.created_by, article_id: article.id,
                importance_score: Math.round(r.importance_score ?? 50), intelligence_tag: r.intelligence_tag || 'Neutral',
                ai_summary: r.ai_summary || '', structured_metadata: r.structured_metadata || {},
                scored_at: r.scored_at || new Date().toISOString(),
            });
        };

        // 1. Shadow mode: adopt scores the old pipeline already produced
        let toScore = batch;
        if (adoptLegacy) {
            const legacyByUrl = {};
            for (const c of chunks(batch.map(a => a.url).filter(Boolean), 50)) {
                for (const f of extractItems(await svc.FeedItem.filter({ url: { $in: c }, enrichment_status: { $in: ['done', 'fallback'] } }, '-created_date', 200))) {
                    if (!legacyByUrl[f.url]) legacyByUrl[f.url] = f;
                }
            }
            toScore = [];
            for (const a of batch) {
                const f = legacyByUrl[a.url];
                if (!f || f.importance_score == null) { toScore.push(a); continue; }
                try {
                    await svc.Article.update(a.id, {
                        ai_summary: f.ai_summary || '', importance_score: f.importance_score,
                        intelligence_tag: f.intelligence_tag || 'Neutral', scoring_lens: f.scoring_lens || '',
                        entities: f.entities || [], enrichment_status: f.enrichment_status,
                        enrichment_source: 'legacy', enrich_lease_until: new Date().toISOString(),
                    });
                    stats.adopted_legacy++;
                    const subs = subsByArticle[a.id] || [];
                    for (const cls of f.custom_lens_scores || []) {
                        const lens = lensById[cls.lens_id];
                        if (lens && lensMatches(lens, subs)) addScore(lens, a, cls);
                    }
                } catch (e) { stats.errors++; toScore.push(a); }
            }
        }

        // 2. Base scoring by lens
        const byLens = { TCU: [], AI_TECH: [], MACRO: [] };
        for (const a of toScore) byLens[pickLens(a.category, a.title, a.description, [])].push(a);
        for (const [lensKey, arts] of Object.entries(byLens)) {
            if (!arts.length) continue;
            const payload = arts.map((a, i) => ({ index: i, title: (a.title || '').slice(0, 200), description: (a.description || '').slice(0, 400), category: a.category || '', source: hostOf(a.url) }));
            let results = [], fallback = false;
            try {
                stats.llm_calls++;
                const r = await llm({
                    prompt: `${LENS_PROMPTS[lensKey]}

For each article below, return:
1. ai_summary: 2-3 sentences answering "So what?", ending with a clause like "...relevant because [lens-specific implication]." Do NOT just describe what happened.
2. importance_score: integer 0-100 scored strictly per the lens criteria above. Use the FULL range. Most routine articles should score 40-60. Only genuinely significant items score 70+.
3. intelligence_tag: one of "Trending", "Risk", "Opportunity", "Neutral". Apply the tag rules above strictly. Default to "Neutral" when in doubt.
4. entities: array of 2-6 named entities mentioned (companies, people, places, regulations, products). Proper names only.

Articles:
${JSON.stringify(payload, null, 2)}`,
                    response_json_schema: RESULT_SCHEMA(true),
                });
                results = r?.results || [];
            } catch (e) {
                fallback = true;
                results = arts.map((_, i) => ({ index: i, ai_summary: '', importance_score: 50, intelligence_tag: 'Neutral', entities: [] }));
            }
            for (const r of results) {
                const a = arts[r.index];
                if (!a) continue;
                let score = Math.round(r.importance_score ?? 50);
                const auth = authority[hostOf(a.url)];
                if (auth?.tier === 'tier1') score += 10; else if (auth?.tier === 'tier3') score -= 10;
                try {
                    await svc.Article.update(a.id, {
                        ai_summary: r.ai_summary || '', importance_score: Math.min(100, Math.max(0, score)),
                        intelligence_tag: r.intelligence_tag || 'Neutral', scoring_lens: lensKey,
                        entities: (r.entities || []).slice(0, 8), enrichment_status: fallback ? 'fallback' : 'done',
                        enrichment_source: 'llm', enrichment_attempts: (a.enrichment_attempts || 0) + 1,
                        enrich_lease_until: new Date().toISOString(),
                    });
                    if (fallback) stats.llm_fallback++; else stats.llm_scored++;
                } catch { stats.errors++; }
            }
        }

        // 3. Custom lenses, only for articles the lens owner actually subscribes to
        for (const lens of lenses) {
            const arts = toScore.filter(a => lensMatches(lens, subsByArticle[a.id] || []) && !existingScores.has(`${lens.id}|${a.id}`)).slice(0, 10);
            if (!arts.length || !lens.scoring_prompt) continue;
            const payload = arts.map((a, i) => ({ index: i, title: (a.title || '').slice(0, 200), description: (a.description || '').slice(0, 400), category: a.category || '', source: hostOf(a.url) }));
            try {
                stats.llm_calls++;
                const r = await llm({
                    prompt: `${lens.scoring_prompt}

For each article below, return:
1. ai_summary: 2-3 sentences answering "So what?" from this lens perspective.
2. importance_score: integer 0-100.
3. intelligence_tag: one of "Trending", "Risk", "Opportunity", "Neutral".

Articles:
${JSON.stringify(payload, null, 2)}`,
                    response_json_schema: RESULT_SCHEMA(false),
                });
                for (const res of r?.results || []) if (arts[res.index]) addScore(lens, arts[res.index], res);
            } catch (e) { stats.errors++; }
        }

        for (const c of chunks(newScores, CHUNK)) await svc.LensScore.bulkCreate(c);
        stats.lens_scores_written += newScores.length;
    }

    await svc.SystemHealth.create({
        job_type: 'article_enrichment', status: 'completed',
        started_at: new Date(t0).toISOString(), completed_at: new Date().toISOString(),
        metadata: { ...stats, run_id: runId, adopt_legacy: adoptLegacy, duration_ms: Date.now() - t0 },
    }).catch((e) => console.error('[enrichArticles] health log failed:', e.message));

    return Response.json({ ...stats, run_id: runId, duration_ms: Date.now() - t0 });
});
