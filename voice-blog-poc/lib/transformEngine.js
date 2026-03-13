const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const ALLOWED_THEME_KEYS = new Set([
  "--bg-a",
  "--bg-b",
  "--accent-primary",
  "--accent-secondary",
  "--accent-highlight",
]);

const TRANSFORM_SCHEMA_EXAMPLE = {
  page: {
    title: "Local AI Workflow Notes",
    subtitle: "A compact recap generated from voice input.",
  },
  theme: {
    "--bg-a": "#f6efe7",
    "--bg-b": "#e4edf7",
    "--accent-primary": "#c5483f",
    "--accent-secondary": "#1b3a6b",
    "--accent-highlight": "#e3ad31",
  },
  panels: [
    { heading: "Summary", body: "One or two concise paragraphs." },
    { heading: "Next Steps", body: "A short numbered plan in plain text." },
  ],
};

const TRANSFORM_PROMPT = [
  "Convert the transcript into a site transformation JSON object.",
  "Return JSON only. Do not include markdown fences.",
  "Use this exact top-level shape:",
  JSON.stringify(TRANSFORM_SCHEMA_EXAMPLE),
  "Rules:",
  "- Keep values concise.",
  "- panels must contain between 2 and 4 items.",
  "- theme keys must only use the listed CSS vars.",
].join("\n");

function stripCodeFences(value) {
  const text = String(value || "").trim();
  if (text.startsWith("```") && text.endsWith("```")) {
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return text;
}

function safeJsonParse(value) {
  const cleaned = stripCodeFences(value);
  return JSON.parse(cleaned);
}

function normalizeTransformShape(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const page = source.page && typeof source.page === "object" ? source.page : {};
  const theme = source.theme && typeof source.theme === "object" ? source.theme : {};
  const panels = Array.isArray(source.panels) ? source.panels : [];

  const normalizedTheme = {};
  for (const [key, value] of Object.entries(theme)) {
    if (!ALLOWED_THEME_KEYS.has(key)) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      normalizedTheme[key] = value.trim();
    }
  }

  const normalizedPanels = panels
    .map((item) => ({
      heading: String(item?.heading || "").trim(),
      body: String(item?.body || "").trim(),
    }))
    .filter((item) => item.heading && item.body)
    .slice(0, 4);

  return {
    page: {
      title: String(page.title || "Voice-Driven Site Update").trim(),
      subtitle: String(page.subtitle || "Transcript converted into live page content.").trim(),
    },
    theme: normalizedTheme,
    panels:
      normalizedPanels.length > 0
        ? normalizedPanels
        : [
            {
              heading: "Summary",
              body: "Could not extract structured panels from model output. Please try again with a more explicit transcript.",
            },
          ],
  };
}

async function generateWithOpenAI(transcript) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) {
    throw new Error("Missing OPENAI_API_KEY for OpenAI transform generation.");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You generate strict JSON for UI transformations." },
        { role: "user", content: `${TRANSFORM_PROMPT}\n\nTranscript:\n${transcript}` },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI transform request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return normalizeTransformShape(safeJsonParse(content));
}

async function generateWithOllama(transcript) {
  const prompt = `${TRANSFORM_PROMPT}\n\nTranscript:\n${transcript}`;
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama transform request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return normalizeTransformShape(safeJsonParse(data?.response || ""));
}

export async function generateSiteTransformFromTranscript(transcript) {
  const text = String(transcript || "").trim();
  if (!text) {
    throw new Error("Transcript is required.");
  }

  const preferredProvider = (process.env.TRANSFORM_PROVIDER || "auto").toLowerCase();

  if (preferredProvider === "openai") {
    const transform = await generateWithOpenAI(text);
    return { transform, provider: "openai" };
  }

  if (preferredProvider === "ollama") {
    const transform = await generateWithOllama(text);
    return { transform, provider: "ollama" };
  }

  try {
    const transform = await generateWithOpenAI(text);
    return { transform, provider: "openai" };
  } catch (openAiError) {
    const transform = await generateWithOllama(text);
    return {
      transform,
      provider: "ollama",
      fallbackReason: openAiError.message,
    };
  }
}
