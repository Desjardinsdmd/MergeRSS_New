import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { digest_id, start_date, end_date, period_label } = await req.json();

    if (!digest_id || !start_date || !end_date) {
      return Response.json({ error: 'digest_id, start_date, and end_date are required' }, { status: 400 });
    }

    // Fetch the digest definition
    const digest = await base44.entities.Digest.get(digest_id);
    if (!digest) return Response.json({ error: 'Digest not found' }, { status: 404 });

    // Fetch all web deliveries for this digest in the date range
    const allDeliveries = await base44.entities.DigestDelivery.filter(
      {
        digest_id,
        delivery_type: 'web',
        status: 'sent',
      },
      'sent_at',
      500
    );

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

    const prompt = `You are an expert analyst. You have been given a series of digest deliveries from a feed called "${digest.name}" spanning from ${start_date} to ${end_date} (${period_label || 'custom period'}).

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

    return Response.json({
      report: result,
      digest_name: digest.name,
      delivery_count: deliveries.length,
      requested_start: start_date,
      requested_end: end_date,
      actual_start,
      actual_end,
      period_label,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});