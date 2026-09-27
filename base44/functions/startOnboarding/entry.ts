import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * startOnboarding — first-run setup for the Welcome flow. Takes a brand-new user from
 * "what do you follow" to their first emailed briefing in one session.
 *
 * Auth required. Everything runs as the caller (request-scoped client), so addSource and
 * saveDigest apply their normal plan limits, dedupe and ownership rules.
 *
 * Body:
 *   phase?            'all' (default) | 'sources' | 'briefing'
 *                     'sources'  → save profile + add feeds only (the client calls this in
 *                                  chunks to show real "adding sources X/Y" progress)
 *                     'briefing' → save profile + create/update digest + generate + mark
 *                                  onboarding_complete (pass feed_ids from the sources phase)
 *   field             string  starter pack id or label (e.g. 'tech_ai', 'Real estate')
 *   custom_field?     string  free text when the user picked "Something else"
 *   interest_profile? string  free text; drives AI importance scoring
 *   feeds?            [{ url, name?, category?, directory_feed_id? }]
 *   feed_ids?         string[]  (briefing phase) feed ids already added
 *   delivery?         { email: boolean, time: 'HH:MM', timezone: IANA, frequency: 'daily'|'weekly' }
 *
 * Idempotent-ish: addSource dedupes per user, and a digest with the same name is reused
 * (updated) instead of creating a second one.
 *
 * Returns: { success, phase, steps: { profile, sources, digest, briefing, onboarding }, digest_id, delivery_id }
 */

const FIELD_LABELS: Record<string, string> = {
    tech_ai: 'Tech & AI',
    markets_finance: 'Markets & Finance',
    real_estate: 'Real Estate',
    crypto: 'Crypto',
    politics_world: 'World News',
    science: 'Science',
    marketing_growth: 'Marketing & Growth',
    startups_vc: 'Startups & VC',
    health_medicine: 'Health & Medicine',
    sports: 'Sports',
};

const SOURCES_BUDGET_MS = 40_000;
const PER_SOURCE_TIMEOUT_MS = 30_000;
const BATCH_SIZE = 4;
const MAX_FEEDS = 20;

function extractItems(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

function isValidTimezone(tz: unknown): tz is string {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

function cleanText(v: unknown, max: number): string {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
    ]);
}

// functions.invoke throws on non-2xx; pull the JSON body out either way.
async function invokeJson(base44: any, name: string, payload: any, timeoutMs: number) {
    try {
        const res = await withTimeout(base44.functions.invoke(name, payload), timeoutMs, name);
        return { ok: true, status: 200, data: (res as any)?.data ?? {} };
    } catch (err: any) {
        const data = err?.response?.data || err?.data || {};
        return { ok: false, status: err?.response?.status || err?.status || 0, data, error: data?.error || err?.message || `${name} failed` };
    }
}

function fieldLabel(field: string, custom: string): string {
    if (custom) return custom.slice(0, 60);
    if (!field) return 'My';
    return FIELD_LABELS[field] || field.slice(0, 60);
}

// User.last_visit_date is a required field; new accounts may not have it yet, and a partial
// update could be rejected without it.
function visitStamp(user: any): Record<string, string> {
    return user?.last_visit_date ? {} : { last_visit_date: new Date().toISOString().slice(0, 10) };
}

async function saveProfile(base44: any, user: any, body: any) {
    const data: Record<string, string> = { ...visitStamp(user) };
    const custom = cleanText(body.custom_field, 120);
    const field = cleanText(body.field, 120);
    const label = custom || (field ? (FIELD_LABELS[field] || field) : '');
    if (label) data.interest_field = label;
    const profile = cleanText(body.interest_profile, 2000);
    if (profile) data.interest_profile = profile;
    const tz = body.delivery?.timezone;
    if (isValidTimezone(tz)) data.timezone = tz;
    if (!Object.keys(data).length) return { ok: true, saved: [] };
    // Only these fields are ever written here: never plan/role/workspace_id/newsletter_address.
    try {
        await base44.auth.updateMe(data);
    } catch {
        try {
            await base44.asServiceRole.entities.User.update(user.id, data);
        } catch (e: any) {
            return { ok: false, error: e?.message || 'Could not save profile' };
        }
    }
    return { ok: true, saved: Object.keys(data) };
}

