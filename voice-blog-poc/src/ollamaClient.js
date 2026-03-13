/**
 * Module: ollamaClient
 * Purpose: Browser-side communication with a local Ollama server.
 */

import { OLLAMA_URL, OLLAMA_MODEL } from "./config.js";

async function diagnoseOllamaConnectivity() {
  try {
    // no-cors allows us to differentiate transport failures from CORS restrictions.
    await fetch("http://localhost:11434/api/tags", { method: "GET", mode: "no-cors" });
    return "cors-likely";
  } catch {
    return "not-running";
  }
}

/**
 * Sends transcript + system prompt to local Ollama and returns Markdown or JSON output.
 *
 * @param {Object} params
 * @param {string} params.transcript - Raw transcript text.
 * @param {string} params.systemPrompt - System prompt instruction.
 * @param {"markdown"|"json"} [params.outputFormat="markdown"] - Expected output format.
 * @returns {Promise<string|Object>} Raw markdown string or parsed JSON object.
 */
export async function generateBlogWithOllama({
  transcript,
  systemPrompt,
  outputFormat = "markdown",
}) {
  if (!transcript || !transcript.trim()) {
    throw new Error("Transcript is empty.");
  }

  if (!systemPrompt || !systemPrompt.trim()) {
    throw new Error("System prompt is empty.");
  }

  const formatInstruction =
    outputFormat === "json"
      ? "Output only valid JSON for a blog post. Do not include markdown fences or extra text."
      : "Output only raw Markdown for a professional blog post. Do not include markdown fences or extra text.";

  const prompt = [
    systemPrompt.trim(),
    "",
    formatInstruction,
    "",
    "Transcript:",
    transcript,
  ].join("\n");

  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL, // llama3.2:3b is CPU/RAM-friendly for this laptop class
        prompt,
        stream: false,
      }),
    });
  } catch {
    const diagnosis = await diagnoseOllamaConnectivity();
    if (diagnosis === "not-running") {
      throw new Error(
        "Could not connect to Ollama at http://localhost:11434. Ensure Ollama is running (for example: ollama serve)."
      );
    }
    throw new Error(
      "Request blocked before reaching Ollama. This is likely a local CORS or browser security configuration issue."
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 403 || response.status === 405) {
      throw new Error(
        `Ollama rejected the browser request (${response.status}). Check OLLAMA_ORIGINS/CORS settings. Details: ${errorText}`
      );
    }
    throw new Error(`Ollama generate failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const output = String(data.response || "").trim();

  if (outputFormat === "json") {
    try {
      return JSON.parse(output);
    } catch {
      throw new Error("Ollama did not return valid JSON while outputFormat=json was requested.");
    }
  }

  return output;
}
