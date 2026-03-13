const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const ALLOWED_THEME_KEYS = new Set([
  "--bg-a",
  "--bg-b",
  "--text",
  "--muted",
  "--accent-primary",
  "--accent-secondary",
  "--accent-highlight",
  "--glass",
  "--glass-strong",
  "--line",
  "--radius-lg",
  "--radius-md",
  "--blur",
  "--shadow-soft",
  "--shadow-button",
  "--font-main",
  "--container-max",
]);

const ALLOWED_LAYOUT_MODES = new Set(["stack", "split", "magazine", "minimal"]);
const ALLOWED_SECTION_TYPES = new Set(["hero", "cards", "twoColumn", "text", "quote"]);
const ALLOWED_CARD_SIZES = new Set(["small", "medium", "large"]);
const BLOCKED_BOX_TITLES = new Set(["key takeaways", "discussion points", "final thoughts"]);
const ALLOWED_COMPOSITION_SLOTS = new Set([
  "motif",
  "canvas",
  "capture",
  "transcript",
  "markdown",
  "workflow",
  "logs",
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
  layout: {
    mode: "split",
    sections: [
      {
        type: "hero",
        heading: "Welcome to IS322",
        body: "Build confidence with weekly projects and practical workflows.",
        cta: "Start Here",
      },
      {
        type: "cards",
        heading: "Quick Start",
        items: [
          { title: "Syllabus", body: "Review outcomes and grading.", size: "large", spanColumns: 2 },
          { title: "Setup", body: "Install tools and verify environment.", size: "small", spanColumns: 1 },
        ],
      },
      {
        type: "twoColumn",
        left: { heading: "Plan", body: "Weekly checkpoints and milestones." },
        right: { heading: "Support", body: "Office hours and async help." },
      },
    ],
  },
  composition: {
    order: ["canvas", "capture", "transcript", "markdown", "workflow", "logs", "motif"],
    visible: ["canvas", "capture", "transcript", "markdown", "workflow", "logs"],
  },
  behavior: {
    updateTitle: false,
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
  "- layout.sections should contain between 0 and 6 items.",
  "- theme keys must only use the listed CSS vars.",
  "- layout.mode must be one of: stack, split, magazine, minimal.",
  "- section type must be one of: hero, cards, twoColumn, text, quote.",
  "- cards.items can include size (small|medium|large) and spanColumns (1-3).",
  "- composition.order can place any top-level section anywhere. Valid slots: motif, canvas, capture, transcript, markdown, workflow, logs.",
  "- composition.visible controls which top-level sections are shown.",
  "- behavior.updateTitle should be true when a title is provided.",
  "- If the user asks to remove or hide something, do not replace it with alternate filler content.",
  "- Do not copy literal values from the schema example.",
  "- Generate title and subtitle directly from the transcript meaning.",
].join("\n");

function deriveRemovalIntentFromTranscript(transcript) {
  const text = String(transcript || "").toLowerCase();
  const removeSectionTypes = new Set();
  const removeSlots = new Set();

  if (/(remove|hide|delete|without|no)\s+(the\s+)?cards?/.test(text)) {
    removeSectionTypes.add("cards");
  }
  if (/(remove|hide|delete|without|no)\s+(the\s+)?hero/.test(text)) {
    removeSectionTypes.add("hero");
  }
  if (/(remove|hide|delete|without|no)\s+(the\s+)?quote/.test(text)) {
    removeSectionTypes.add("quote");
  }
  if (/(remove|hide|delete|without|no)\s+(the\s+)?two\s*column/.test(text)) {
    removeSectionTypes.add("twoColumn");
  }
  if (/(remove|hide|delete|without|no)\s+(the\s+)?text\s*(section|block)?/.test(text)) {
    removeSectionTypes.add("text");
  }

  if (/(remove|hide|delete|without|no)\s+.*\blogs?\b/.test(text)) {
    removeSlots.add("logs");
  }
  if (/(remove|hide|delete|without|no)\s+.*\bworkflow\b/.test(text)) {
    removeSlots.add("workflow");
  }
  if (/(remove|hide|delete|without|no)\s+.*\bmarkdown\b/.test(text)) {
    removeSlots.add("markdown");
  }
  if (/(remove|hide|delete|without|no)\s+.*\btranscript\b/.test(text)) {
    removeSlots.add("transcript");
  }
  if (/(remove|hide|delete|without|no)\s+.*\bcapture\b/.test(text)) {
    removeSlots.add("capture");
  }
  if (/(remove|hide|delete|without|no)\s+.*\bmotif\b/.test(text)) {
    removeSlots.add("motif");
  }
  if (/(remove|hide|delete|without|no)\s+.*\bcanvas\b/.test(text)) {
    removeSlots.add("canvas");
  }

  return { removeSectionTypes, removeSlots };
}

function hasExplicitTitleUpdateIntent(transcript) {
  const text = String(transcript || "").toLowerCase();
  return /(change|rename|update|set|replace)\s+.*\b(title|page title|headline|page name)\b/.test(text);
}

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
    layout: {
      mode: "split",
      sections: [
        {
          type: "hero",
          heading: title,
          body: subtitle,
          cta: "Explore",
        },
        {
          type: "cards",
          heading: "Highlights",
          items: [
            {
              title: "Transcript",
              body: normalized || "No transcript content available.",
            },
            {
              title: "Action",
              body: "Refine your spoken request to control layout, sections, and tone more precisely.",
            },
          ],
        },
      ],
    },
    composition: {
      order: ["canvas", "capture", "transcript", "workflow", "markdown", "logs", "motif"],
      visible: ["canvas", "capture", "transcript", "workflow", "markdown", "logs"],
    },
    behavior: {
      updateTitle: true,
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

function deriveStyleThemeOverridesFromTranscript(transcript) {
  const text = String(transcript || "").toLowerCase();
  const overrides = {};
  const isDarkIntent = /(dark|cinematic|night|noir)/.test(text);

  if (isDarkIntent) {
    overrides["--bg-a"] = "#111111";
    overrides["--bg-b"] = "#1f232a";
    overrides["--text"] = "#f2f4f8";
    overrides["--muted"] = "#c3cad6";
    overrides["--glass"] = "rgba(26, 30, 36, 0.62)";
    overrides["--glass-strong"] = "rgba(30, 35, 44, 0.76)";
    overrides["--line"] = "rgba(255, 255, 255, 0.14)";
  }

  if (/(light|airy|clean|minimal)/.test(text)) {
    overrides["--bg-a"] = "#f7f7f4";
    overrides["--bg-b"] = "#ebf1f8";
    overrides["--text"] = "#17202a";
    overrides["--muted"] = "#4e5d6c";
    overrides["--glass"] = "rgba(255, 255, 255, 0.58)";
    overrides["--glass-strong"] = "rgba(255, 255, 255, 0.8)";
    overrides["--line"] = "rgba(71, 86, 110, 0.18)";
  }

  if (/(high contrast|bold contrast|contrast)/.test(text)) {
    overrides["--text"] = isDarkIntent ? "#f3f7ff" : "#0d1117";
    overrides["--muted"] = isDarkIntent ? "#c8d2e3" : "#283445";
    overrides["--accent-primary"] = "#b81e18";
    overrides["--accent-secondary"] = "#0f2f67";
  }

  if (/(round|rounded|soft corners)/.test(text)) {
    overrides["--radius-lg"] = "24px";
    overrides["--radius-md"] = "16px";
  }

  if (/(sharp|tight radius|square)/.test(text)) {
    overrides["--radius-lg"] = "10px";
    overrides["--radius-md"] = "8px";
  }

  if (/(strong shadow|stronger shadow|strong shadows|stronger shadows|deeper shadow|dramatic shadow)/.test(text)) {
    overrides["--shadow-soft"] = "0 22px 46px rgba(14, 18, 28, 0.28)";
    overrides["--shadow-button"] = "0 12px 26px rgba(15, 47, 103, 0.38)";
  }

  return overrides;
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

  const removalIntent = deriveRemovalIntentFromTranscript(transcript);
  if (!looksLikePlaceholder) {
    const styleOverrides = deriveStyleThemeOverridesFromTranscript(transcript);
    const enriched = {
      ...transform,
      theme: {
        ...(transform?.theme || {}),
        ...styleOverrides,
      },
      behavior: {
        ...(transform?.behavior || {}),
        updateTitle: true,
      },
    };
    return applyRemovalIntent(enriched, removalIntent);
  }

  const styleOverrides = deriveStyleThemeOverridesFromTranscript(transcript);

  const enriched = {
    ...transform,
    page: {
      title: heuristic.page.title,
      subtitle: heuristic.page.subtitle,
    },
    panels:
      Array.isArray(transform?.panels) && transform.panels.length > 0
        ? transform.panels
        : heuristic.panels,
    layout:
      transform?.layout && Array.isArray(transform.layout.sections) && transform.layout.sections.length > 0
        ? transform.layout
        : heuristic.layout,
    composition:
      transform?.composition && Array.isArray(transform.composition.order)
        ? transform.composition
        : heuristic.composition,
    theme: {
      ...(transform?.theme || {}),
      ...styleOverrides,
    },
    behavior: {
      ...(transform?.behavior || {}),
      updateTitle: true,
    },
  };

  return applyRemovalIntent(enriched, removalIntent);
}

function applyRemovalIntent(transform, removalIntent) {
  const removeSectionTypes = removalIntent?.removeSectionTypes || new Set();
  const removeSlots = removalIntent?.removeSlots || new Set();

  const currentSections = Array.isArray(transform?.layout?.sections) ? transform.layout.sections : [];
  const filteredSections =
    removeSectionTypes.size > 0
      ? currentSections.filter((section) => !removeSectionTypes.has(String(section?.type || "text").trim()))
      : currentSections;

  const currentVisible = Array.isArray(transform?.composition?.visible)
    ? transform.composition.visible
    : ["canvas", "capture", "transcript", "markdown", "workflow", "logs", "motif"];
  const filteredVisible =
    removeSlots.size > 0
      ? currentVisible.filter((slot) => !removeSlots.has(String(slot || "").trim().toLowerCase()))
      : currentVisible;

  return {
    ...transform,
    layout: {
      ...(transform?.layout || {}),
      sections: filteredSections,
    },
    composition: {
      ...(transform?.composition || {}),
      visible: filteredVisible,
    },
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
  const layout = source.layout && typeof source.layout === "object" ? source.layout : {};
  const composition =
    source.composition && typeof source.composition === "object" ? source.composition : {};
  const behavior = source.behavior && typeof source.behavior === "object" ? source.behavior : {};

  function isBlockedBoxTitle(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized ? BLOCKED_BOX_TITLES.has(normalized) : false;
  }

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
    .filter((item) => item.heading && item.body && !isBlockedBoxTitle(item.heading))
    .slice(0, 4);

  const mode = String(layout.mode || "stack").trim().toLowerCase();
  const normalizedMode = ALLOWED_LAYOUT_MODES.has(mode) ? mode : "stack";

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const hasExplicitEmptySections = Array.isArray(layout.sections) && layout.sections.length === 0;
  const normalizedSections = sections
    .map((section) => {
      const type = String(section?.type || "text").trim();
      if (!ALLOWED_SECTION_TYPES.has(type)) {
        return null;
      }

      if (type === "cards") {
        const items = Array.isArray(section.items)
          ? section.items
              .map((item) => ({
                title: String(item?.title || "").trim(),
                body: String(item?.body || "").trim(),
                size: ALLOWED_CARD_SIZES.has(String(item?.size || "").trim().toLowerCase())
                  ? String(item.size).trim().toLowerCase()
                  : "medium",
                spanColumns: Math.max(1, Math.min(3, Number(item?.spanColumns || 1) || 1)),
              }))
                .filter((item) => item.title && item.body && !isBlockedBoxTitle(item.title))
              .slice(0, 6)
          : [];

        return {
          type,
          heading: String(section?.heading || "Highlights").trim(),
          items,
        };
      }

      if (type === "twoColumn") {
        return {
          type,
          left: {
            heading: String(section?.left?.heading || "Left").trim(),
            body: String(section?.left?.body || "").trim(),
          },
          right: {
            heading: String(section?.right?.heading || "Right").trim(),
            body: String(section?.right?.body || "").trim(),
          },
        };
      }

      return {
        type,
        heading: String(section?.heading || "Section").trim(),
        body: String(section?.body || "").trim(),
        cta: String(section?.cta || "").trim(),
      };
    })
    .filter(Boolean)
    .filter((section) => !isBlockedBoxTitle(section?.heading))
    .slice(0, 6);

  const fallbackSections = (normalizedPanels.length > 0
    ? normalizedPanels
    : [
        {
          heading: "Summary",
          body: "Could not extract structured sections from model output. Please try a more explicit transcript.",
        },
      ]).map((panel) => ({
    type: "text",
    heading: panel.heading,
    body: panel.body,
  }));

  const requestedOrder = Array.isArray(composition.order) ? composition.order : [];
  const normalizedOrder = requestedOrder
    .map((slot) => String(slot || "").trim().toLowerCase())
    .filter((slot) => ALLOWED_COMPOSITION_SLOTS.has(slot));

  const requestedVisible = Array.isArray(composition.visible) ? composition.visible : [];
  const normalizedVisible = requestedVisible
    .map((slot) => String(slot || "").trim().toLowerCase())
    .filter((slot) => ALLOWED_COMPOSITION_SLOTS.has(slot));

  return {
    page: {
      title: String(page.title || "Voice-Driven Site Update").trim(),
      subtitle: String(page.subtitle || "Transcript converted into live page content.").trim(),
    },
    theme: normalizedTheme,
    layout: {
      mode: normalizedMode,
      sections: hasExplicitEmptySections
        ? []
        : (normalizedSections.length > 0 ? normalizedSections : fallbackSections),
    },
    composition: {
      order:
        normalizedOrder.length > 0
          ? normalizedOrder
          : ["canvas", "capture", "transcript", "markdown", "workflow", "logs", "motif"],
      visible:
        normalizedVisible.length > 0
          ? normalizedVisible
          : ["canvas", "capture", "transcript", "markdown", "workflow", "logs", "motif"],
    },
    behavior: {
      updateTitle: Boolean(behavior.updateTitle),
    },
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