async function addSources(base44: any, feeds: any[]) {
    const started = Date.now();
    const list = (Array.isArray(feeds) ? feeds : [])
        .filter(f => f && typeof f.url === 'string' && f.url.trim())
        .slice(0, MAX_FEEDS);
    const results: any[] = [];
    let limitReached = false;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE);
        if (Date.now() - started > SOURCES_BUDGET_MS || limitReached) {
            for (const f of batch) results.push({ url: f.url, name: f.name || null, status: limitReached ? 'limit_reached' : 'skipped_time_budget' });
            continue;
        }
        const settled = await Promise.all(batch.map(async (f) => {
            const payload: any = {
                url: String(f.url).trim(),
                category: cleanText(f.category, 40) || 'Other',
            };
            if (f.name) payload.name = cleanText(f.name, 200);
            if (f.directory_feed_id) {
                payload.sourced_from_directory = true;
                payload.directory_feed_id = String(f.directory_feed_id);
            }
            const r = await invokeJson(base44, 'addSource', payload, PER_SOURCE_TIMEOUT_MS);
            const d: any = r.data || {};
            if (d.success && d.source_id) {
                return { url: payload.url, name: d.name || payload.name || null, status: d.duplicate ? 'duplicate' : 'added', feed_id: d.source_id };
            }
            // addSource answers 409 for some duplicates with the existing id.
            if (d.duplicate && d.source_id) {
                return { url: payload.url, name: payload.name || null, status: 'duplicate', feed_id: d.source_id };
            }
            if (d.limit_reached) limitReached = true;
            return { url: payload.url, name: payload.name || null, status: d.limit_reached ? 'limit_reached' : 'failed', error: d.error || r.error || 'Could not add source' };
        }));
        results.push(...settled);
    }

    const feedIds = [...new Set(results.filter(r => r.feed_id).map(r => r.feed_id))];
    return {
        ok: feedIds.length > 0,
        total: list.length,
        added: results.filter(r => r.status === 'added').length,
        duplicates: results.filter(r => r.status === 'duplicate').length,
        failed: results.filter(r => !['added', 'duplicate'].includes(r.status)).length,
        limit_reached: limitReached,
        elapsed_ms: Date.now() - started,
        feed_ids: feedIds,
        results,
    };
}

