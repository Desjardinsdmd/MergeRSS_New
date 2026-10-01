import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
 * systemAlerts — evaluates alerting thresholds and fires admin email alerts.
 * Called by a scheduled automation (every 30 min) or manually by admin.
 *
 * Payload: { dry_run: true } to evaluate without sending emails
 */

const THRESHOLDS = {
    // Feed errors
    error_feeds_warn: 1,
    error_feeds_critical: 10,
    // Zombie lock (running job older than this)
    zombie_lock_min: 20,
    // Feed lag (2026-09-25: feeds are refetched on a ~60 min cadence by design, so the
    // old 60 min warn threshold fired on every healthy run)
    max_lag_warn_min: 120,
    max_lag_critical_min: 240,
    // Skipped % per run
    skipped_pct_warn: 40,
    skipped_pct_critical: 70,
    // Failed deliveries in last 24h
    failed_delivery_warn: 1,
    failed_delivery_critical: 5,
    // Digest errors per run
    digest_error_warn: 1,
    digest_error_critical: 3,
    // Platform-wide signals from OTHER users' records (counts only, never names).
    // Individual user failures are the user's problem; only a mass failure means
    // something is wrong with MergeRSS itself.
    platform_feed_error_min: 10,
    platform_feed_error_pct: 30,
    platform_digest_error_min: 3,
    platform_delivery_fail_min: 5,
};

// A record is in admin scope if an admin owns it or it has no human owner
// (system/service-created). Everything else belongs to a user and is private.
function isAdminScope(ownerEmail, adminEmailSet) {
    if (!ownerEmail || ownerEmail === 'anonymous') return true;
    if (ownerEmail.startsWith('service+') && ownerEmail.endsWith('@no-reply.base44.com')) return true;
    return adminEmailSet.has(ownerEmail.toLowerCase());
}

function severity(value, warn, critical) {
    if (value >= critical) return 'critical';
    if (value >= warn)    return 'warning';
    return 'ok';
}

