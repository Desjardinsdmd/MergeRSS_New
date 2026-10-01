import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── CANONICAL COPY: brand v3 + emailShell (source of truth: functions/lib/brand.ts) ──
// Design system v3 "briefing studio" (BRAND.md). Solid hex only so Outlook renders it,
// table layout, no webfont links. Keep every inlined copy in sync with lib/brand.ts.
const BRAND = {
    ink: '#0A0910', panel: '#17151F', raised: '#25222F', hairline: '#2A2636', line: '#363244',
    text: '#F3F1F7', body: '#C9C5D4', muted: '#A29DB1', meta: '#7C778B', faint: '#5C576B',
    violet: '#9B5CF6', violetDeep: '#7C3AED', violetLight: '#C4A5FD', chipBg: '#241B3A',
    emerald: '#34D399', emeraldBg: '#1A282B',
    red: '#F87171', redBg: '#2D1E27',
    sky: '#38BDF8', skyBg: '#1A2635',
    amber: '#FBBF24', amberBg: '#2E2620', amberBorder: '#503F20', // warnings only
    violetInt: 10181878, // Discord embed colour for #9B5CF6
    display: "'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif",
    sans: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
    site: 'https://mergerss.com',
    name: 'MergeRSS',
    tagline: 'briefing studio',
    attribution: 'MergeRSS briefing',
    sentBy: 'Sent by MergeRSS, the briefing studio',
};
function brandEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function brandUrl(u) {
    try { const x = new URL(String(u)); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : ''; }
    catch { return ''; }
}
// Mono micro label / eyebrow (10px, uppercase, wide tracking).
function emailMicro(text, color) {
    return `<span style="font:600 10px/1.4 ${BRAND.mono};letter-spacing:0.14em;text-transform:uppercase;color:${color || BRAND.meta};">${brandEsc(text)}</span>`;
}
// Bulletproof primary button: violet fill, white text, 12px radius.
function emailButton(url, label) {
    const href = brandUrl(url);
    if (!href) return '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td align="center" bgcolor="${BRAND.violet}" style="background:${BRAND.violet};border-radius:12px;">
<a href="${brandEsc(href)}" target="_blank" style="display:inline-block;padding:13px 22px;font:600 14px/1 ${BRAND.sans};color:#FFFFFF;text-decoration:none;border-radius:12px;">${brandEsc(label || 'Open in MergeRSS')}</a>
</td></tr></table>`;
}
// Rounded panel (20px radius, hairline border). innerHtml is trusted markup.
function emailPanel(innerHtml, opts = {}) {
    const pad = opts.padding || '24px';
    const border = opts.accent ? BRAND.violetDeep : BRAND.hairline;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.panel};border:1px solid ${border};border-radius:20px;">
<tr><td class="px" style="padding:${pad};">${innerHtml}</td></tr></table>`;
}
// Amber warning card (warnings only: paused, skipped, needs attention).
function emailWarning(text) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.amberBg};border:1px solid ${BRAND.amberBorder};border-radius:12px;">
<tr><td style="padding:12px 16px;font:500 13px/1.6 ${BRAND.sans};color:${BRAND.amber};">${brandEsc(text)}</td></tr></table>`;
}
// Full email document: ink page, logo lockup header, body slot, footer.
// bodyHtml is trusted markup (callers escape their own data). footerLinks: [{ label, url }].
function emailShell({ preheader, title, bodyHtml, footerNote, dateLabel, footerLinks }) {
    const links = (footerLinks || []).filter(l => l && brandUrl(l.url))
        .map(l => `<a href="${brandEsc(brandUrl(l.url))}" style="color:${BRAND.violetLight};text-decoration:underline;">${brandEsc(l.label)}</a>`)
        .join(`<span style="color:${BRAND.faint};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${brandEsc(title || BRAND.name)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${BRAND.ink}; }
  a { color:${BRAND.violetLight}; }
  @media only screen and (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .h1 { font-size:24px !important; }
    .thumb { display:none !important; }
    .hide-sm { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.ink};" bgcolor="${BRAND.ink}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${brandEsc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.ink}" style="background:${BRAND.ink};">
<tr><td align="center" style="padding:28px 12px 44px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:0 4px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
        <td width="32" height="32" bgcolor="${BRAND.violet}" style="width:32px;height:32px;background:${BRAND.violet};border-radius:9px;font-size:0;line-height:0;">&nbsp;</td>
        <td valign="middle" style="padding-left:11px;">
          <div style="font:600 17px/1.1 ${BRAND.display};letter-spacing:-0.01em;color:${BRAND.text};">${BRAND.name}</div>
          <div style="font:400 10px/1.4 ${BRAND.mono};letter-spacing:0.08em;color:${BRAND.meta};">${BRAND.tagline}</div>
        </td>
      </tr></table>
    </td>
    ${dateLabel ? `<td align="right" valign="middle" style="font:500 11px/1.4 ${BRAND.mono};letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.meta};">${brandEsc(dateLabel)}</td>` : ''}
  </tr></table>
</td></tr>
<tr><td>${bodyHtml || ''}</td></tr>
<tr><td style="padding:24px 4px 0;">
  ${footerNote ? `<p style="margin:0 0 10px;font:400 12px/1.6 ${BRAND.sans};color:${BRAND.meta};">${brandEsc(footerNote)}</p>` : ''}
  ${links ? `<p style="margin:0 0 10px;font:400 12px/1.6 ${BRAND.sans};color:${BRAND.meta};">${links}</p>` : ''}
  <p style="margin:0;font:400 11px/1.6 ${BRAND.mono};letter-spacing:0.04em;color:${BRAND.faint};">${brandEsc(BRAND.sentBy)} &middot; <a href="${BRAND.site}" style="color:${BRAND.faint};text-decoration:underline;">mergerss.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
// ─── end CANONICAL COPY: brand v3 ──────────────────────────────────────────


/**
 * workspace — the ONLY path the frontend uses to read or change team workspaces.
 *
 * Workspace and WorkspaceMember are admin-only at the entity level. Every action here
 * runs with the service role AFTER an explicit membership + role check on the caller.
 * Client-sent workspace ids are never trusted: the caller's workspace is always resolved
 * from their own active WorkspaceMember row (one workspace per user for now).
 *
 * Roles: owner (billing, members, webhooks), editor (share/unshare sources, create and
 * edit shared briefings), viewer (read only).
 *
 * Plan rule (documented here, enforced here and in saveDigest / generateDigests):
 *   - workspace.plan === 'team' (active Stripe subscription, set only by stripeWebhook):
 *     up to workspace.seat_limit members (default 5, owner included); shared briefings
 *     also post once to the team Slack / Discord / Teams webhooks.
 *   - workspace.plan !== 'team' (trial): the owner can create the workspace and invite
 *     exactly ONE other member (TRIAL_SEAT_LIMIT = 2 seats, owner included). Shared
 *     sources and shared briefings work, but shared briefings deliver by web + email only.
 *   Seats count members with status 'invited' or 'active'.
 *
 * Body: { action, ...params }
 *   get_mine                                  -> { workspace, membership, members, invites }
 *   create        { name }
 *   invite        { email, role }             owner
 *   accept        { workspace_id }            invited user (matched by caller email)
 *   decline       { workspace_id }            invited user
 *   remove_member { member_id }               owner (also cancels a pending invite)
 *   set_role      { member_id, role }         owner
 *   leave                                     any member; owner only when alone
 *   list_shared_feeds                         member
 *   share_feed    { feed_id }                 owner/editor who owns the feed
 *   unshare_feed  { feed_id }                 feed owner, or workspace owner/editor
 *   list_shared_digests                       member
 *   set_webhooks  { slack_webhook_url?, discord_webhook_url?, teams_webhook_url? }  owner
 *   test_webhook  { channel: 'slack'|'discord'|'teams' }                            owner
 */

const TRIAL_SEAT_LIMIT = 2; // owner + 1 invited member while the workspace has no active Team plan
const DEFAULT_SEAT_LIMIT = 5;
const APP_URL = 'https://mergerss.com';
const TEAM_URL = `${APP_URL}/Team`;

const WEBHOOK_HOSTS = {
    slack: ['hooks.slack.com'],
    discord: ['discord.com', 'discordapp.com'],
    teams: ['outlook.office.com', 'outlook.office365.com', 'webhook.office.com'],
};
const FEED_FIELDS = ['id', 'name', 'url', 'category', 'tags', 'status', 'item_count', 'last_fetched',
    'last_successful_fetch_at', 'source_type', 'created_by', 'workspace_id'];
const DIGEST_FIELDS = ['id', 'name', 'description', 'categories', 'tags', 'feed_ids', 'frequency', 'schedule_time',
    'schedule_day_of_week', 'schedule_day_of_month', 'timezone', 'output_length', 'status', 'last_sent',
    'created_by', 'workspace_id', 'delivery_web', 'delivery_email'];

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}
const norm = (e) => String(e || '').trim().toLowerCase();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));

