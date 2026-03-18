import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ─── STAGE 1: Article Understanding ────────────────────────────────────────
async function analyzeArticle(base44, title, content) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `Analyze this article and return a structured JSON object.

Title: ${title}
Content: ${content.slice(0, 4000)}

Return ONLY this JSON (no markdown, no explanation):
{
  "title": "",
  "content_type": "news | analysis | explainer | opinion | technical | narrative",
  "primary_topic": "",
  "primary_claim_or_event": "",
  "secondary_points": [],
  "key_entities": [],
  "spatial_elements": [],
  "temporal_elements": [],
  "quantitative_elements": [],
  "article_mode": "physical_event | process_explanation | abstract_analysis | mixed"
}`,
    response_json_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content_type: { type: "string" },
        primary_topic: { type: "string" },
        primary_claim_or_event: { type: "string" },
        secondary_points: { type: "array", items: { type: "string" } },
        key_entities: { type: "array", items: { type: "string" } },
        spatial_elements: { type: "array", items: { type: "string" } },
        temporal_elements: { type: "array", items: { type: "string" } },
        quantitative_elements: { type: "array", items: { type: "string" } },
        article_mode: { type: "string" }
      }
    }
  });
  return result;
}

// ─── STAGE 2: Visual Value Scoring ─────────────────────────────────────────
async function scoreVisualValue(base44, analysis) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `Score this article for visual value using the exact framework below.

Article analysis:
${JSON.stringify(analysis, null, 2)}

Score each dimension honestly. Return ONLY this JSON:
{
  "concreteness": <0-25, how concrete/tangible the subject matter is>,
  "explanatory_gain": <0-25, how much a visual would help understanding>,
  "specificity": <0-20, how specific and unique the visual subject is>,
  "novelty": <0-15, how new/unexpected the situation is>,
  "risk_penalty": <0-15, risk of producing generic/misleading/decorative image>,
  "rationale": "one sentence explaining the score"
}

Be strict. Most articles do NOT benefit from visuals. Reserve high scores (75+) for articles that genuinely need a visual to be understood.`,
    response_json_schema: {
      type: "object",
      properties: {
        concreteness: { type: "number" },
        explanatory_gain: { type: "number" },
        specificity: { type: "number" },
        novelty: { type: "number" },
        risk_penalty: { type: "number" },
        rationale: { type: "string" }
      }
    }
  });

  const score = (result.concreteness || 0) + (result.explanatory_gain || 0) +
                (result.specificity || 0) + (result.novelty || 0) - (result.risk_penalty || 0);

  return {
    breakdown: result,
    visual_value_score: Math.max(0, Math.min(100, score))
  };
}

