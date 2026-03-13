/**
 * Module: blogFormatterService
 * Purpose: Convert raw transcript text into a strict Markdown blog post using an LLM.
 */

import {
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  BLOG_MODEL,
  USE_OLLAMA_FOR_BLOG,
} from "./config.js";
import { generateBlogWithOllama } from "./ollamaClient.js";

const STRICT_MARKDOWN_SYSTEM_PROMPT = [
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

/**
 * Formats transcript into strict Markdown using an LLM.
 * @param {string} transcript - Plain transcript text.
 * @returns {Promise<string>} Strict Markdown blog post.
 */
export async function formatTranscriptToMarkdownBlog(transcript) {
  if (!transcript || !transcript.trim()) {
    throw new Error("Transcript is empty.");
  }

  if (USE_OLLAMA_FOR_BLOG) {
    return processWithOllama(transcript);
  }

  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes("YOUR_OPENAI_API_KEY")) {
    throw new Error("Set OPENAI_API_KEY in src/config.js before calling blog formatter.");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: BLOG_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: STRICT_MARKDOWN_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Transcript:\n\n${transcript}\n\nConvert now to strict Markdown.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Blog formatting failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// Example function to process transcript with local Ollama
export async function processWithOllama(transcript) {
  return generateBlogWithOllama({
    transcript,
    systemPrompt:
      "You are an Expert Web Developer. Convert this voice transcript into a professional Markdown blog post.",
    outputFormat: "markdown",
  });
}
