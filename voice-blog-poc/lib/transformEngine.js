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
    title: "Transcript-Derived Page Title",
    subtitle: "One sentence summary derived from transcript content.",
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
  "- Do not copy literal values from the schema example.",
  "- Generate title and subtitle directly from the transcript meaning.",
].join("\n");

function createHeuristicTransformFromTranscript(transcript) {
  const normalized = String(transcript || "").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);

  const titleSeed = words.slice(0, 8).join(" ");
  const title = titleSeed ? `Voice Update: ${titleSeed}` : "Voice-Driven Site Update";

  const subtitle = words.length > 10
    ? words.slice(0, 18).join(" ")
    : "Transcript converted into live page content.";

  return {
    page: {
      title,
      subtitle,
    },
    theme: {
      "--bg-a": "#f6efe7",
      "--bg-b": "#e4edf7",
      "--accent-primary": "#c5483f",
      "--accent-secondary": "#1b3a6b",
      "--accent-highlight": "#e3ad31",
    },
    panels: [
      {
        heading: "Transcript Summary",
        body: normalized || "No transcript content available.",
      },
      {
        heading: "Next Step",
        body: "Refine the spoken prompt with exact layout and wording requirements for more precise page updates.",
      },
    ],
  };
}

function enrichTransformWithTranscript(transform, transcript) {
  const heuristic = createHeuristicTransformFromTranscript(transcript);
  const title = String(transform?.page?.title || "").trim();
  const subtitle = String(transform?.page?.subtitle || "").trim();
  const looksLikePlaceholder =
    !title ||
    title === "Transcript-Derived Page Title" ||
    title === "Local AI Workflow Notes" ||
    !subtitle ||
    subtitle === "One sentence summary derived from transcript content." ||
    subtitle === "A compact recap generated from voice input.";

  if (!looksLikePlaceholder) {
    return transform;
  }

  return {
    ...transform,
    page: {
      title: heuristic.page.title,
      subtitle: heuristic.page.subtitle,
    },
    panels:
      Array.isArray(transform?.panels) && transform.panels.length > 0
        ? transform.panels
        : heuristic.panels,
  };
}

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
  const normalized = normalizeTransformShape(safeJsonParse(content));
  return enrichTransformWithTranscript(normalized, transcript);
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
  const normalized = normalizeTransformShape(safeJsonParse(data?.response || ""));
  return enrichTransformWithTranscript(normalized, transcript);
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
