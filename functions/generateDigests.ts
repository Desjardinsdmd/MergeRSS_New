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
                    const hoursSince = (now - new Date(digest.last_sent)) / (1000 * 60 * 60);
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
                if (force) lookbackDays = 7;
                const since = digest.last_sent && !force
                    ? new Date(digest.last_sent)
                    : new Date(now - lookbackDays * 24 * 60 * 60 * 1000);

                // Gather items
                let allItems = [];
                if (digest.feed_ids?.length > 0) {
                    for (const feedId of digest.feed_ids) {
                        const items = await base44.asServiceRole.entities.FeedItem.filter({ feed_id: feedId });
                        allItems.push(...items);
                    }
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
                    results.push({ digest: digest.name, skipped: true, reason: 'No new items in time window' });
                    continue;
                }

                // Sort by date, take top items
                items.sort((a, b) => new Date(b.published_date || b.created_date) - new Date(a.published_date || a.created_date));
                const topItems = items.slice(0, 30);

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

                // Web delivery
                await base44.asServiceRole.entities.DigestDelivery.create({
                    digest_id: digest.id,
                    delivery_type: 'web',
                    status: 'sent',
                    content: content,
                    item_count: items.length,
                    date_range_start: since.toISOString(),
                    date_range_end: now.toISOString(),
                    sent_at: now.toISOString(),
                });

                const deliveryTypes = ['web'];

                // Email delivery
                if (digest.delivery_email) {
                    // Find the owner of this digest
                    const users = await base44.asServiceRole.entities.User.filter({ email: digest.created_by });
                    const owner = users[0];
                    if (owner?.email) {
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const emailBody = `<h2>📰 ${digest.name}</h2><p><em>${dateStr} • ${items.length} articles</em></p><hr/>${content.replace(/\n/g, '<br/>')}`;
                        await base44.asServiceRole.integrations.Core.SendEmail({
                            to: owner.email,
                            subject: `📰 ${digest.name} — ${dateStr}`,
                            body: emailBody,
                        });
                        deliveryTypes.push('email');
                    }
                }

                // Slack delivery
                if (digest.delivery_slack) {
                    const slackIntegrations = await base44.asServiceRole.entities.Integration.filter({ type: 'slack', status: 'connected' });
                    const slackInt = slackIntegrations[0];
                    if (slackInt?.webhook_url) {
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const slackMsg = `*📰 ${digest.name}*\n_${dateStr} • ${items.length} articles_\n\n${content.slice(0, 2900)}${content.length > 2900 ? '\n\n_...read full digest in your MergeRSS inbox_' : ''}`;

                        const slackRes = await fetch(slackInt.webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: slackMsg }),
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

                // Discord delivery
                if (digest.delivery_discord) {
                    const discordIntegrations = await base44.asServiceRole.entities.Integration.filter({ type: 'discord', status: 'connected' });
                    const discordInt = discordIntegrations[0];
                    if (discordInt?.webhook_url) {
                        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        const discordMsg = `**📰 ${digest.name}**\n*${dateStr} • ${items.length} articles*\n\n${content.slice(0, 1900)}${content.length > 1900 ? '\n\n*...read full digest in your MergeRSS inbox*' : ''}`;

                        const discordRes = await fetch(discordInt.webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: discordMsg }),
                        });

                        await base44.asServiceRole.entities.DigestDelivery.create({
                            digest_id: digest.id,
                            delivery_type: 'discord',
                            status: discordRes.ok ? 'sent' : 'failed',
                            content: content,
                            item_count: items.length,
                            date_range_start: since.toISOString(),
                            date_range_end: now.toISOString(),
                            sent_at: now.toISOString(),
                            error_message: discordRes.ok ? '' : `HTTP ${discordRes.status}`,
                        });

                        if (discordRes.ok) deliveryTypes.push('discord');
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