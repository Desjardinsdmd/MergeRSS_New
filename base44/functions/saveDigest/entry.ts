import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveDigest — the single write path for Digest records (wizard, edit dialog, directory add,
 * bulk import).
 *
 * Body: { id?: string, ...digestFields }
 *   - no id  -> create a digest owned by the caller
 *   - id     -> update the caller's own digest (404 if it is not theirs)
 *
 * Rules enforced here (the client cannot be trusted with them):
 *   - Free plan: at most FREE_DIGEST_LIMIT digests (create only).
 *   - Slack / Discord / Teams delivery is Premium-only: stripped for free users, with a warning.
 *   - feed_ids must belong to the caller; anything else is dropped (with a warning).
 *   - timezone defaults to the caller's saved User.timezone when not provided on create.
 *   - Team sharing (workspace_id): only an active owner/editor of THAT workspace (resolved
 *     from the caller's own WorkspaceMember row, never trusted from the client) can share a
 *     digest into it or edit a shared digest. Shared digests draw only from sources shared
 *     into the workspace, always email every member, and never carry personal Slack/Discord/
 *     Teams settings (the team channel lives on the Workspace). workspace_id: '' unshares it
 *     (creator or workspace owner/editor). Shared digests on an active Team plan do not count
 *     toward the creator's free digest limit.
 *
 * Returns: { success, digest, created: boolean, warnings: string[] }
 */
const FREE_DIGEST_LIMIT = 5;
const PREMIUM_CHANNELS = [
    ['delivery_slack', 'Slack'],
    ['delivery_discord', 'Discord'],
    ['delivery_teams', 'Microsoft Teams'],
];
const ALLOWED_FIELDS = [
    'name', 'description', 'categories', 'tags', 'feed_ids', 'frequency', 'schedule_time',
    'schedule_day_of_week', 'schedule_day_of_month', 'timezone', 'output_length',
    'delivery_web', 'delivery_email', 'delivery_slack', 'delivery_discord', 'delivery_teams',
    'slack_channel_id', 'discord_webhook_url', 'status', 'next_scheduled', 'is_public', 'public_description',
];
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);
const LENGTHS = new Set(['short', 'medium', 'long']);

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

// The caller's active workspace membership (or null). Server-side source of truth.
async function activeMembership(svc, email) {
    const me = String(email || '').trim().toLowerCase();
    const rows = extractItems(await svc.WorkspaceMember.filter({ user_email: me, status: 'active' }, '-created_date', 5).catch(() => []));
    for (const m of rows) {
        const ws = await svc.Workspace.get(m.workspace_id).catch(() => null);
        if (ws && ws.status !== 'deleted') return { ws, member: m };
    }
    return null;
}