async function buildBriefing(base44: any, user: any, body: any, feedIds: string[]) {
    const svc = base44.asServiceRole.entities;
    const delivery = body.delivery || {};
    const frequency = delivery.frequency === 'weekly' ? 'weekly' : 'daily';
    const time = /^\d{2}:\d{2}$/.test(String(delivery.time || '')) ? String(delivery.time) : '07:00';
    const timezone = isValidTimezone(delivery.timezone) ? delivery.timezone : (isValidTimezone(user.timezone) ? user.timezone : undefined);
    const label = fieldLabel(cleanText(body.field, 120), cleanText(body.custom_field, 120));
    const name = `${label} ${frequency === 'weekly' ? 'Weekly' : 'Daily'} Briefing`;

    // Only feeds the caller really owns (saveDigest re-checks this too).
    const own = extractItems(await svc.Feed.filter({ created_by: user.email }, '-created_date', 1000, 0, ['id']));
    const ownIds = new Set(own.map((f: any) => f.id));
    if (!ownIds.size) {
        return { digest: { ok: false, error: 'No sources were added, so there is nothing to brief on yet.' }, briefing: { ok: false, skipped: true } };
    }
    const scoped = (Array.isArray(feedIds) ? feedIds : []).map(String).filter(id => ownIds.has(id));

    const digestPayload: any = {
        name,
        description: `Your ${label} briefing, ranked by what you told us matters.`,
        frequency,
        schedule_time: time,
        delivery_web: true,
        delivery_email: delivery.email !== false,
        output_length: 'medium',
        status: 'active',
        // Empty feed_ids = all of the user's feeds. No categories filter: item categories
        // come from each feed and would silently drop matching stories.
        feed_ids: scoped,
        categories: [],
    };
    if (timezone) digestPayload.timezone = timezone;
    if (frequency === 'weekly') {
        let wd = new Date().getDay();
        try {
            const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC', weekday: 'short' }).format(new Date());
            wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
        } catch { /* keep local */ }
        digestPayload.schedule_day_of_week = wd < 0 ? 1 : wd;
    }

    // Reuse an existing digest with the same name (re-runs update it instead of duplicating).
    const existing = extractItems(await svc.Digest.filter({ created_by: user.email }, '-created_date', 200, 0, ['id', 'name']))
        .find((d: any) => (d.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) digestPayload.id = existing.id;

    const saved = await invokeJson(base44, 'saveDigest', digestPayload, 30_000);
    const sd: any = saved.data || {};
    if (!sd.success || !sd.digest?.id) {
        return {
            digest: { ok: false, error: sd.error || saved.error || 'Could not create the briefing', limit_reached: !!sd.limit_reached },
            briefing: { ok: false, skipped: true },
        };
    }
    const digestId = sd.digest.id;
    const digestStep = { ok: true, digest_id: digestId, name, created: !!sd.created, reused: !!existing, warnings: sd.warnings || [] };

    // Generate the first briefing now. First fetches can still be landing, so one retry
    // if the run found no items.
    let gen = await invokeJson(base44, 'generateDigests', { digest_id: digestId, force: true }, 110_000);
    let result = extractItems((gen.data as any)?.results)[0] || null;
    if (result?.skipped) {
        await new Promise(r => setTimeout(r, 8000));
        gen = await invokeJson(base44, 'generateDigests', { digest_id: digestId, force: true }, 110_000);
        result = extractItems((gen.data as any)?.results)[0] || null;
    }
    const sent = !!result && result.status === 'ok';

    let deliveryId: string | null = null;
    if (sent) {
        const latest = extractItems(await svc.DigestDelivery.filter(
            { digest_id: digestId, delivery_type: 'web', status: 'sent' }, '-created_date', 1,
        ).catch(() => []));
        deliveryId = latest[0]?.id || null;
    }

    return {
        digest: digestStep,
        briefing: {
            ok: sent,
            delivery_id: deliveryId,
            items_included: result?.items_included ?? 0,
            channels: result?.deliveries || [],
            emailed: sent && digestPayload.delivery_email,
            skipped: !!result?.skipped,
            reason: result?.reason || result?.error || (gen.ok ? null : gen.error) || null,
        },
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const phase = ['sources', 'briefing'].includes(body.phase) ? body.phase : 'all';
        const steps: Record<string, any> = {};

        steps.profile = await saveProfile(base44, user, body);

        let feedIds: string[] = Array.isArray(body.feed_ids) ? body.feed_ids.map(String) : [];
        if (phase === 'sources' || phase === 'all') {
            steps.sources = await addSources(base44, body.feeds || []);
            feedIds = [...new Set([...feedIds, ...steps.sources.feed_ids])];
            if (phase === 'sources') {
                return Response.json({ success: true, phase, steps, feed_ids: feedIds });
            }
        }

        const built = await buildBriefing(base44, user, body, feedIds);
        steps.digest = built.digest;
        steps.briefing = built.briefing;

        // Mark onboarding done once a digest exists, even if the first run found nothing yet:
        // the schedule will pick it up and the user should not be sent back to Welcome.
        if (built.digest.ok) {
            const done = { onboarding_complete: true, setup_walkthrough_complete: true, ...visitStamp(user) };
            try {
                await base44.auth.updateMe(done);
                steps.onboarding = { ok: true };
            } catch {
                try {
                    await base44.asServiceRole.entities.User.update(user.id, done);
                    steps.onboarding = { ok: true };
                } catch (e: any) {
                    steps.onboarding = { ok: false, error: e?.message };
                }
            }
        }

        return Response.json({
            success: !!built.digest.ok,
            phase,
            steps,
            feed_ids: feedIds,
            digest_id: built.digest.ok ? built.digest.digest_id : null,
            delivery_id: built.briefing.delivery_id || null,
            error: built.digest.ok ? undefined : built.digest.error,
        });
    } catch (error: any) {
        return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
    }
});
