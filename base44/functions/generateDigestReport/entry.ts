import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { digest_id, digest_ids: rawDigestIds, start_date, end_date, period_label } = await req.json();

    // Support both single digest_id (legacy) and array digest_ids
    const digestIds = rawDigestIds?.length ? rawDigestIds : (digest_id ? [digest_id] : []);

    if (!digestIds.length || !start_date || !end_date) {
      return Response.json({ error: 'digest_ids, start_date, and end_date are required' }, { status: 400 });
    }

    // Fetch all selected digest definitions
    const digestDocs = await Promise.all(digestIds.map(id => base44.entities.Digest.get(id)));
    const validDigests = digestDocs.filter(Boolean);
    if (!validDigests.length) return Response.json({ error: 'No valid digests found' }, { status: 404 });
    const digestNames = validDigests.map(d => d.name);

    // Fetch all web deliveries for all selected digests
    const allDeliveriesArrays = await Promise.all(
      digestIds.map(id =>
        base44.entities.DigestDelivery.filter(
          { digest_id: id, delivery_type: 'web', status: 'sent' },
          'sent_at',
          500
        )
      )
    );
    const allDeliveries = allDeliveriesArrays.flat();

    const start = new Date(start_date);
    const end = new Date(end_date);
    end.setHours(23, 59, 59, 999);

    const deliveries = allDeliveries.filter(d => {
      const dt = new Date(d.sent_at || d.created_date);
      return dt >= start && dt <= end;
    });

    if (deliveries.length === 0) {
      return Response.json({ error: 'No deliveries found in this date range' }, { status: 404 });
    }

    // Build a structured timeline for the AI
    const timeline = deliveries.map(d => ({
      date: d.sent_at || d.created_date,
      content: (d.content || '').slice(0, 2000), // cap per delivery to avoid token overflow
      item_count: d.item_count || 0,
    }));

    // Compute actual data range for the prompt
    const sortedForPrompt = [...deliveries].sort((a, b) =>
      new Date(a.sent_at || a.created_date) - new Date(b.sent_at || b.created_date)
    );
    const promptActualStart = new Date(sortedForPrompt[0].sent_at || sortedForPrompt[0].created_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const promptActualEnd = new Date(sortedForPrompt[sortedForPrompt.length - 1].sent_at || sortedForPrompt[sortedForPrompt.length - 1].created_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const requestedStartFormatted = new Date(start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const requestedEndFormatted = new Date(end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const rangeNote = (promptActualStart !== requestedStartFormatted || promptActualEnd !== requestedEndFormatted)
      ? `NOTE: The user requested data from ${requestedStartFormatted} to ${requestedEndFormatted}, but actual digest data is only available from ${promptActualStart} to ${promptActualEnd}. You MUST mention this discrepancy clearly in your executive summary.`
      : `The data covers the full requested range from ${requestedStartFormatted} to ${requestedEndFormatted}.`;

    const digestLabel = digestNames.length === 1 ? digestNames[0] : digestNames.join(' + ');

    const prompt = `You are an expert analyst. You have been given a series of digest deliveries from ${digestNames.length === 1 ? `a feed called "${digestNames[0]}"` : `${digestNames.length} combined feeds: ${digestNames.map(n => `"${n}"`).join(', ')}`} spanning from ${start_date} to ${end_date} (${period_label || 'custom period'}).

${rangeNote}

Each entry is a dated AI-generated news digest. Your task is to analyze how the themes, topics, and signals within these digests have evolved over time and produce a comprehensive trend report.

DIGEST TIMELINE (chronological):
${timeline.map((t, i) => `--- [${new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}] (${t.item_count} articles) ---\n${t.content}`).join('\n\n')}

---

Produce a structured trend report with the following sections:

1. **Executive Summary** (2-3 sentences): What is the single most important trend observed over this period?

2. **Key Themes & How They Evolved**: List 3-6 major themes. For each, describe how it changed over the period (e.g. rising, falling, peaking, stabilizing, cyclical).

3. **Significant Inflection Points**: Highlight 2-4 specific moments in the timeline where sentiment, tone, or topic focus notably shifted.

4. **Trend Trajectories**: 
   - What topics are clearly escalating?
   - What topics are de-escalating or resolving?
   - What topics appear cyclical or volatile?

5. **Outlook**: Based on the trajectory of these trends, what should the reader watch for going forward?

6. **Data Summary**: Number of digests analyzed, date range, most active period.

Be specific, analytical, and reference actual content from the digests. Avoid generic statements.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          executive_summary: { type: 'string' },
          key_themes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                theme: { type: 'string' },
                trajectory: { type: 'string', enum: ['rising', 'falling', 'stable', 'volatile', 'peaked', 'resolving'] },
                description: { type: 'string' },
              }
            }
          },
          inflection_points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                event: { type: 'string' },
                significance: { type: 'string' },
              }
            }
          },
          escalating_topics: { type: 'array', items: { type: 'string' } },
          deescalating_topics: { type: 'array', items: { type: 'string' } },
          cyclical_topics: { type: 'array', items: { type: 'string' } },
          outlook: { type: 'string' },
          data_summary: {
            type: 'object',
            properties: {
              digest_count: { type: 'number' },
              date_range: { type: 'string' },
              most_active_period: { type: 'string' },
            }
          }
        }
      }
    });

    // Compute actual data range from the deliveries found
    const sortedByDate = [...deliveries].sort((a, b) =>
      new Date(a.sent_at || a.created_date) - new Date(b.sent_at || b.created_date)
    );
    const actual_start = sortedByDate[0].sent_at || sortedByDate[0].created_date;
    const actual_end = sortedByDate[sortedByDate.length - 1].sent_at || sortedByDate[sortedByDate.length - 1].created_date;

    const responseData = {
      report: result,
      digest_name: digestLabel,
      delivery_count: deliveries.length,
      requested_start: start_date,
      requested_end: end_date,
      actual_start,
      actual_end,
      period_label,
    };

    // Persist the report so it can be reviewed later
    await base44.entities.SavedDigestReport.create({
      digest_ids: digestIds,
      digest_name: digestLabel,
      start_date,
      end_date,
      delivery_count: deliveries.length,
      actual_start,
      actual_end,
      report: result,
    });

    return Response.json(responseData);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});