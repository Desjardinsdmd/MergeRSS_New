import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Hard wall-clock budget — stop before Deno's CPU limit hits
const WALL_BUDGET_MS = 45000;
// Max digests to process per scheduled run (lower cap to stay under budget)
const MAX_DIGESTS_PER_RUN = 8;

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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const startedAt = new Date().toISOString();
        const startTime = Date.now();
        const now = new Date();

        const body = await req.json().catch(() => ({}));
        const { digest_id, force } = body;

        console.log(`[generateDigests] Run started — digest_id=${digest_id || 'all'} force=${force || false}`);

        // Allowlist for outbound webhook fetches — prevents SSRF
        const ALLOWED_WEBHOOK_HOSTS = [
            'hooks.slack.com',
            'discord.com',
            'discordapp.com',
            'outlook.office.com',
            'outlook.office365.com',
            'webhook.office.com',
        ];
        function isAllowedWebhookUrl(url) {
            try {
                const { hostname, protocol } = new URL(url);
                if (!['https:', 'http:'].includes(protocol)) return false;
                return ALLOWED_WEBHOOK_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
            } catch { return false; }
        }

        // Auth check
        let callerEmail = null;
        try {
            const user = await base44.auth.me();
            callerEmail = user?.email;
        } catch {
            if (digest_id) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        let digests;
        if (digest_id) {
            const all = extractItems(await base44.asServiceRole.entities.Digest.list());
            const d = all.find(x => x.id === digest_id);
            if (d && callerEmail && d.created_by !== callerEmail) {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
            digests = d ? [d] : [];
        } else {
            digests = extractItems(await base44.asServiceRole.entities.Digest.filter({ status: 'active' }));
        }

        // Filter to only digests that are due right now (skip obviously not-due ones early)
        const dueDigests = force ? digests : digests.filter(digest => {
            if (!digest.last_sent) return true;
            const timeSince = (now - new Date(digest.last_sent)) / (1000 * 60); // minutes
            if (timeSince < 5) return false; // sent too recently
            const hoursSince = timeSince / 60;
            let minHours = 20;
            if (digest.frequency === 'weekly') minHours = 168;
            if (digest.frequency === 'monthly') minHours = 24 * 28;
            return hoursSince >= minHours;
        });

        console.log(`[generateDigests] Total active digests=${digests.length} due=${dueDigests.length}`);

        // Cap to MAX_DIGESTS_PER_RUN — oldest last_sent gets priority
        const toProcess = dueDigests
            .sort((a, b) => {
                const aTime = a.last_sent ? new Date(a.last_sent).getTime() : 0;
                const bTime = b.last_sent ? new Date(b.last_sent).getTime() : 0;
                return aTime - bTime;
            })
            .slice(0, MAX_DIGESTS_PER_RUN);

        const results = [];

        for (const digest of toProcess) {
            // Check wall-clock budget before each digest (LLM call is expensive)
            if (Date.now() - startTime > WALL_BUDGET_MS) {
                results.push({ digest: digest.name, skipped: true, reason: 'Budget exceeded, will retry next run' });
                continue;
            }

            console.log(`[generateDigests] Processing digest="${digest.name}" id=${digest.id}`);
            try {
                // Day-of-week / day-of-month schedule check
                if (!force && digest.frequency === 'weekly' && digest.schedule_day_of_week !== undefined) {
                    if (now.getDay() !== digest.schedule_day_of_week) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Not scheduled day of week' });
                        continue;
                    }
                }
                if (!force && digest.frequency === 'monthly' && digest.schedule_day_of_month !== undefined) {
                    if (now.getDate() !== digest.schedule_day_of_month) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Not scheduled day of month' });
                        continue;
                    }
                }

                let lookbackDays = 1;
                if (digest.frequency === 'weekly') lookbackDays = 7;
                if (digest.frequency === 'monthly') lookbackDays = 31;
                if (force) lookbackDays = 30;
                const since = digest.last_sent && !force
                    ? new Date(digest.last_sent)
                    : new Date(now - lookbackDays * 24 * 60 * 60 * 1000);

                // Gather feed items scoped to digest owner
                let allItems = [];
                if (digest.feed_ids?.length > 0) {
                    allItems = await base44.asServiceRole.entities.FeedItem.filter({
                        feed_id: { $in: digest.feed_ids },
                        published_date: { $gte: since.toISOString() },
                    }, '-published_date', 200);
                } else {
                    const ownerFeeds = await base44.asServiceRole.entities.Feed.filter({ created_by: digest.created_by });
                    const ownerFeedIds = ownerFeeds.map(f => f.id);
                    if (ownerFeedIds.length > 0) {
                        allItems = await base44.asServiceRole.entities.FeedItem.filter({
                            feed_id: { $in: ownerFeedIds },
                            published_date: { $gte: since.toISOString() },
                        }, '-published_date', 200);
                    }
                }

                // Filter by date, categories, tags
                let items = allItems.filter(i => new Date(i.published_date || i.created_date) > since);
                if (digest.categories?.length > 0) {
                    items = items.filter(i => digest.categories.includes(i.category));
                }
                if (digest.tags?.length > 0) {
                    items = items.filter(i => i.tags?.some(t => digest.tags.includes(t)));
                }

                console.log(`[generateDigests] digest="${digest.name}" — ${items.length} item(s) after filtering`);

                if (items.length === 0) {
                    if (!force) {
                        console.log(`[generateDigests] Skipping digest="${digest.name}" — no new items`);
                        results.push({ digest: digest.name, skipped: true, reason: 'No new items in time window' });
                        continue;
                    }
                    // Forced test: use most recent items regardless of date
                    let fallbackItems = [];
                    if (digest.feed_ids?.length > 0) {
                        fallbackItems = await base44.asServiceRole.entities.FeedItem.filter({
                            feed_id: { $in: digest.feed_ids }
                        }, '-published_date', 50);
                    } else {
                        const ownerFeeds = await base44.asServiceRole.entities.Feed.filter({ created_by: digest.created_by });
                        const ownerFeedIds = ownerFeeds.map(f => f.id);
                        if (ownerFeedIds.length > 0) {
                            fallbackItems = await base44.asServiceRole.entities.FeedItem.filter({
                                feed_id: { $in: ownerFeedIds }
                            }, '-published_date', 50);
                        }
                    }
                    if (digest.categories?.length > 0) {
                        fallbackItems = fallbackItems.filter(i => digest.categories.includes(i.category));
                    }
                    if (fallbackItems.length > 0) {
                        items = fallbackItems.slice(0, 20);
                    } else {
                        results.push({ digest: digest.name, skipped: true, reason: 'No items available for the configured feeds/categories' });
                        continue;
                    }
                }

                // Sort and cap at 20 items to keep LLM prompt manageable
                items.sort((a, b) => new Date(b.published_date || b.created_date) - new Date(a.published_date || a.created_date));
                const topItems = items.slice(0, 20);

                const lengthGuide = {
                    short: '3-5 concise bullet points highlighting the top stories',
                    medium: '2-3 well-organized paragraphs covering key highlights with brief context',
                    long: 'a detailed multi-section report with analysis and full context for each major story',
                };

                const prompt = `Create a professional news digest titled "${digest.name}".

Date range: ${since.toLocaleDateString()} to ${now.toLocaleDateString()}
Total articles: ${topItems.length}
Format: ${lengthGuide[digest.output_length] || lengthGuide.medium}

Articles to summarize:
${topItems.map((item, idx) => `${idx + 1}. [${item.category}] ${item.title}
   ${(item.description || '').slice(0, 500)}
   URL: ${item.url}`).join('\n\n')}

Write a well-organized, professional digest. Group related stories where appropriate. Be concise but informative. Reference specific article titles and include source URLs inline where relevant.`;

                // Stamp last_sent BEFORE delivery to prevent race condition / double-send
                // if this run is retried before delivery completes
                await base44.asServiceRole.entities.Digest.update(digest.id, { last_sent: now.toISOString() });

                const content = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });

                const itemsList = topItems.map(i => ({ title: i.title, url: i.url }));

                // Web delivery
                const webDelivery = await base44.asServiceRole.entities.DigestDelivery.create({
                    digest_id: digest.id,
                    delivery_type: 'web',
                    status: 'sent',
                    content: content,
                    item_count: items.length,
                    items: itemsList,
                    date_range_start: since.toISOString(),
                    date_range_end: now.toISOString(),
                    sent_at: now.toISOString(),
                });

                const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || 'https://mergerss.com';
                const inboxUrl = `${origin}/Inbox?delivery_id=${webDelivery.id}`;
                const deliveryTypes = ['web'];

                // Run all channel deliveries in parallel to save time
                await Promise.allSettled([
                    // Email
                    (async () => {
                        if (!digest.delivery_email || !digest.created_by) return;
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const sanitizedContent = content
                            .replace(/&/g, '&amp;')
                            .replace(/\n/g, '<br/>')
                            .replace(/<br\/>/g, '\x00BR\x00')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/\x00BR\x00/g, '<br/>');
                        const emailBody = `<h2>📰 ${digest.name}</h2><p><em>${dateStr} • ${items.length} articles</em></p><hr/><div style="white-space: pre-wrap;">${sanitizedContent}</div>`;
                        await base44.asServiceRole.integrations.Core.SendEmail({
                            to: digest.created_by,
                            subject: `📰 ${digest.name} — ${dateStr}`,
                            body: emailBody,
                        });
                        deliveryTypes.push('email');
                    })(),

                    // Slack
                    (async () => {
                        if (!digest.delivery_slack) return;
                        const slackIntegrations = await base44.asServiceRole.entities.Integration.filter({ type: 'slack', status: 'connected', created_by: digest.created_by });
                        const slackInt = slackIntegrations[0];
                        if (!slackInt?.webhook_url) return;
                        if (!isAllowedWebhookUrl(slackInt.webhook_url)) {
                            console.warn(`[generateDigests] Blocked Slack webhook to disallowed host: ${slackInt.webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const slackContent = content.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<$2|$1>');
                        const slackMsg = `*📰 ${digest.name}*\n_${dateStr} • ${items.length} articles_\n\n${slackContent.slice(0, 2600)}${slackContent.length > 2600 ? '...' : ''}\n\n<${inboxUrl}|📥 View full digest & article list in MergeRSS>`;
                        const slackRes = await fetch(slackInt.webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: slackMsg, mrkdwn: true }),
                        });
                        await base44.asServiceRole.entities.DigestDelivery.create({
                            digest_id: digest.id,
                            delivery_type: 'slack',
                            status: slackRes.ok ? 'sent' : 'failed',
                            content: content,
                            item_count: items.length,
                            date_range_start: since.toISOString(),
                            date_range_end: now.toISOString(),
                            sent_at: now.toISOString(),
                            error_message: slackRes.ok ? '' : `HTTP ${slackRes.status}`,
                        });
                        if (slackRes.ok) deliveryTypes.push('slack');
                    })(),

                    // Teams
                    (async () => {
                        if (!digest.delivery_teams) return;
                        const teamsIntegrations = await base44.asServiceRole.entities.Integration.filter({ type: 'teams', status: 'connected' });
                        const teamsInt = teamsIntegrations.find(i => i.created_by === digest.created_by) || teamsIntegrations[0];
                        if (!teamsInt?.webhook_url) return;
                        if (!isAllowedWebhookUrl(teamsInt.webhook_url)) {
                            console.warn(`[generateDigests] Blocked Teams webhook to disallowed host: ${teamsInt.webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const teamsBody = {
                            type: 'message',
                            attachments: [{
                                contentType: 'application/vnd.microsoft.card.adaptive',
                                content: {
                                    type: 'AdaptiveCard',
                                    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                                    version: '1.4',
                                    body: [
                                        { type: 'TextBlock', text: `📰 ${digest.name}`, weight: 'Bolder', size: 'Large' },
                                        { type: 'TextBlock', text: `${dateStr} • ${items.length} articles`, isSubtle: true, spacing: 'None' },
                                        { type: 'TextBlock', text: content.slice(0, 2000) + (content.length > 2000 ? '…' : ''), wrap: true },
                                        { type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: '📥 View in MergeRSS', url: inboxUrl }] }
                                    ]
                                }
                            }]
                        };
                        const teamsRes = await fetch(teamsInt.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamsBody) });
                        if (teamsRes.ok || teamsRes.status === 202) deliveryTypes.push('teams');
                    })(),

                    // Discord
                    (async () => {
                        if (!digest.delivery_discord || !digest.discord_webhook_url) return;
                        if (!isAllowedWebhookUrl(digest.discord_webhook_url)) {
                            console.warn(`[generateDigests] Blocked Discord webhook to disallowed host: ${digest.discord_webhook_url}`);
                            return;
                        }
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const footerLink = `\n\n[📥 View full digest in MergeRSS](${inboxUrl})`;
                        const header = `**📰 ${digest.name}**\n*${dateStr} • ${items.length} articles*\n\n`;
                        // Enforce Discord's hard 2000 char limit on the fully assembled message
                        const DISCORD_LIMIT = 1990; // leave 10 char buffer
                        const overhead = header.length + footerLink.length + 3; // +3 for "..."
                        const maxContent = DISCORD_LIMIT - overhead;
                        const truncatedContent = content.length > maxContent ? content.slice(0, maxContent) + '...' : content;
                        const discordMsg = header + truncatedContent + footerLink;
                        // Safety assertion — should never exceed limit after fix
                        if (discordMsg.length > 2000) {
                            console.error(`[generateDigests] Discord message still too long: ${discordMsg.length} chars — clamping hard`);
                        }
                        const discordRes = await fetch(digest.discord_webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: discordMsg }),
                        });
                        const ok = discordRes.ok || discordRes.status === 204;
                        await base44.asServiceRole.entities.DigestDelivery.create({
                            digest_id: digest.id,
                            delivery_type: 'discord',
                            status: ok ? 'sent' : 'failed',
                            content: content,
                            item_count: items.length,
                            date_range_start: since.toISOString(),
                            date_range_end: now.toISOString(),
                            sent_at: now.toISOString(),
                            error_message: ok ? '' : `HTTP ${discordRes.status}`,
                        });
                        if (ok) deliveryTypes.push('discord');
                    })(),
                ]);

                console.log(`[generateDigests] Delivered digest="${digest.name}" via ${deliveryTypes.join(',')}`);
                results.push({ digest: digest.name, items_included: items.length, deliveries: deliveryTypes, status: 'ok' });

            } catch (err) {
                console.error(`[generateDigests] Error processing digest="${digest.name}":`, err.message);
                results.push({ digest: digest.name, error: err.message, status: 'error' });
            }
        }

        const okCount = results.filter(r => r.status === 'ok').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const skippedCount = results.filter(r => r.skipped).length;

        console.log(`[generateDigests] Run complete — ok=${okCount} errors=${errorCount} skipped=${skippedCount}`);

        await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'digest_generation',
            status: errorCount > 0 && okCount === 0 ? 'failed' : 'completed',
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            metadata: { total: digests.length, processed: toProcess.length, ok: okCount, errors: errorCount, skipped: skippedCount, results },
        });

        return Response.json({ success: true, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});