function isValidTimezone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const id = body.id ? String(body.id) : null;
        const isPremium = user.plan === 'premium' || user.role === 'admin';
        const svc = base44.asServiceRole.entities;
        const warnings = [];

        // Existing record (update mode) — must be the caller's own.
        let existing = null;
        const needsTeam = !!id || body.workspace_id !== undefined;
        const team = needsTeam ? await activeMembership(svc, user.email) : null;
        const teamManager = !!team && ['owner', 'editor'].includes(team.member.role);
        if (id) {
            existing = await svc.Digest.get(id).catch(() => null);
            const viaTeam = !!existing?.workspace_id && teamManager && team.ws.id === existing.workspace_id;
            if (!existing || (existing.created_by !== user.email && user.role !== 'admin' && !viaTeam)) {
                return Response.json({ error: 'Digest not found' }, { status: 404 });
            }
        }

        // Team sharing: resolve the final workspace_id for this digest.
        let targetWs = existing?.workspace_id && team && team.ws.id === existing.workspace_id ? team.ws : null;
        let workspaceId = existing?.workspace_id || '';
        if (body.workspace_id !== undefined) {
            const wanted = body.workspace_id ? String(body.workspace_id) : '';
            if (wanted) {
                if (!teamManager || team.ws.id !== wanted) {
                    return Response.json({ error: 'Only team owners and editors can share briefings with their team' }, { status: 403 });
                }
                targetWs = team.ws;
            } else if (existing?.workspace_id && existing.created_by !== user.email && user.role !== 'admin'
                && !(teamManager && team.ws.id === existing.workspace_id)) {
                return Response.json({ error: 'Digest not found' }, { status: 404 });
            } else {
                targetWs = null;
            }
            workspaceId = wanted;
        }
        if (workspaceId && !targetWs) {
            // Existing shared digest, but the caller is not a manager of that workspace
            // (e.g. its creator was removed). Only admins get here; leave it untouched.
            targetWs = await svc.Workspace.get(workspaceId).catch(() => null);
        }

        // Whitelist fields.
        const data = {};
        for (const k of ALLOWED_FIELDS) {
            if (body[k] !== undefined) data[k] = body[k];
        }

        if (!existing) {
            if (!data.name || !String(data.name).trim()) {
                return Response.json({ error: 'Digest name is required' }, { status: 400 });
            }
            if (!data.frequency) data.frequency = 'daily';
        }
        if (data.name !== undefined) data.name = String(data.name).trim().slice(0, 200);
        if (data.frequency !== undefined && !FREQUENCIES.has(data.frequency)) {
            return Response.json({ error: 'Invalid frequency' }, { status: 400 });
        }
        if (data.output_length !== undefined && !LENGTHS.has(data.output_length)) delete data.output_length;
        if (data.status !== undefined && !['active', 'paused'].includes(data.status)) delete data.status;
        for (const k of ['categories', 'tags', 'feed_ids']) {
            if (data[k] !== undefined && !Array.isArray(data[k])) data[k] = [];
        }

        const teamPlan = targetWs?.plan === 'team';

        // Plan limit on create.
        if (!existing && !isPremium && !teamPlan) {
            // Shared digests in the caller's live Team-plan workspace don't count (see header).
            const ownTeam = team || await activeMembership(svc, user.email);
            const exemptWs = ownTeam?.ws?.plan === 'team' ? ownTeam.ws.id : null;
            const own = extractItems(await svc.Digest.filter({ created_by: user.email }, '-created_date', 200, 0, ['id', 'workspace_id']))
                .filter(d => !(exemptWs && d.workspace_id === exemptWs));
            if (own.length >= FREE_DIGEST_LIMIT) {
                return Response.json({
                    error: `Free plan limit reached: you can have up to ${FREE_DIGEST_LIMIT} digests. Upgrade to Premium for unlimited digests.`,
                    limit_reached: true,
                    limit: FREE_DIGEST_LIMIT,
                }, { status: 403 });
            }
        }

        // Shared digests: the team channel lives on the Workspace, never on the digest.
        if (workspaceId) {
            for (const [flag] of PREMIUM_CHANNELS) data[flag] = false;
            data.slack_channel_id = '';
            data.discord_webhook_url = '';
            data.delivery_web = true;
            data.delivery_email = true;
        }

        // Premium-only delivery channels.
        if (!isPremium && !workspaceId) {
            const stripped = [];
            for (const [flag, label] of PREMIUM_CHANNELS) {
                if (data[flag] === true) {
                    data[flag] = false;
                    stripped.push(label);
                }
            }
            if (stripped.length) {
                warnings.push(`${stripped.join(', ')} delivery requires Premium and was turned off.`);
            }
        }

        // Sharing mode changed: re-validate the existing feed list against the new pool.
        if (existing && data.feed_ids === undefined && (existing.workspace_id || '') !== workspaceId && existing.feed_ids?.length) {
            data.feed_ids = existing.feed_ids;
        }

        // feed_ids must belong to the caller (personal) or be shared into the workspace (team).
        if (Array.isArray(data.feed_ids) && data.feed_ids.length) {
            let allowed;
            if (workspaceId) {
                const active = new Set(extractItems(await svc.WorkspaceMember.filter({ workspace_id: workspaceId, status: 'active' }, '-created_date', 200))
                    .map(m => String(m.user_email || '').toLowerCase()));
                allowed = new Set(extractItems(await svc.Feed.filter({ workspace_id: workspaceId }, '-created_date', 5000, 0, ['id', 'created_by']))
                    .filter(f => active.has(String(f.created_by || '').toLowerCase())).map(f => f.id));
            } else {
                const ownerEmail = existing ? existing.created_by : user.email;
                allowed = new Set(extractItems(await svc.Feed.filter({ created_by: ownerEmail }, '-created_date', 5000, 0, ['id'])).map(f => f.id));
            }
            const requested = [...new Set(data.feed_ids.map(String))];
            data.feed_ids = requested.filter(fid => allowed.has(fid));
            const dropped = requested.length - data.feed_ids.length;
            if (dropped > 0) {
                warnings.push(workspaceId
                    ? `${dropped} source${dropped === 1 ? '' : 's'} not shared with your team ${dropped === 1 ? 'was' : 'were'} removed from this briefing.`
                    : `${dropped} source${dropped === 1 ? '' : 's'} not in your account ${dropped === 1 ? 'was' : 'were'} removed from this digest.`);
            }
        }
        if (body.workspace_id !== undefined) data.workspace_id = workspaceId;

        // Timezone: validate; default to the user's saved timezone on create.
        if (data.timezone !== undefined && !isValidTimezone(data.timezone)) delete data.timezone;
        if (!existing && !data.timezone) {
            data.timezone = isValidTimezone(user.timezone) ? user.timezone : 'America/New_York';
        }

        let digest;
        if (existing) {
            digest = existing.created_by === user.email
                ? await base44.entities.Digest.update(existing.id, data)
                : await svc.Digest.update(existing.id, data);
            digest = { ...existing, ...data, ...(digest || {}) };
        } else {
            digest = await base44.entities.Digest.create({
                delivery_web: true,
                status: 'active',
                ...data,
            });
        }

        return Response.json({ success: true, created: !existing, digest, warnings });
    } catch (error) {
        return Response.json({ error: error?.message || 'Server error' }, { status: 500 });
    }
});
