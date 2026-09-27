import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * publicDirectory — the only way public feeds/digests are listed across tenants.
 * Feed and Digest are owner-only under RLS, so the Directory page reads (and votes, and
 * records adds) through here. Returns a whitelist of fields: no owner emails, webhook URLs,
 * Slack channels, fetch errors, or anything else private to the owner.
 *
 * Actions (body.action):
 *   (none) / 'list'  -> { feeds, digests }  each item carries upvotes, downvotes, score,
 *                       added_count, my_vote ('up'|'down'|null) and added_by_me (signed-in only).
 *                       Sorted by score, then added_count.
 *   'vote'           -> { item_id, item_type: 'feed'|'digest', vote: 'up'|'down' }
 *                       One vote per user per item (DirectoryVote). Voting the same way again
 *                       removes the vote. Returns the item's fresh tally.
 *   'record_add'     -> { item_id, item_type }  bumps the stored added_count for digests and
 *                       curated DirectoryFeed rows. Feed adds are counted from the adders' own
 *                       Feed rows (directory_feed_id), so nothing is written for them.
 *
 * Tallies are aggregated here with the service role; nobody writes to another user's record.
 */
function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const looksPrivate = (url = '') => /[?&](token|key|auth|secret|sig|signature|access_token)=|kill-the-newsletter|\/private\//i.test(url);

const FEED_FIELDS = ['id', 'name', 'url', 'category', 'tags', 'public_description', 'is_public', 'created_date'];
const DIRECTORY_FEED_FIELDS = ['id', 'name', 'url', 'category', 'tags', 'description', 'created_date'];
const DIGEST_FIELDS = ['id', 'name', 'description', 'public_description', 'categories', 'tags', 'frequency',
    'schedule_time', 'schedule_day_of_week', 'schedule_day_of_month', 'output_length', 'is_public', 'created_date'];

function urlKey(u) {
    if (!u) return '';
    try {
        const p = new URL(String(u).trim());
        return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '') + p.search).toLowerCase();
    } catch {
        return String(u).trim().toLowerCase();
    }
}

async function listAll(entity, query, sort, cap = 5000, fields) {
    const out = [];
    for (let skip = 0; skip < cap; skip += 500) {
        const page = extractItems(await entity.filter(query, sort, 500, skip, fields));
        out.push(...page);
        if (page.length < 500) break;
    }
    return out;
}

