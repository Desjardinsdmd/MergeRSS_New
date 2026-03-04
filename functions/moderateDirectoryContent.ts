import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description, tags = [] } = await req.json();

    if (!name) {
      return Response.json({ error: 'Missing content to moderate' }, { status: 400 });
    }

    const contentToCheck = [name, description, ...tags].filter(Boolean).join(' ');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a content moderator. Analyze the following content for explicit material, adult content, or inappropriate language. Be strict but reasonable - political views, controversial topics, or niche interests are fine, but sexual, violent, hateful, or illegal content should be flagged.

Content to moderate:
"${contentToCheck}"

Respond with a JSON object: { "is_safe": boolean, "reason": string }

If safe, reason should be empty string. If not safe, reason should briefly explain why.`,
      response_json_schema: {
        type: 'object',
        properties: {
          is_safe: { type: 'boolean' },
          reason: { type: 'string' }
        },
        required: ['is_safe', 'reason']
      }
    });

    return Response.json({
      is_safe: result.is_safe,
      reason: result.reason
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});