// ─── STAGE 3 & 4: Decision + Visual Type + Concept Extraction ──────────────
async function decideAndExtract(base44, analysis, scoring) {
  const { visual_value_score } = scoring;

  // Hard reject below 60
  if (visual_value_score < 60) {
    return {
      decision: 'reject',
      visual_type: 'reject',
      visual_spec: null,
      rejection_reason: `Visual value score ${visual_value_score.toFixed(1)} is below minimum threshold of 60`
    };
  }

  // For scores 60–74, only allow diagram
  const allowedTypes = visual_value_score >= 75 ? ['scene', 'diagram'] : ['diagram'];

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are a visual editorial director. Based on this article analysis, decide the best visual approach.

Article analysis:
${JSON.stringify(analysis, null, 2)}

Visual value score: ${visual_value_score.toFixed(1)}
Allowed visual types: ${allowedTypes.join(', ')}

Rules:
- Use "scene" for physical events, locations, or spatial situations
- Use "diagram" for processes, systems, relationships, or cause/effect
- Use "reject" if you cannot produce a specific, non-generic visual

You MUST return ONE visual concept only. Return ONLY this JSON:

If scene:
{
  "visual_type": "scene",
  "core_visual_idea": "",
  "subject": "",
  "environment": "",
  "key_action": "",
  "important_objects": [],
  "scale_cues": [],
  "mood_tone": "",
  "camera_framing": "wide | medium | aerial | isometric",
  "must_include": [],
  "must_avoid": [],
  "caption": ""
}

If diagram:
{
  "visual_type": "diagram",
  "core_visual_idea": "",
  "diagram_structure": "flowchart | layered_stack | comparison | map | network | timeline",
  "main_nodes": [],
  "relationships": [],
  "labels": [],
  "must_include": [],
  "must_avoid": [],
  "caption": ""
}

If rejecting:
{
  "visual_type": "reject",
  "rejection_reason": "specific reason why this article cannot produce a good visual"
}`,
    response_json_schema: {
      type: "object",
      properties: {
        visual_type: { type: "string" },
        core_visual_idea: { type: "string" },
        subject: { type: "string" },
        environment: { type: "string" },
        key_action: { type: "string" },
        important_objects: { type: "array", items: { type: "string" } },
        scale_cues: { type: "array", items: { type: "string" } },
        mood_tone: { type: "string" },
        camera_framing: { type: "string" },
        diagram_structure: { type: "string" },
        main_nodes: { type: "array", items: { type: "string" } },
        relationships: { type: "array", items: { type: "string" } },
        labels: { type: "array", items: { type: "string" } },
        must_include: { type: "array", items: { type: "string" } },
        must_avoid: { type: "array", items: { type: "string" } },
        caption: { type: "string" },
        rejection_reason: { type: "string" }
      }
    }
  });

  if (result.visual_type === 'reject') {
    return {
      decision: 'reject',
      visual_type: 'reject',
      visual_spec: null,
      rejection_reason: result.rejection_reason || 'Editorial decision: no specific visual possible'
    };
  }

  return {
    decision: 'generate',
    visual_type: result.visual_type,
    visual_spec: result,
    rejection_reason: null
  };
}

// ─── STAGE 5: Prompt Construction ──────────────────────────────────────────
const STYLE_ANCHOR = "clean editorial illustration, modern magazine visual language, high clarity composition, restrained detail, professional lighting, strong subject separation, no clutter, premium publication quality";

const NEGATIVE_PROMPT = "generic stock photo scenes, clutter, collage, multiple subjects, distorted anatomy, irrelevant objects, fake text, random skyline, corporate handshake imagery, blurry, low quality, watermark, text overlay, busy background, overly saturated";

function buildPrompt(visualSpec) {
  let positivePrompt = '';

  if (visualSpec.visual_type === 'scene') {
    const parts = [
      visualSpec.core_visual_idea,
      visualSpec.subject && `Subject: ${visualSpec.subject}`,
      visualSpec.environment && `Setting: ${visualSpec.environment}`,
      visualSpec.key_action && `Action: ${visualSpec.key_action}`,
      visualSpec.important_objects?.length > 0 && `Including: ${visualSpec.important_objects.join(', ')}`,
      visualSpec.mood_tone && `Mood: ${visualSpec.mood_tone}`,
      visualSpec.camera_framing && `${visualSpec.camera_framing} shot`,
      visualSpec.must_avoid?.length > 0 && `Avoid: ${visualSpec.must_avoid.join(', ')}`,
      STYLE_ANCHOR
    ].filter(Boolean);
    positivePrompt = parts.join('. ');
  } else if (visualSpec.visual_type === 'diagram') {
    const parts = [
      visualSpec.core_visual_idea,
      `${visualSpec.diagram_structure || 'flowchart'} diagram`,
      visualSpec.main_nodes?.length > 0 && `Nodes: ${visualSpec.main_nodes.join(', ')}`,
      visualSpec.relationships?.length > 0 && `Relationships: ${visualSpec.relationships.join('; ')}`,
      visualSpec.must_avoid?.length > 0 && `Avoid: ${visualSpec.must_avoid.join(', ')}`,
      "clean white background, clear labels, minimal design, editorial infographic style"
    ].filter(Boolean);
    positivePrompt = parts.join('. ');
  }

  return {
    positive_prompt: positivePrompt,
    negative_prompt: NEGATIVE_PROMPT,
    render_settings: {
      aspect_ratio: "16:9",
      detail_level: "medium",
      style_mode: "editorial"
    }
  };
}

// ─── STAGE 7: Image Generation ──────────────────────────────────────────────
async function generateImage(base44, prompt) {
  const result = await base44.asServiceRole.integrations.Core.GenerateImage({
    prompt: prompt.positive_prompt
  });
  return result?.url || null;
}

// ─── STAGE 8: Post-Generation Critique ────────────────────────────────────
async function critiqueImage(base44, imageUrl, visualSpec, articleAnalysis) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are a senior editorial art director. Critique this generated image for article use.

Article topic: ${articleAnalysis.primary_topic}
Primary claim: ${articleAnalysis.primary_claim_or_event}
Intended visual concept: ${visualSpec.core_visual_idea}
Caption intended: ${visualSpec.caption}

Evaluate the image strictly. Return ONLY this JSON:
{
  "clarity": <0-10, how clear and readable the image is>,
  "specificity": <0-10, how specific to this article vs generic>,
  "relevance": <0-10, how directly relevant to the article topic>,
  "visual_quality": <0-10, overall visual production quality>,
  "helpfulness": <0-10, does it help readers understand the article>,
  "fail_reasons": ["list any specific failure reasons, empty if none"],
  "passes": true/false
}

FAIL if: helpfulness < 7, relevance < 8, clarity < 7, or output is generic/decorative/multi-subject.`,
    file_urls: [imageUrl],
    response_json_schema: {
      type: "object",
      properties: {
        clarity: { type: "number" },
        specificity: { type: "number" },
        relevance: { type: "number" },
        visual_quality: { type: "number" },
        helpfulness: { type: "number" },
        fail_reasons: { type: "array", items: { type: "string" } },
        passes: { type: "boolean" }
      }
    }
  });

  // Enforce hard fail conditions
  const hardFail = (result.helpfulness < 7) || (result.relevance < 8) || (result.clarity < 7);
  result.passes = result.passes && !hardFail;

  return result;
}