// Admin health alert email in brand v3: critical = red, warning = amber (warnings only).
function renderAlertEmail(subject, alerts) {
    const cards = alerts.map(a => {
        const crit = a.severity === 'critical';
        const fg = crit ? BRAND.red : BRAND.amber;
        const bg = crit ? BRAND.redBg : BRAND.amberBg;
        const detail = String(a.detail || '').split('\n').filter(Boolean)
            .map(l => `<div style="font:400 13px/1.6 ${BRAND.sans};color:${BRAND.body};">${brandEsc(l)}</div>`).join('');
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 12px;background:${BRAND.raised};border:1px solid ${BRAND.hairline};border-radius:12px;"><tr><td style="padding:14px 16px;">
<span style="display:inline-block;background:${bg};color:${fg};font:600 10px/1 ${BRAND.mono};letter-spacing:0.08em;text-transform:uppercase;padding:5px 8px;border-radius:6px;">${crit ? 'Critical' : 'Warning'}</span>
<div style="margin:8px 0 6px;font:600 15px/1.4 ${BRAND.display};color:${BRAND.text};">${brandEsc(a.title)}</div>
${detail}
<div style="margin:8px 0 0;font:500 11px/1.5 ${BRAND.mono};color:${BRAND.muted};">Action: ${brandEsc(a.action)}</div>
</td></tr></table>`;
    }).join('');
    const inner = `<p style="margin:0 0 10px;">${emailMicro('System health', BRAND.violet)}</p>
<h1 class="h1" style="margin:0 0 6px;font:600 22px/1.3 ${BRAND.display};color:${BRAND.text};">${brandEsc(subject)}</h1>
<p style="margin:0 0 18px;font:500 11px/1.5 ${BRAND.mono};letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.meta};">Automated health check · ${brandEsc(new Date().toUTCString())}</p>
${cards}
<div style="margin-top:18px;">${emailButton(`${BRAND.site}/AdminHealth`, 'Open AdminHealth')}</div>`;
    return emailShell({ preheader: subject, title: subject, bodyHtml: emailPanel(inner), footerNote: 'Sent to MergeRSS admins by the scheduled health check.' });
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run ?? false;

    const now = Date.now();
    const alerts = [];

    // ── Fetch state in parallel ───────────────────────────────────────────────
    const [allFeeds, healthJobs, allDeliveries, digests, adminUsers] = await Promise.all([
        base44.asServiceRole.entities.Feed.filter({ status: { $in: ['active', 'error', 'paused'] } }, '-updated_date', 2000),
        base44.asServiceRole.entities.SystemHealth.list('-created_date', 100),
        base44.asServiceRole.entities.DigestDelivery.filter(
            { status: 'failed', created_date: { $gte: new Date(now - 24 * 60 * 60 * 1000).toISOString() } },
            '-created_date', 100
        ),
        base44.asServiceRole.entities.Digest.filter({ status: 'active' }),
        base44.asServiceRole.entities.User.filter({ role: 'admin' }),
    ]);

    const adminEmailSet = new Set(adminUsers.map(u => (u.email || '').toLowerCase()).filter(Boolean));
    const feeds      = allFeeds.filter(f => isAdminScope(f.created_by, adminEmailSet));
    const userFeeds  = allFeeds.filter(f => !isAdminScope(f.created_by, adminEmailSet));
    const deliveries = allDeliveries.filter(d => isAdminScope(d.owner_email, adminEmailSet));
    const userDeliveryFailures = allDeliveries.length - deliveries.length;
    const digestOwnerById = Object.fromEntries(digests.map(d => [d.id, d.created_by]));

    // ── Check 1: Error feeds ──────────────────────────────────────────────────
    const errorFeeds = feeds.filter(f => f.status === 'error');
    const errorSev   = severity(errorFeeds.length, THRESHOLDS.error_feeds_warn, THRESHOLDS.error_feeds_critical);
    if (errorSev !== 'ok') {
        alerts.push({
            id: 'error-feeds',
            severity: errorSev,
            title: `${errorFeeds.length} source(s) in error state`,
            detail: errorFeeds.slice(0, 5).map(f => `• ${f.name}: ${f.fetch_error || 'unknown error'}`).join('\n'),
            action: 'Review and fix sources in AdminHealth → Source status',
        });
    }

    // ── Check 1b: Platform-wide feed failure (other users, counts only) ────────
    const userLive       = userFeeds.filter(f => f.status === 'active' || f.status === 'error');
    const userErrorCount = userLive.filter(f => f.status === 'error').length;
    const userErrorPct   = userLive.length ? Math.round((userErrorCount / userLive.length) * 100) : 0;
    if (userErrorCount >= THRESHOLDS.platform_feed_error_min && userErrorPct >= THRESHOLDS.platform_feed_error_pct) {
        alerts.push({
            id: 'platform-feed-errors',
            severity: 'critical',
            title: `Platform-wide fetch failure: ${userErrorCount}/${userLive.length} user sources erroring (${userErrorPct}%)`,
            detail: 'Error rate across user sources is high enough to suggest a fetcher or network problem rather than individual bad sources.',
            action: 'Check fetchFeeds logs and recent deploys.',
        });
    }

    // ── Check 2: Zombie locks ─────────────────────────────────────────────────
    // Only feed_fetch locks block fetching. Stuck clustering jobs are reported separately
    // as a warning; they were previously mislabelled as "feed fetching is blocked".
    const stuckClustering = healthJobs.filter(j =>
        j.job_type === 'clustering' && j.status === 'running' && j.started_at &&
        (now - new Date(j.started_at).getTime()) > THRESHOLDS.zombie_lock_min * 60 * 1000
    );
    if (stuckClustering.length > 0) {
        alerts.push({
            id: 'stuck-clustering',
            severity: 'warning',
            title: `${stuckClustering.length} story-grouping job(s) stuck`,
            detail: `Oldest started ${stuckClustering[stuckClustering.length - 1].started_at}. Source fetching is NOT blocked; these are reclaimed automatically after 15 min.`,
            action: 'No action unless this repeats daily.',
        });
    }
    const zombieJobs = healthJobs.filter(j =>
        j.job_type === 'feed_fetch' &&
        j.status === 'running' &&
        j.started_at &&
        (now - new Date(j.started_at).getTime()) > THRESHOLDS.zombie_lock_min * 60 * 1000
    );
    if (zombieJobs.length > 0) {
        const ageMin = Math.round((now - new Date(zombieJobs[0].started_at).getTime()) / 60000);
        alerts.push({
            id: 'zombie-lock',
            severity: 'critical',
            title: `Zombie job lock: source fetching is blocked`,
            detail: `A "running" SystemHealth job has been active for ${ageMin} minutes. This blocks all subsequent fetchFeeds runs via the overlap lock.\nJob started: ${zombieJobs[0].started_at}`,
            action: 'Manually update the SystemHealth record status to "failed" to release the lock, or run deduplicateFeedItems to force a cleanup.',
        });
    }

    // ── Check 3: Feed lag ─────────────────────────────────────────────────────
    const recentFetchJobs = healthJobs.filter(j => j.job_type === 'feed_fetch' && j.status === 'completed');
    const lastFetch = recentFetchJobs[0];
    const maxLagMin = lastFetch?.metadata?.max_lag_min ?? 0;
    const lagSev = severity(maxLagMin, THRESHOLDS.max_lag_warn_min, THRESHOLDS.max_lag_critical_min);
    if (lagSev !== 'ok' && maxLagMin > 0) {
        const overdueCount = lastFetch?.metadata?.overdue_count ?? 0;
        const totalFeeds   = lastFetch?.metadata?.total_feeds ?? 0;
        alerts.push({
            id: 'feed-lag',
            severity: lagSev,
            title: `Source lag: max ${maxLagMin}min, ${overdueCount}/${totalFeeds} sources overdue`,
            detail: `p50: ${lastFetch?.metadata?.p50_lag_min ?? '?'}min  p95: ${lastFetch?.metadata?.p95_lag_min ?? '?'}min  max: ${maxLagMin}min\nSources are not being fetched fast enough relative to the run interval.`,
            action: 'Check fetchFeeds run frequency and cap. Consider reducing batch size or increasing run interval.',
        });
    }

    // ── Check 4: Failed deliveries ────────────────────────────────────────────
    const failedDeliverySev = severity(deliveries.length, THRESHOLDS.failed_delivery_warn, THRESHOLDS.failed_delivery_critical);
    if (failedDeliverySev !== 'ok') {
        const byChannel = deliveries.reduce((acc, d) => {
            acc[d.delivery_type] = (acc[d.delivery_type] || 0) + 1;
            return acc;
        }, {});
        alerts.push({
            id: 'failed-deliveries',
            severity: failedDeliverySev,
            title: `${deliveries.length} failed briefing delivery(ies) in last 24h`,
            detail: Object.entries(byChannel).map(([ch, n]) => `• ${ch}: ${n} failure(s)`).join('\n'),
            action: 'Check webhook URLs and channel integrations in Settings → Integrations.',
        });
    }

    // ── Check 5: Digest errors in last run ────────────────────────────────────
    const digestJobs = healthJobs.filter(j => j.job_type === 'digest_generation');
    const lastDigest = digestJobs[0];
    const allDigestErrors = (lastDigest?.metadata?.results || []).filter(r => r.status === 'error');
    const digestErrors = allDigestErrors.filter(r => {
        const owner = r.owner ?? (r.digest_id ? digestOwnerById[r.digest_id] : undefined);
        // Older results carry only a name; without an owner we can't prove it's
        // the admin's, so keep it out of the named list.
        return owner !== undefined && isAdminScope(owner, adminEmailSet);
    });
    const userDigestErrorCount = allDigestErrors.length - digestErrors.length;
    if (userDigestErrorCount >= THRESHOLDS.platform_digest_error_min) {
        alerts.push({
            id: 'platform-digest-errors',
            severity: 'warning',
            title: `${userDigestErrorCount} user briefing(s) errored in last generation run`,
            detail: 'Multiple user briefings failing together usually means an LLM quota or platform issue.',
            action: 'Check generateDigests logs and LLM quota.',
        });
    }
    if (userDeliveryFailures >= THRESHOLDS.platform_delivery_fail_min) {
        alerts.push({
            id: 'platform-delivery-failures',
            severity: 'warning',
            title: `${userDeliveryFailures} user briefing deliveries failed in last 24h`,
            detail: 'Counts only; user delivery details are not included. Occasional individual failures stay below this threshold.',
            action: 'Check delivery integrations if this keeps climbing.',
        });
    }
    const digestErrSev = severity(digestErrors.length, THRESHOLDS.digest_error_warn, THRESHOLDS.digest_error_critical);
    if (digestErrSev !== 'ok') {
        alerts.push({
            id: 'digest-errors',
            severity: digestErrSev,
            title: `${digestErrors.length} briefing(s) errored in last generation run`,
            detail: digestErrors.map(r => `• ${r.digest}: ${r.error}`).join('\n'),
            action: 'Review briefing configurations. Check LLM quota and source availability.',
        });
    }

    // ── Check 6: Paused feeds with errors ────────────────────────────────────
    const pausedWithErrors = feeds.filter(f => f.status === 'paused' && f.fetch_error);
    if (pausedWithErrors.length > 0) {
        alerts.push({
            id: 'paused-feeds',
            severity: 'warning',
            title: `${pausedWithErrors.length} source(s) auto-paused after repeated failures`,
            detail: pausedWithErrors.slice(0, 5).map(f => `• ${f.name}: ${(f.fetch_error || '').slice(0, 80)}`).join('\n'),
            action: 'Review and re-activate sources on the Sources page, or remove dead sources.',
        });
    }

    // ── Fire email alerts ─────────────────────────────────────────────────────
    const criticalAlerts  = alerts.filter(a => a.severity === 'critical');
    const warningAlerts   = alerts.filter(a => a.severity === 'warning');
    const emailsSent = [];

    if (!dry_run && (criticalAlerts.length > 0 || warningAlerts.length > 0)) {
        // Load custom destination from AlertSettings (first record wins)
        const alertSettingsList = await base44.asServiceRole.entities.AlertSettings.list('-created_date', 1).catch(() => []);
        const alertSettings = alertSettingsList[0];

        let adminEmails;
        if (alertSettings?.destination_email?.trim()) {
            adminEmails = [alertSettings.destination_email.trim()];
        } else {
            adminEmails = adminUsers.map(u => u.email).filter(Boolean);
        }

        for (const email of adminEmails) {
            const subject = criticalAlerts.length > 0
                ? `MergeRSS critical alert: ${criticalAlerts.length} issue(s) need attention`
                : `MergeRSS warning: ${warningAlerts.length} issue(s) detected`;
            const body = renderAlertEmail(subject, alerts);

            await base44.asServiceRole.integrations.Core.SendEmail({
                to: email,
                subject,
                body,
                from_name: 'MergeRSS Alerts',
            });
            emailsSent.push(email);
        }
    }

    return Response.json({
        success: true,
        dry_run,
        checked_at: new Date().toISOString(),
        alert_count: alerts.length,
        critical: criticalAlerts.length,
        warnings: warningAlerts.length,
        alerts,
        emails_sent: emailsSent,
    });
});