function webhookOk(channel, url) {
    try {
        const { hostname, protocol } = new URL(url);
        if (protocol !== 'https:') return false;
        return (WEBHOOK_HOSTS[channel] || []).some(h => hostname === h || hostname.endsWith('.' + h));
    } catch { return false; }
}
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inviteEmailHtml({ inviter, workspaceName, role }) {
    const p = (t) => `<p style="margin:0 0 12px;font:400 15px/1.7 ${BRAND.sans};color:${BRAND.body};">${t}</p>`;
    const inner = `<p style="margin:0 0 10px;">${emailMicro('Team invite', BRAND.violet)}</p>
<h1 class="h1" style="margin:0 0 16px;font:600 22px/1.3 ${BRAND.display};color:${BRAND.text};">You're invited to ${esc(workspaceName)}</h1>
${p(`${esc(inviter)} invited you to join their MergeRSS team workspace as ${role === 'editor' ? 'an editor' : 'a viewer'}. Team members share sources and receive the team's briefings.`)}
${p('Sign in with this email address, then accept the invite on the Team page.')}
<div style="margin-top:20px;">${emailButton(TEAM_URL, 'Open the Team page')}</div>`;
    return emailShell({
        preheader: `${inviter} invited you to ${workspaceName} on MergeRSS.`,
        title: `Invite to ${workspaceName}`,
        bodyHtml: emailPanel(inner),
        footerNote: 'If you were not expecting this invite, you can ignore this email.',
    });
}

class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const me = norm(user.email);
        const body = await req.json().catch(() => ({}));
        const action = String(body.action || '');
        const svc = base44.asServiceRole.entities;

        // ── Membership helpers ─────────────────────────────────────────────────
        const membersOf = async (wsId, statuses = ['active']) =>
            extractItems(await svc.WorkspaceMember.filter({ workspace_id: wsId }, '-created_date', 200))
                .filter(m => statuses.includes(m.status));

        // The caller's one active workspace, resolved server-side.
        async function myActive() {
            const rows = extractItems(await svc.WorkspaceMember.filter({ user_email: me, status: 'active' }, '-created_date', 10));
            for (const m of rows) {
                const ws = await svc.Workspace.get(m.workspace_id).catch(() => null);
                if (ws && ws.status !== 'deleted') return { ws, member: m };
            }
            return null;
        }
        async function requireMember(roles = ['owner', 'editor', 'viewer']) {
            const ctx = await myActive();
            if (!ctx) fail(404, 'You are not in a team workspace');
            if (!roles.includes(ctx.member.role)) fail(403, 'Your team role does not allow this');
            return ctx;
        }
        const seatLimit = (ws) => ws.plan === 'team' ? (Number(ws.seat_limit) || DEFAULT_SEAT_LIMIT) : TRIAL_SEAT_LIMIT;
        async function setUserWorkspace(email, wsId) {
            const users = extractItems(await svc.User.filter({ email }, '-created_date', 1).catch(() => []));
            if (users[0]) await svc.User.update(users[0].id, { workspace_id: wsId || '' }).catch(e =>
                console.warn(`[workspace] could not set User.workspace_id for ${email}: ${e.message}`));
        }
        // Detach everything a departing member put into the workspace.
        async function detachMember(ws, email) {
            const feeds = extractItems(await svc.Feed.filter({ workspace_id: ws.id, created_by: email }, '-created_date', 1000, 0, ['id']));
            for (const f of feeds) await svc.Feed.update(f.id, { workspace_id: '' }).catch(() => {});
            const digests = extractItems(await svc.Digest.filter({ workspace_id: ws.id, created_by: email }, '-created_date', 500, 0, ['id']));
            for (const d of digests) await svc.Digest.update(d.id, { workspace_id: '' }).catch(() => {});
            await setUserWorkspace(email, '');
        }
        // Shared items only count while their creator is an active member.
        async function sharedFeeds(ws) {
            const active = new Set((await membersOf(ws.id)).map(m => norm(m.user_email)));
            return extractItems(await svc.Feed.filter({ workspace_id: ws.id }, '-created_date', 1000, 0, FEED_FIELDS))
                .filter(f => active.has(norm(f.created_by)));
        }
        const wsView = (ws, role) => {
            const out = pick(ws, ['id', 'name', 'owner_email', 'plan', 'status', 'seat_limit', 'subscription_status', 'current_period_end']);
            out.effective_seat_limit = seatLimit(ws);
            out.has_slack = !!ws.slack_webhook_url;
            out.has_discord = !!ws.discord_webhook_url;
            out.has_teams = !!ws.teams_webhook_url;
            if (role === 'owner') Object.assign(out, pick(ws, ['slack_webhook_url', 'discord_webhook_url', 'teams_webhook_url']));
            return out;
        };
        const memberView = (m) => pick(m, ['id', 'workspace_id', 'user_email', 'role', 'status', 'invited_by', 'joined_at', 'created_date']);

        switch (action) {
            case 'get_mine': {
                const ctx = await myActive();
                const invitesRaw = extractItems(await svc.WorkspaceMember.filter({ user_email: me, status: 'invited' }, '-created_date', 20));
                const invites = [];
                for (const inv of invitesRaw) {
                    const ws = await svc.Workspace.get(inv.workspace_id).catch(() => null);
                    if (ws && ws.status !== 'deleted') invites.push({ ...memberView(inv), workspace_name: ws.name, owner_email: ws.owner_email });
                }
                if (!ctx) return Response.json({ workspace: null, membership: null, members: [], invites });
                const members = (await membersOf(ctx.ws.id, ['active', 'invited'])).map(memberView);
                return Response.json({ workspace: wsView(ctx.ws, ctx.member.role), membership: memberView(ctx.member), members, invites });
            }

            case 'create': {
                if (await myActive()) fail(409, 'You are already in a team workspace. Leave it first.');
                const name = String(body.name || '').trim().slice(0, 80) || `${user.full_name || me.split('@')[0]}'s team`;
                const ws = await svc.Workspace.create({
                    name, owner_email: me, plan: 'none', status: 'active', seat_limit: DEFAULT_SEAT_LIMIT,
                });
                const member = await svc.WorkspaceMember.create({
                    workspace_id: ws.id, user_email: me, role: 'owner', status: 'active',
                    invited_by: me, joined_at: new Date().toISOString(),
                });
                await setUserWorkspace(user.email, ws.id);
                return Response.json({ success: true, workspace: wsView(ws, 'owner'), membership: memberView(member) });
            }

            case 'invite': {
                const { ws } = await requireMember(['owner']);
                const email = norm(body.email);
                const role = body.role === 'editor' ? 'editor' : 'viewer';
                if (!isEmail(email)) fail(400, 'Enter a valid email address');
                if (email === me) fail(400, 'You are already in this workspace');
                const all = extractItems(await svc.WorkspaceMember.filter({ workspace_id: ws.id }, '-created_date', 200));
                const existing = all.find(m => norm(m.user_email) === email);
                if (existing && existing.status !== 'removed') fail(409, existing.status === 'active' ? 'Already a member' : 'Already invited');
                const used = all.filter(m => m.status === 'active' || m.status === 'invited').length;
                const limit = seatLimit(ws);
                if (used >= limit) {
                    fail(403, ws.plan === 'team'
                        ? `Your Team plan includes ${limit} seats and all are in use.`
                        : 'Without the Team plan you can invite one member. Upgrade to Team for up to 5 seats.');
                }
                const data = { workspace_id: ws.id, user_email: email, role, status: 'invited', invited_by: me, joined_at: '' };
                const member = existing
                    ? { ...existing, ...data, ...(await svc.WorkspaceMember.update(existing.id, data) || {}) }
                    : await svc.WorkspaceMember.create(data);

                // App access: invite as a regular platform user ONLY (never admin).
                const known = extractItems(await svc.User.filter({ email }, '-created_date', 1).catch(() => []));
                let appInvited = false;
                if (!known.length) {
                    try { await base44.users.inviteUser(email, 'user'); appInvited = true; } catch (e) {
                        console.warn(`[workspace] inviteUser (caller) failed for ${email}: ${e.message}`);
                        try {
                            await base44.asServiceRole.users.inviteUser(email, 'user');
                            appInvited = true;
                        } catch (e2) {
                            console.warn(`[workspace] inviteUser (service) failed for ${email}: ${e2.message}`);
                        }
                    }
                }
                let emailed = false;
                try {
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: email, from_name: 'MergeRSS',
                        subject: `${user.full_name || me} invited you to ${ws.name} on MergeRSS`.slice(0, 140),
                        body: inviteEmailHtml({ inviter: user.full_name || me, workspaceName: ws.name, role }),
                    });
                    emailed = true;
                } catch (e) {
                    console.warn(`[workspace] invite email failed for ${email}: ${e.message}`);
                }
                return Response.json({ success: true, member: memberView(member), app_invited: appInvited, emailed });
            }

            case 'accept':
            case 'decline': {
                const wsId = String(body.workspace_id || '');
                const inv = extractItems(await svc.WorkspaceMember.filter({ workspace_id: wsId, user_email: me, status: 'invited' }, '-created_date', 1))[0];
                if (!inv) fail(404, 'Invite not found');
                if (action === 'decline') {
                    await svc.WorkspaceMember.update(inv.id, { status: 'removed' });
                    return Response.json({ success: true });
                }
                const ws = await svc.Workspace.get(wsId).catch(() => null);
                if (!ws || ws.status === 'deleted') fail(404, 'This workspace no longer exists');
                if (await myActive()) fail(409, 'You are already in a team workspace. Leave it before joining another.');
                const active = await membersOf(ws.id);
                if (active.length >= seatLimit(ws)) fail(403, 'This workspace has no free seats. Ask the owner to upgrade to Team.');
                const joined = new Date().toISOString();
                await svc.WorkspaceMember.update(inv.id, { status: 'active', joined_at: joined });
                await setUserWorkspace(user.email, ws.id);
                return Response.json({ success: true, workspace: wsView(ws, inv.role), membership: memberView({ ...inv, status: 'active', joined_at: joined }) });
            }

            case 'remove_member': {
                const { ws } = await requireMember(['owner']);
                const m = await svc.WorkspaceMember.get(String(body.member_id || '')).catch(() => null);
                if (!m || m.workspace_id !== ws.id || m.status === 'removed') fail(404, 'Member not found');
                if (m.role === 'owner') fail(400, 'The owner cannot be removed');
                await svc.WorkspaceMember.update(m.id, { status: 'removed' });
                if (m.status === 'active') await detachMember(ws, norm(m.user_email));
                return Response.json({ success: true });
            }

            case 'set_role': {
                const { ws } = await requireMember(['owner']);
                const role = body.role;
                if (!['editor', 'viewer'].includes(role)) fail(400, 'Role must be editor or viewer');
                const m = await svc.WorkspaceMember.get(String(body.member_id || '')).catch(() => null);
                if (!m || m.workspace_id !== ws.id || m.status === 'removed') fail(404, 'Member not found');
                if (m.role === 'owner') fail(400, "The owner's role cannot be changed");
                await svc.WorkspaceMember.update(m.id, { role });
                return Response.json({ success: true, member: memberView({ ...m, role }) });
            }

            case 'leave': {
                const { ws, member } = await requireMember();
                if (member.role !== 'owner') {
                    await svc.WorkspaceMember.update(member.id, { status: 'removed' });
                    await detachMember(ws, me);
                    return Response.json({ success: true });
                }
                const others = (await membersOf(ws.id, ['active'])).filter(m => m.id !== member.id);
                if (others.length) fail(409, 'Remove the other members before closing the workspace.');
                if (ws.plan === 'team') fail(409, 'Cancel the Team subscription (Settings, Billing) before closing the workspace.');
                for (const inv of await membersOf(ws.id, ['invited'])) await svc.WorkspaceMember.update(inv.id, { status: 'removed' }).catch(() => {});
                await svc.WorkspaceMember.update(member.id, { status: 'removed' });
                await detachMember(ws, me);
                await svc.Workspace.update(ws.id, { status: 'deleted' });
                return Response.json({ success: true, closed: true });
            }

            case 'list_shared_feeds': {
                const { ws, member } = await requireMember();
                const feeds = await sharedFeeds(ws);
                const canManage = member.role === 'owner' || member.role === 'editor';
                return Response.json({
                    feeds: feeds.map(f => ({ ...f, is_mine: norm(f.created_by) === me, can_unshare: canManage || norm(f.created_by) === me })),
                });
            }

            case 'share_feed': {
                const { ws } = await requireMember(['owner', 'editor']);
                const feed = await svc.Feed.get(String(body.feed_id || '')).catch(() => null);
                if (!feed || norm(feed.created_by) !== me) fail(404, 'Source not found');
                if (feed.workspace_id && feed.workspace_id !== ws.id) fail(409, 'This source is shared with another workspace');
                await svc.Feed.update(feed.id, { workspace_id: ws.id });
                return Response.json({ success: true, feed_id: feed.id, workspace_id: ws.id });
            }

            case 'unshare_feed': {
                const feed = await svc.Feed.get(String(body.feed_id || '')).catch(() => null);
                if (!feed || !feed.workspace_id) fail(404, 'Source not found');
                const ctx = await myActive();
                const isOwnerOfFeed = norm(feed.created_by) === me;
                const isManager = ctx && ctx.ws.id === feed.workspace_id && ['owner', 'editor'].includes(ctx.member.role);
                if (!isOwnerOfFeed && !isManager) fail(403, 'Only editors or the source owner can unshare it');
                await svc.Feed.update(feed.id, { workspace_id: '' });
                return Response.json({ success: true, feed_id: feed.id });
            }

            case 'list_shared_digests': {
                const { ws, member } = await requireMember();
                const active = new Set((await membersOf(ws.id)).map(m => norm(m.user_email)));
                const digests = extractItems(await svc.Digest.filter({ workspace_id: ws.id }, '-created_date', 500, 0, DIGEST_FIELDS))
                    .filter(d => active.has(norm(d.created_by)));
                const canEdit = member.role === 'owner' || member.role === 'editor';
                return Response.json({
                    digests: digests.map(d => ({ ...d, is_mine: norm(d.created_by) === me, can_edit: canEdit })),
                    team_channels_active: ws.plan === 'team',
                });
            }

            case 'set_webhooks': {
                const { ws } = await requireMember(['owner']);
                const patch = {};
                for (const [ch, key] of [['slack', 'slack_webhook_url'], ['discord', 'discord_webhook_url'], ['teams', 'teams_webhook_url']]) {
                    if (body[key] === undefined) continue;
                    const url = String(body[key] || '').trim();
                    if (url && !webhookOk(ch, url)) fail(400, `That ${ch === 'teams' ? 'Microsoft Teams' : ch[0].toUpperCase() + ch.slice(1)} webhook URL is not valid`);
                    patch[key] = url;
                }
                if (Object.keys(patch).length) await svc.Workspace.update(ws.id, patch);
                return Response.json({ success: true, workspace: wsView({ ...ws, ...patch }, 'owner') });
            }

            case 'test_webhook': {
                const { ws } = await requireMember(['owner']);
                const ch = String(body.channel || '');
                const url = ws[`${ch}_webhook_url`];
                if (!url || !webhookOk(ch, url)) fail(400, 'No valid webhook saved for this channel');
                // Brand v3: same violet accent and attribution as real briefing posts.
                const text = `Test post: shared briefings for ${ws.name} will post here.`;
                const payload = ch === 'discord'
                    ? { username: 'MergeRSS', embeds: [{ color: BRAND.violetInt, author: { name: BRAND.attribution, url: BRAND.site }, title: 'Connection test', description: text }] }
                    : ch === 'teams'
                        ? { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
                            type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4',
                            body: [
                                { type: 'TextBlock', text: BRAND.attribution.toUpperCase(), weight: 'Bolder', size: 'Small', color: 'Accent' },
                                { type: 'TextBlock', text, wrap: true },
                            ] } }] }
                        : { text: `${BRAND.attribution}: ${text}`, attachments: [{ color: BRAND.violet, blocks: [
                            { type: 'context', elements: [{ type: 'mrkdwn', text: `*${BRAND.attribution}*` }] },
                            { type: 'section', text: { type: 'mrkdwn', text } },
                        ] }] };
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const ok = res.ok || res.status === 202 || res.status === 204;
                return Response.json({ success: ok, status: res.status }, { status: ok ? 200 : 502 });
            }

            default:
                return Response.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        if (status === 500) console.error('[workspace]', err?.message);
        return Response.json({ error: err?.message || 'Server error' }, { status });
    }
});
