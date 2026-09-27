import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
            title: `${errorFeeds.length} feed(s) in error state`,
            detail: errorFeeds.slice(0, 5).map(f => `• ${f.name}: ${f.fetch_error || 'unknown error'}`).join('\n'),
            action: 'Review and fix feeds in AdminHealth → Feed Status',
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
            title: `Platform-wide fetch failure: ${userErrorCount}/${userLive.length} user feeds erroring (${userErrorPct}%)`,
            detail: 'Error rate across user feeds is high enough to suggest a fetcher or network problem rather than individual bad sources.',
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
            detail: `Oldest started ${stuckClustering[stuckClustering.length - 1].started_at}. Feed fetching is NOT blocked; these are reclaimed automatically after 15 min.`,
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
            title: `Zombie job lock — feed fetching is blocked`,
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
            title: `Feed lag: max ${maxLagMin}min — ${overdueCount}/${totalFeeds} feeds overdue`,
            detail: `p50: ${lastFetch?.metadata?.p50_lag_min ?? '?'}min  p95: ${lastFetch?.metadata?.p95_lag_min ?? '?'}min  max: ${maxLagMin}min\nFeeds not being fetched fast enough relative to the run interval.`,
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
            title: `${deliveries.length} failed digest delivery(ies) in last 24h`,
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
            title: `${userDigestErrorCount} user digest(s) errored in last generation run`,
            detail: 'Multiple user digests failing together usually means an LLM quota or platform issue.',
            action: 'Check generateDigests logs and LLM quota.',
        });
    }
    if (userDeliveryFailures >= THRESHOLDS.platform_delivery_fail_min) {
        alerts.push({
            id: 'platform-delivery-failures',
            severity: 'warning',
            title: `${userDeliveryFailures} user digest deliveries failed in last 24h`,
            detail: 'Counts only. Individual webhook misconfigurations are shown to each user, not here.',
            action: 'Check delivery integrations if this keeps climbing.',
        });
    }
    const digestErrSev = severity(digestErrors.length, THRESHOLDS.digest_error_warn, THRESHOLDS.digest_error_critical);
    if (digestErrSev !== 'ok') {
        alerts.push({
            id: 'digest-errors',
            severity: digestErrSev,
            title: `${digestErrors.length} digest(s) errored in last generation run`,
            detail: digestErrors.map(r => `• ${r.digest}: ${r.error}`).join('\n'),
            action: 'Review digest configurations. Check LLM quota and feed availability.',
        });
    }

    // ── Check 6: Paused feeds with errors ────────────────────────────────────
    const pausedWithErrors = feeds.filter(f => f.status === 'paused' && f.fetch_error);
    if (pausedWithErrors.length > 0) {
        alerts.push({
            id: 'paused-feeds',
            severity: 'warning',
            title: `${pausedWithErrors.length} feed(s) auto-paused after repeated failures`,
            detail: pausedWithErrors.slice(0, 5).map(f => `• ${f.name}: ${(f.fetch_error || '').slice(0, 80)}`).join('\n'),
            action: 'Review and re-activate feeds in Feeds page, or remove dead feeds.',
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
                ? `🚨 MergeRSS Critical Alert — ${criticalAlerts.length} issue(s) require attention`
                : `⚠️ MergeRSS Warning — ${warningAlerts.length} issue(s) detected`;

            const alertLines = alerts.map(a => {
                const icon = a.severity === 'critical' ? '🔴' : '🟡';
                return `${icon} ${a.title}\n${a.detail}\n→ ${a.action}`;
            }).join('\n\n─────────────────────\n\n');

            const body = `<h2>${subject}</h2>
<p>Automated health check at ${new Date().toUTCString()}</p>
<hr/>
<pre style="font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap">${alertLines}</pre>
<hr/>
<p style="font-size:12px;color:#666">View full details at <a href="https://mergerss.com/AdminHealth">AdminHealth Dashboard</a></p>`;

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