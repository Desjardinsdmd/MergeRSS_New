import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const startedAt = new Date().toISOString();
        const now = new Date();

        const body = await req.json().catch(() => ({}));
        const { digest_id, force } = body;

        let digests;
        if (digest_id) {
            const all = await base44.asServiceRole.entities.Digest.list();
            const d = all.find(x => x.id === digest_id);
            digests = d ? [d] : [];
        } else {
            digests = await base44.asServiceRole.entities.Digest.filter({ status: 'active' });
        }

        const results = [];

        for (const digest of digests) {
            try {
                // Check frequency unless forced
                if (!force && digest.last_sent) {
                    const timeSince = (now - new Date(digest.last_sent)) / (1000 * 60); // in minutes
                    // Skip if recently sent (within 5 minutes) to prevent duplicate sends
                    if (timeSince < 5) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Recently sent, preventing duplicates' });
                        continue;
                    }
                    
                    const hoursSince = timeSince / 60;
                    let minHours = 20; // daily
                    if (digest.frequency === 'weekly') minHours = 168;
                    if (digest.frequency === 'monthly') minHours = 24 * 28;
                    if (hoursSince < minHours) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Not due yet' });
                        continue;
                    }
                }

                // For weekly digests, check if today is the scheduled day
                if (!force && digest.frequency === 'weekly' && digest.schedule_day_of_week !== undefined) {
                    if (now.getDay() !== digest.schedule_day_of_week) {
                        results.push({ digest: digest.name, skipped: true, reason: 'Not scheduled day of week' });
                        continue;
                    }
                }

                // For monthly digests, check if today is the scheduled day
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

                // Gather items
                let allItems = [];
                if (digest.feed_ids?.length > 0) {
                    allItems = await base44.asServiceRole.entities.FeedItem.filter({ 
                        feed_id: { $in: digest.feed_ids } 
                    }, '-published_date', 500);
                } else {
                    allItems = await base44.asServiceRole.entities.FeedItem.list('-published_date', 500);
                }

                // Filter by date
                let items = allItems.filter(i => {
                    const d = new Date(i.published_date || i.created_date);
                    return d > since;
                });

                // Filter by categories
                if (digest.categories?.length > 0) {
                    items = items.filter(i => digest.categories.includes(i.category));
                }

                // Filter by tags
                if (digest.tags?.length > 0) {
                    items = items.filter(i => i.tags?.some(t => digest.tags.includes(t)));
                }

                if (items.length === 0) {
                    if (!force) {
                        results.push({ digest: digest.name, skipped: true, reason: 'No new items in time window' });
                        continue;
                    }
                    // For forced test sends, extend the lookback window but still respect feed_ids and categories
                    let fallbackItems = [];
                    if (digest.feed_ids?.length > 0) {
                        fallbackItems = await base44.asServiceRole.entities.FeedItem.filter({ 
                            feed_id: { $in: digest.feed_ids } 
                        }, '-published_date', 50);
                    } else {
                        fallbackItems = await base44.asServiceRole.entities.FeedItem.list('-published_date', 50);
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

                // Sort by date, take top items — cap at 20 to stay within CPU limits
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

                const content = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });

                // Build compact items list for storage
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

                // Deep link to this specific delivery in the inbox
                const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || 'https://mergerss.com';
                const inboxUrl = `${origin}/Inbox?delivery_id=${webDelivery.id}`;

                const deliveryTypes = ['web'];

                // Email delivery
                if (digest.delivery_email && digest.created_by) {
                    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    // Sanitize content to prevent HTML injection
                    // Apply line breaks first before HTML-escaping angle brackets
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
                }

                // Slack delivery
                if (digest.delivery_slack) {
                    const slackIntegrations = await base44.asServiceRole.entities.Integration.filter({ type: 'slack', status: 'connected', created_by: digest.created_by });
                    const slackInt = slackIntegrations[0];
                    if (slackInt?.webhook_url) {
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        // Convert markdown links [text](url) to Slack format <url|text>
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
                    }
                }

                // Teams delivery
                if (digest.delivery_teams) {
                    const teamsIntegrations = await base44.asServiceRole.entities.Integration.filter({ type: 'teams', status: 'connected' });
                    const teamsInt = teamsIntegrations.find(i => i.created_by === digest.created_by) || teamsIntegrations[0];
                    if (teamsInt?.webhook_url) {
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
                        try {
                            const teamsRes = await fetch(teamsInt.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamsBody) });
                            if (teamsRes.ok || teamsRes.status === 202) deliveryTypes.push('teams');
                        } catch {}
                    }
                }

                // Discord delivery
                if (digest.delivery_discord) {
                    const webhookUrl = digest.discord_webhook_url;
                    if (webhookUrl) {
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const footerLink = `\n\n[📥 View full digest & article list in MergeRSS](${inboxUrl})`;
                        const header = `**📰 ${digest.name}**\n*${dateStr} • ${items.length} articles*\n\n`;
                        const maxContent = 1900 - header.length - footerLink.length;
                        const discordMsg = header + content.slice(0, maxContent) + (content.length > maxContent ? '...' : '') + footerLink;

                        try {
                            const discordRes = await fetch(webhookUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ content: discordMsg }),
                            });

                            const discordStatusOk = discordRes.ok || discordRes.status === 204;

                            await base44.asServiceRole.entities.DigestDelivery.create({
                                digest_id: digest.id,
                                delivery_type: 'discord',
                                status: discordStatusOk ? 'sent' : 'failed',
                                content: content,
                                item_count: items.length,
                                date_range_start: since.toISOString(),
                                date_range_end: now.toISOString(),
                                sent_at: now.toISOString(),
                                error_message: discordStatusOk ? '' : `HTTP ${discordRes.status}: ${await discordRes.text()}`,
                            });

                            if (discordStatusOk) deliveryTypes.push('discord');
                        } catch (discordErr) {
                            await base44.asServiceRole.entities.DigestDelivery.create({
                                digest_id: digest.id,
                                delivery_type: 'discord',
                                status: 'failed',
                                content: content,
                                item_count: items.length,
                                date_range_start: since.toISOString(),
                                date_range_end: now.toISOString(),
                                sent_at: now.toISOString(),
                                error_message: discordErr.message,
                            });
                        }
                    }
                }

                await base44.asServiceRole.entities.Digest.update(digest.id, {
                    last_sent: now.toISOString(),
                });

                results.push({ digest: digest.name, items_included: items.length, deliveries: deliveryTypes, status: 'ok' });

            } catch (err) {
                results.push({ digest: digest.name, error: err.message, status: 'error' });
            }
        }

        await base44.asServiceRole.entities.SystemHealth.create({
            job_type: 'digest_generation',
            status: 'completed',
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            metadata: { digests_processed: digests.length, results },
        });

        return Response.json({ success: true, results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});