async function tallyVotes(svc, itemIds) {
    const tallies = {};
    if (!itemIds.length) return tallies;
    for (let i = 0; i < itemIds.length; i += 200) {
        const votes = await listAll(svc.DirectoryVote, { item_id: { $in: itemIds.slice(i, i + 200) } }, '-created_date', 20000);
        // One vote per (voter, item): keep the newest if legacy duplicates exist.
        const seen = new Set();
        for (const v of votes) {
            const key = `${v.voter_email || v.created_by}|${v.item_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const t = tallies[v.item_id] || (tallies[v.item_id] = { upvotes: 0, downvotes: 0 });
            if (v.vote === 'up') t.upvotes++;
            else if (v.vote === 'down') t.downvotes++;
        }
    }
    return tallies;
}

async function resolvePublicItem(svc, itemId, itemType) {
    if (itemType === 'digest') {
        const d = await svc.Digest.get(itemId).catch(() => null);
        return d && d.is_public ? { kind: 'digest', record: d } : null;
    }
    const f = await svc.Feed.get(itemId).catch(() => null);
    if (f && f.is_public) return { kind: 'feed', record: f };
    const df = await svc.DirectoryFeed.get(itemId).catch(() => null);
    if (df) return { kind: 'directory_feed', record: df };
    return null;
}

async function itemTally(svc, itemId) {
    const t = (await tallyVotes(svc, [itemId]))[itemId] || { upvotes: 0, downvotes: 0 };
    return { ...t, score: t.upvotes - t.downvotes };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const svc = base44.asServiceRole.entities;
        const body = await req.json().catch(() => ({}));
        const action = body.action || 'list';
        const user = await base44.auth.me().catch(() => null);

        if (action === 'vote') {
            if (!user) return Response.json({ error: 'Sign in to vote' }, { status: 401 });
            const itemId = String(body.item_id || '');
            const itemType = body.item_type === 'digest' ? 'digest' : 'feed';
            const vote = body.vote === 'down' ? 'down' : body.vote === 'up' ? 'up' : null;
            if (!itemId) return Response.json({ error: 'item_id is required' }, { status: 400 });
            const target = await resolvePublicItem(svc, itemId, itemType);
            if (!target) return Response.json({ error: 'Item not found' }, { status: 404 });

            const mine = extractItems(await svc.DirectoryVote.filter({ item_id: itemId, voter_email: user.email }, '-created_date', 50));
            const [current, ...extras] = mine;
            for (const dup of extras) await svc.DirectoryVote.delete(dup.id).catch(() => {});

            let myVote = null;
            if (!vote || (current && current.vote === vote)) {
                if (current) await svc.DirectoryVote.delete(current.id);
            } else if (current) {
                await svc.DirectoryVote.update(current.id, { vote });
                myVote = vote;
            } else {
                await svc.DirectoryVote.create({ item_id: itemId, item_type: itemType, vote, voter_email: user.email });
                myVote = vote;
            }
            return Response.json({ success: true, item_id: itemId, my_vote: myVote, ...(await itemTally(svc, itemId)) });
        }

        if (action === 'record_add') {
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const itemId = String(body.item_id || '');
            const itemType = body.item_type === 'digest' ? 'digest' : 'feed';
            const target = await resolvePublicItem(svc, itemId, itemType);
            if (!target) return Response.json({ error: 'Item not found' }, { status: 404 });
            if (target.record.created_by === user.email) return Response.json({ success: true, counted: false });

            if (target.kind === 'digest') {
                // Only count when the caller really has a digest copied from this one just now.
                const recent = extractItems(await svc.Digest.filter({ created_by: user.email, name: target.record.name }, '-created_date', 5));
                const fresh = recent.some(d => Date.now() - new Date(d.created_date).getTime() < 10 * 60 * 1000);
                if (!fresh) return Response.json({ success: true, counted: false });
                await svc.Digest.update(itemId, { added_count: (target.record.added_count || 0) + 1 });
                return Response.json({ success: true, counted: true });
            }
            if (target.kind === 'directory_feed') {
                const has = extractItems(await svc.Feed.filter({ created_by: user.email, directory_feed_id: itemId }, '-created_date', 1));
                if (!has.length) return Response.json({ success: true, counted: false });
                await svc.DirectoryFeed.update(itemId, { added_count: (target.record.added_count || 0) + 1 });
                return Response.json({ success: true, counted: true });
            }
            // User-shared Feed: counted from adders' Feed.directory_feed_id at list time.
            return Response.json({ success: true, counted: true });
        }

        // ── list ──────────────────────────────────────────────────────────────
        const ownerOf = {};
        const userFeeds = extractItems(await svc.Feed.filter({ is_public: true }, '-created_date', 500))
            .filter(f => !looksPrivate(f.url))
            .map(f => { ownerOf[f.id] = f.created_by; return f; })
            .map(f => ({ ...pick(f, FEED_FIELDS), source: 'user' }));
        const curated = extractItems(await svc.DirectoryFeed.list('-created_date', 500))
            .filter(f => !looksPrivate(f.url))
            .map(f => ({ ...pick(f, DIRECTORY_FEED_FIELDS), source: 'directory', stored_added_count: f.added_count || 0 }));

        const seenUrls = new Set();
        const feeds = [...userFeeds, ...curated].filter(f => {
            const k = urlKey(f.url);
            if (!k || seenUrls.has(k)) return false;
            seenUrls.add(k);
            return true;
        });

        const digestRecords = extractItems(await svc.Digest.filter({ is_public: true }, '-created_date', 500));
        for (const d of digestRecords) ownerOf[d.id] = d.created_by;
        const digests = digestRecords.map(d => ({ ...pick(d, DIGEST_FIELDS), stored_added_count: d.added_count || 0 }));

        // Vote tallies.
        const tallies = await tallyVotes(svc, [...feeds.map(f => f.id), ...digests.map(d => d.id)]);

        // Feed add counts, derived from the adders' own Feed rows.
        const feedAdds = {};
        const addRows = await listAll(svc.Feed, { directory_feed_id: { $in: feeds.map(f => f.id) } }, '-created_date', 20000,
            ['id', 'directory_feed_id', 'created_by']);
        const seenAdd = new Set();
        for (const r of addRows) {
            const k = `${r.created_by}|${r.directory_feed_id}`;
            if (seenAdd.has(k)) continue;
            seenAdd.add(k);
            feedAdds[r.directory_feed_id] = (feedAdds[r.directory_feed_id] || 0) + 1;
        }

        // Signed-in extras: my votes, and which items I already have.
        let myVotes = {};
        let myFeedKeys = new Set();
        let myFeedDirIds = new Set();
        let myDigestNames = new Set();
        if (user) {
            const votes = await listAll(svc.DirectoryVote, { voter_email: user.email }, '-created_date', 5000);
            for (const v of votes) if (!(v.item_id in myVotes)) myVotes[v.item_id] = v.vote;
            const own = await listAll(svc.Feed, { created_by: user.email }, '-created_date', 5000,
                ['id', 'url', 'resolved_url', 'original_submitted_url', 'directory_feed_id']);
            for (const f of own) {
                for (const u of [f.url, f.resolved_url, f.original_submitted_url]) if (u) myFeedKeys.add(urlKey(u));
                if (f.directory_feed_id) myFeedDirIds.add(f.directory_feed_id);
            }
            const ownDigests = await listAll(svc.Digest, { created_by: user.email }, '-created_date', 1000, ['id', 'name']);
            myDigestNames = new Set(ownDigests.map(d => (d.name || '').trim().toLowerCase()));
        }

        const decorate = (item, kind) => {
            const t = tallies[item.id] || { upvotes: 0, downvotes: 0 };
            const added = kind === 'digest'
                ? (item.stored_added_count || 0)
                : Math.max(feedAdds[item.id] || 0, item.stored_added_count || 0);
            const out = { ...item, upvotes: t.upvotes, downvotes: t.downvotes, score: t.upvotes - t.downvotes, added_count: added };
            delete out.stored_added_count;
            if (user) {
                out.my_vote = myVotes[item.id] || null;
                out.is_mine = !!ownerOf[item.id] && ownerOf[item.id] === user.email;
                out.added_by_me = out.is_mine || (kind === 'digest'
                    ? myDigestNames.has((item.name || '').trim().toLowerCase())
                    : (myFeedDirIds.has(item.id) || myFeedKeys.has(urlKey(item.url))));
            }
            return out;
        };
        const bySignal = (a, b) => (b.score - a.score) || (b.added_count - a.added_count) ||
            (new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());

        return Response.json({
            feeds: feeds.map(f => decorate(f, 'feed')).sort(bySignal),
            digests: digests.map(d => decorate(d, 'digest')).sort(bySignal),
        });
    } catch (error) {
        return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
    }
});

