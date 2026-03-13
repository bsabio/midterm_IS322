import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateSiteTransformFromTranscript } from "./lib/transformEngine.js";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const MAX_PORT_ATTEMPTS = 20;
let activePort = DEFAULT_PORT;

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "whisper-1";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a technical editor.",
  "Convert transcript text into a strict Markdown blog post.",
  "Output Markdown only with this exact section order:",
  "# Title",
  "## Summary",
  "## Key Insights",
  "## Actionable Steps",
  "## Closing Thoughts",
  "Rules:",
  "- No HTML.",
  "- No code fences unless transcript explicitly includes code.",
  "- Keep tone professional and concise.",
  "- Preserve factual meaning; do not invent facts.",
].join("\n");

app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.includes("YOUR_")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildOllamaPrompt(transcript, systemPrompt) {
  return [
    systemPrompt,
    "",
    "Output only raw Markdown for a professional blog post. Do not include markdown fences or extra text.",
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

async function generateMarkdownWithOllama({ transcript, systemPrompt }) {
  const prompt = buildOllamaPrompt(transcript, systemPrompt || DEFAULT_SYSTEM_PROMPT);
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
    throw new Error(`Ollama generate failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return String(data.response || "").trim();
}

function utf8ToBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTransformCardsHtml(transform) {
  const panels = Array.isArray(transform?.panels) ? transform.panels : [];
  return panels
    .map((panel) => {
      const heading = escapeHtml(panel?.heading || "Section");
      const body = escapeHtml(panel?.body || "");
      return [
        '<article class="transform-card">',
        `  <h3>${heading}</h3>`,
        `  <p>${body}</p>`,
        "</article>",
      ].join("\n");
    })
    .join("\n");
}

function applyTransformToIndexHtml(indexHtml, transform) {
  const title = escapeHtml(transform?.page?.title || "Voice-to-Blog POC");
  const subtitle = escapeHtml(transform?.page?.subtitle || "Transcript converted into live page content.");
  const cardsHtml = buildTransformCardsHtml(transform);

  let updated = indexHtml;
  updated = updated.replace(
    /<h1 id="pageTitle">[\s\S]*?<\/h1>/,
    `<h1 id="pageTitle">${title}</h1>`
  );
  updated = updated.replace(
    /<p id="pageSubtitle" class="muted">[\s\S]*?<\/p>/,
    `<p id="pageSubtitle" class="muted">${subtitle}</p>`
  );
  updated = updated.replace(
    /<div id="transformSections" class="grid-sections">[\s\S]*?<\/div>/,
    `<div id="transformSections" class="grid-sections">\n${cardsHtml}\n</div>`
  );

  return updated;
}

async function publishMarkdown({ path, markdown, sha, message }) {
  const token = requireEnv("GITHUB_TOKEN");
  const owner = requireEnv("GITHUB_OWNER");
  const repo = requireEnv("GITHUB_REPO");

  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  if (!cleanPath) {
    throw new Error("GitHub path is required, for example: posts/my-post.md");
  }
  if (!markdown || !markdown.trim()) {
    throw new Error("Markdown content is empty.");
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(cleanPath)}`;
  const payload = {
    message: message || `chore(content): publish ${cleanPath}`,
    content: utf8ToBase64(markdown),
    branch: GITHUB_BRANCH,
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Content API publish failed: ${response.status} ${text}`);
  }

  return response.json();
}

app.get("/api/health", async (_req, res) => {
  let ollama = "unknown";
  try {
    const tags = await fetch("http://127.0.0.1:11434/api/tags", { method: "GET" });
    ollama = tags.ok ? "up" : "down";
  } catch {
    ollama = "down";
  }

  res.json({
    ok: true,
    ollama,
    port: activePort,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const token = requireEnv("OPENAI_API_KEY");
    if (!req.file) {
      return res.status(400).json({ error: "Missing multipart file field: audio" });
    }

    const blob = new Blob([req.file.buffer], {
      type: req.file.mimetype || "audio/webm",
    });

    const formData = new FormData();
    formData.append("model", WHISPER_MODEL);
    formData.append("file", blob, req.file.originalname || "recording.webm");

    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Whisper transcription failed: ${text}` });
    }

    const data = await response.json();
    return res.json({ transcript: data.text || "" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Transcription failed." });
  }
});

app.post("/api/format", async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || "").trim();
    const systemPrompt = String(req.body?.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();

    if (!transcript) {
      return res.status(400).json({ error: "transcript is required" });
    }

    const markdown = await generateMarkdownWithOllama({ transcript, systemPrompt });
    return res.json({ markdown });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Format failed." });
  }
});

app.post("/api/transform", async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || req.body?.prompt || "").trim();
    const result = await generateSiteTransformFromTranscript(transcript);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Transform failed." });
  }
});

app.post("/api/transform/apply", async (req, res) => {
  try {
    if (process.env.VERCEL) {
      return res.status(400).json({
        error: "Persisting source files is not supported on Vercel runtime.",
      });
    }

    const transform = req.body?.transform;
    if (!transform || typeof transform !== "object") {
      return res.status(400).json({ error: "transform object is required" });
    }

    const indexPath = path.resolve(process.cwd(), "index.html");
    const currentHtml = await readFile(indexPath, "utf8");
    const updatedHtml = applyTransformToIndexHtml(currentHtml, transform);
    await writeFile(indexPath, updatedHtml, "utf8");

    return res.json({
      ok: true,
      message: "Updated index.html with transformed title, subtitle, and sections.",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Persist transform failed." });
  }
});

app.post("/api/publish", async (req, res) => {
  try {
    const result = await publishMarkdown({
      path: req.body?.path,
      markdown: req.body?.markdown,
      sha: req.body?.sha || null,
      message: req.body?.message,
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Publish failed." });
  }
});

app.post("/api/workflow", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const systemPrompt = String(req.body?.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
    const publish = Boolean(req.body?.publish);
    const publishPath = String(req.body?.publishPath || "").trim();
    const sha = req.body?.sha || null;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const markdown = await generateMarkdownWithOllama({ transcript: prompt, systemPrompt });

    if (!publish) {
      return res.json({ markdown, published: false });
    }

    const publishResult = await publishMarkdown({
      path: publishPath,
      markdown,
      sha,
      message: `chore(content): publish ${publishPath}`,
    });

    return res.json({
      markdown,
      published: true,
      publishResult,
      htmlUrl: publishResult?.content?.html_url || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Workflow failed." });
  }
});

function startServer(startPort, attempt = 0) {
  const port = startPort + attempt;
  const server = app.listen(port, "127.0.0.1", () => {
    activePort = port;
    console.log(`Backend server running at http://127.0.0.1:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
      console.error(`Port ${port} is already in use, trying ${port + 1}...`);
      startServer(startPort, attempt + 1);
      return;
    }

    console.error(`Failed to start backend server: ${err.message}`);
    process.exitCode = 1;
  });
}

startServer(DEFAULT_PORT);