// ─── STAGE 9: Refined Prompt for Retry ────────────────────────────────────
async function refinePrompt(base44, originalPrompt, critique, visualSpec) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `The first image generation failed critique. Refine the prompt to fix the specific issues.

Original positive prompt: ${originalPrompt.positive_prompt}
Fail reasons: ${critique.fail_reasons.join('; ')}
Critique scores: clarity=${critique.clarity}, specificity=${critique.specificity}, relevance=${critique.relevance}, helpfulness=${critique.helpfulness}
Core visual concept: ${visualSpec.core_visual_idea}

Return ONLY the refined positive_prompt as a JSON object:
{
  "positive_prompt": "..."
}

Make it more specific, eliminate the failure causes, keep the editorial style anchor.`,
    response_json_schema: {
      type: "object",
      properties: {
        positive_prompt: { type: "string" }
      }
    }
  });

  return {
    ...originalPrompt,
    positive_prompt: result.positive_prompt || originalPrompt.positive_prompt
  };
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { article_id, title, content, url } = await req.json();

    if (!article_id || !title) {
      return Response.json({ error: 'article_id and title are required' }, { status: 400 });
    }

    // Check if already processed
    const existing = await base44.asServiceRole.entities.ArticleVisual.filter({ article_id });
    if (existing.length > 0) {
      return Response.json({ success: true, result: existing[0], cached: true });
    }

    const articleText = content || title;

    console.log(`[VIE] Processing article: ${title.slice(0, 60)}`);

    // ── Stage 1: Article Understanding
    const analysis = await analyzeArticle(base44, title, articleText);
    console.log(`[VIE] Analysis complete. Mode: ${analysis.article_mode}, Type: ${analysis.content_type}`);

    // ── Stage 2: Visual Value Scoring
    const scoring = await scoreVisualValue(base44, analysis);
    console.log(`[VIE] Score: ${scoring.visual_value_score.toFixed(1)}`);

    // ── Stage 3+4: Decision + Visual Type + Concept Extraction
    const extraction = await decideAndExtract(base44, analysis, scoring);
    console.log(`[VIE] Decision: ${extraction.decision}, Type: ${extraction.visual_type}`);

    if (extraction.decision === 'reject') {
      const record = await base44.asServiceRole.entities.ArticleVisual.create({
        article_id,
        article_url: url || '',
        article_analysis: analysis,
        visual_value_score: scoring.visual_value_score,
        score_breakdown: scoring.breakdown,
        decision: 'reject',
        visual_type: 'reject',
        visual_spec: null,
        prompt: null,
        image_url: null,
        critique: null,
        generation_attempts: 0,
        final_outcome: 'rejected_low_score',
        rejection_reason: extraction.rejection_reason,
        pipeline_version: '1.0'
      });
      return Response.json({ success: true, result: record });
    }

    // ── Stage 5: Prompt Construction
    const prompt = buildPrompt(extraction.visual_spec);
    console.log(`[VIE] Prompt built: ${prompt.positive_prompt.slice(0, 80)}...`);

    // ── Stage 6+7: Generate Image (Attempt 1)
    let imageUrl = await generateImage(base44, prompt);
    let attempts = 1;
    let critique = null;
    let finalOutcome = 'rejected_after_critique';

    if (!imageUrl) {
      const record = await base44.asServiceRole.entities.ArticleVisual.create({
        article_id, article_url: url || '', article_analysis: analysis,
        visual_value_score: scoring.visual_value_score, score_breakdown: scoring.breakdown,
        decision: 'generate', visual_type: extraction.visual_type,
        visual_spec: extraction.visual_spec, prompt,
        image_url: null, critique: null, generation_attempts: 1,
        final_outcome: 'rejected_after_critique',
        rejection_reason: 'Image generation failed',
        pipeline_version: '1.0'
      });
      return Response.json({ success: true, result: record });
    }

    // ── Stage 8: Critique
    critique = await critiqueImage(base44, imageUrl, extraction.visual_spec, analysis);
    console.log(`[VIE] Critique: passes=${critique.passes}, helpfulness=${critique.helpfulness}, relevance=${critique.relevance}`);

    if (critique.passes) {
      finalOutcome = 'accepted';
    } else {
      // ── Stage 9: Regenerate Once
      console.log(`[VIE] Critique failed. Reasons: ${critique.fail_reasons.join('; ')}. Retrying...`);
      const refinedPrompt = await refinePrompt(base44, prompt, critique, extraction.visual_spec);
      const retryImageUrl = await generateImage(base44, refinedPrompt);
      attempts = 2;

      if (retryImageUrl) {
        const retryCritique = await critiqueImage(base44, retryImageUrl, extraction.visual_spec, analysis);
        console.log(`[VIE] Retry critique: passes=${retryCritique.passes}`);

        if (retryCritique.passes) {
          imageUrl = retryImageUrl;
          critique = retryCritique;
          finalOutcome = 'accepted';
        } else {
          imageUrl = null;
          critique = retryCritique;
          finalOutcome = 'rejected_after_retry';
        }
      } else {
        imageUrl = null;
        finalOutcome = 'rejected_after_retry';
      }
    }

    // ── Stage 10: Store
    const record = await base44.asServiceRole.entities.ArticleVisual.create({
      article_id,
      article_url: url || '',
      article_analysis: analysis,
      visual_value_score: scoring.visual_value_score,
      score_breakdown: scoring.breakdown,
      decision: 'generate',
      visual_type: extraction.visual_type,
      visual_spec: extraction.visual_spec,
      prompt,
      image_url: finalOutcome === 'accepted' ? imageUrl : null,
      critique,
      generation_attempts: attempts,
      final_outcome: finalOutcome,
      rejection_reason: finalOutcome !== 'accepted' ? critique?.fail_reasons?.join('; ') : null,
      pipeline_version: '1.0'
    });

    console.log(`[VIE] Pipeline complete. Outcome: ${finalOutcome}${finalOutcome === 'accepted' ? ' ✅' : ' ❌'}`);

    return Response.json({ success: true, result: record });
  } catch (error) {
    console.error('[VIE] Pipeline error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});