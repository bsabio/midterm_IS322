/**
 * Module: app
 * Purpose: UI orchestration only. Delegates recording/transcription/formatting to service modules.
 */

import { AudioRecorder } from "./audioRecorder.js";
import { transcribeAudioWithWhisper } from "./transcriptionService.js";
import { formatTranscriptToMarkdownBlog } from "./blogFormatterService.js";
import { USE_OLLAMA_FOR_BLOG } from "./config.js";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const transcribeBtn = document.getElementById("transcribeBtn");
const transformBtn = document.getElementById("transformBtn");
const formatBtn = document.getElementById("formatBtn");
const playback = document.getElementById("playback");
const transcriptEl = document.getElementById("transcript");
const markdownEl = document.getElementById("markdownBlog");
const logsEl = document.getElementById("logs");
const statusEl = document.getElementById("recordingStatus");
const pageTitleEl = document.getElementById("pageTitle");
const pageSubtitleEl = document.getElementById("pageSubtitle");
const transformStatusEl = document.getElementById("transformStatus");
const transformSectionsEl = document.getElementById("transformSections");
const promptInputEl = document.getElementById("promptInput");
const publishPathEl = document.getElementById("publishPath");
const publishToggleEl = document.getElementById("publishToggle");
const workflowBtn = document.getElementById("workflowBtn");
const publishStatusEl = document.getElementById("publishStatus");

const recorder = new AudioRecorder();
let currentAudioBlob = null;

function log(message) {
  const time = new Date().toLocaleTimeString();
  logsEl.textContent += `[${time}] ${message}\n`;
  logsEl.scrollTop = logsEl.scrollHeight;
}

async function tryBackendTranscription(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Backend transcription failed: ${response.status}`);
  }

  const data = await response.json();
  return data.transcript || "";
}

async function tryBackendFormatting(transcript) {
  const response = await fetch("/api/format", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Backend formatting failed: ${response.status}`);
  }

  const data = await response.json();
  return data.markdown || "";
}

function applySiteTransform(transform) {
  if (transform?.page?.title) {
    pageTitleEl.textContent = transform.page.title;
  }
  if (transform?.page?.subtitle) {
    pageSubtitleEl.textContent = transform.page.subtitle;
  }

  const theme = transform?.theme || {};
  for (const [key, value] of Object.entries(theme)) {
    document.documentElement.style.setProperty(key, value);
  }

  transformSectionsEl.innerHTML = "";
  const panels = Array.isArray(transform?.panels) ? transform.panels : [];
  for (const panel of panels) {
    const card = document.createElement("article");
    card.className = "transform-card";

    const heading = document.createElement("h3");
    heading.textContent = panel.heading || "Section";

    const body = document.createElement("p");
    body.textContent = panel.body || "";

    card.append(heading, body);
    transformSectionsEl.appendChild(card);
  }
}

async function tryBackendTransform(transcript) {
  const response = await fetch("/api/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Transform failed: ${response.status}`);
  }

  return payload;
}

startBtn.addEventListener("click", async () => {
  try {
    await recorder.start();
    statusEl.textContent = "Recording...";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    transcribeBtn.disabled = true;
    formatBtn.disabled = true;
    log("Recording started.");
  } catch (error) {
    log(`Start recording error: ${error.message}`);
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    currentAudioBlob = await recorder.stop();
    playback.src = URL.createObjectURL(currentAudioBlob);
    statusEl.textContent = "Recording complete.";
    startBtn.disabled = false;
    stopBtn.disabled = true;
    transcribeBtn.disabled = false;
    log("Recording stopped and audio blob is ready.");
  } catch (error) {
    log(`Stop recording error: ${error.message}`);
  }
});

transcribeBtn.addEventListener("click", async () => {
  try {
    if (!currentAudioBlob) {
      throw new Error("No audio recorded yet.");
    }

    transcribeBtn.disabled = true;
    log("Sending audio to backend /api/transcribe...");

    let transcript;
    try {
      transcript = await tryBackendTranscription(currentAudioBlob);
      log("Backend transcription completed.");
    } catch (backendError) {
      log(`Backend transcription unavailable: ${backendError.message}`);
      log("Falling back to client-side Whisper call...");
      transcript = await transcribeAudioWithWhisper(currentAudioBlob);
    }

    transcriptEl.value = transcript;
    formatBtn.disabled = !transcript.trim();
    transformBtn.disabled = !transcript.trim();
    log("Transcription completed.");
  } catch (error) {
    log(`Transcription error: ${error.message}`);
  } finally {
    transcribeBtn.disabled = false;
  }
});

formatBtn.addEventListener("click", async () => {
  try {
    const transcript = transcriptEl.value;
    if (!transcript.trim()) {
      throw new Error("Transcript is empty.");
    }

    formatBtn.disabled = true;
    log("Formatting transcript via backend /api/format...");

    let markdown;
    try {
      markdown = await tryBackendFormatting(transcript);
      log("Backend formatting completed.");
    } catch (backendError) {
      log(`Backend formatting unavailable: ${backendError.message}`);
      log(
        `Falling back to client-side formatter using ${
          USE_OLLAMA_FOR_BLOG ? "Ollama" : "OpenAI"
        }...`
      );
      markdown = await formatTranscriptToMarkdownBlog(transcript);
    }

    markdownEl.value = markdown;
    log("Markdown blog generation completed.");
  } catch (error) {
    log(`Markdown generation error: ${error.message}`);
  } finally {
    formatBtn.disabled = false;
  }
});

transformBtn.addEventListener("click", async () => {
  try {
    const transcript = transcriptEl.value.trim();
    if (!transcript) {
      throw new Error("Transcript is empty.");
    }

    transformBtn.disabled = true;
    transformStatusEl.textContent = "Transforming site...";
    log("Requesting backend site transform via /api/transform...");

    const result = await tryBackendTransform(transcript);
    applySiteTransform(result.transform);
    transformStatusEl.textContent = `Applied transform using ${result.provider}.`;
    log(`Site transform applied using ${result.provider}.`);
  } catch (error) {
    transformStatusEl.textContent = `Error: ${error.message}`;
    log(`Site transform error: ${error.message}`);
  } finally {
    transformBtn.disabled = false;
  }
});

workflowBtn.addEventListener("click", async () => {
  try {
    const prompt = promptInputEl.value.trim();
    const publishPath = publishPathEl.value.trim();
    const publish = Boolean(publishToggleEl.checked);

    if (!prompt) {
      throw new Error("Prompt is empty.");
    }

    if (publish && !publishPath) {
      throw new Error("Publish path is required when publish is enabled.");
    }

    workflowBtn.disabled = true;
    publishStatusEl.textContent = "Running workflow...";
    log("Running backend workflow via /api/workflow...");

    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        publish,
        publishPath,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Workflow failed: ${response.status}`);
    }

    markdownEl.value = payload.markdown || "";
    if (payload.published) {
      publishStatusEl.textContent = payload.htmlUrl
        ? `Published: ${payload.htmlUrl}`
        : "Published to GitHub.";
      log("Workflow completed and content was published.");
    } else {
      publishStatusEl.textContent = "Markdown generated (not published).";
      log("Workflow completed with markdown output only.");
    }
  } catch (error) {
    publishStatusEl.textContent = `Error: ${error.message}`;
    log(`Workflow error: ${error.message}`);
  } finally {
    workflowBtn.disabled = false;
  }
});
