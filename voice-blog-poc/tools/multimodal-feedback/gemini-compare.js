import { readFile } from "node:fs/promises";

function extractJson(rawText) {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim());
    }
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error("Gemini response did not contain valid JSON.");
  }
}

function buildPrompt(viewportName) {
  return [
    "You are a multimodal design QA system.",
    `Evaluate the generated website screenshot against the NJIT reference screenshot for viewport: ${viewportName}.`,
    "Legal boundary: Do not ask for trademark/logo cloning or pixel-perfect copying.",
    "Focus on original but consistent quality and polish.",
    "Assess categories:",
    "- visual_hierarchy",
    "- alignment_grid_consistency",
    "- typography_scale_weight_balance",
    "- color_harmony_contrast",
    "- spacing_padding_consistency",
    "- header_hero_nav_footer_coherence",
    "- glassmorphism_quality",
    "- bauhaus_influence",
    "Return strict JSON only with this schema:",
    "{",
    '  "score_overall": number,',
    '  "score_by_category": { "visual_hierarchy": number, "alignment_grid_consistency": number, "typography_scale_weight_balance": number, "color_harmony_contrast": number, "spacing_padding_consistency": number, "header_hero_nav_footer_coherence": number, "glassmorphism_quality": number, "bauhaus_influence": number },',
    '  "critical_issues": [string],',
    '  "suggested_code_changes": [{ "file": string, "selector_or_component": string, "exact_change": string }],',
    '  "confidence": number,',
    '  "rationale": string',
    "}",
  ].join("\n");
}

export async function compareWithGemini({
  model,
  apiKey,
  viewportName,
  generatedPath,
  referencePath,
}) {
  const [generatedBuffer, referenceBuffer] = await Promise.all([
    readFile(generatedPath),
    readFile(referencePath),
  ]);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(viewportName) },
            {
              inline_data: {
                mime_type: "image/png",
                data: generatedBuffer.toString("base64"),
              },
            },
            {
              inline_data: {
                mime_type: "image/png",
                data: referenceBuffer.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response did not include text content.");
  }

  return extractJson(text);
}
