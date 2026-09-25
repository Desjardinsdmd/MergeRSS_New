import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * publicStats — anonymous landing-page counters (users, feeds, digests sent).
 *
 * Public by design (the landing page calls it before login), so it is kept cheap and
 * minimal: only record ids are read (no emails, URLs or content ever leave the database
 * layer), and results are cached in memory for 10 minutes so an anonymous caller can't
 * force repeated full-table reads.
 */

const TTL_MS = 10 * 60_000;
let cache = null; // { at, body }

Deno.serve(async (req) => {
    if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.body);
    try {
        const base44 = createClientFromRequest(req);
        const svc = base44.asServiceRole.entities;
        const [users, feeds, deliveries] = await Promise.all([
            svc.User.list('-created_date', 10000, 0, ['id']),
            svc.Feed.list('-created_date', 10000, 0, ['id']),
            svc.DigestDelivery.filter({ status: 'sent' }, '-created_date', 10000, 0, ['id']),
        ]);
        const body = { users: users.length, feeds: feeds.length, digests: deliveries.length };
        cache = { at: Date.now(), body };
        return Response.json(body);
    } catch {
        return Response.json({ error: 'unavailable' }, { status: 500 });
    }
});
