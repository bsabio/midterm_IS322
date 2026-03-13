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
const persistBtn = document.getElementById("persistBtn");
const formatBtn = document.getElementById("formatBtn");
const playback = document.getElementById("playback");
const transcriptEl = document.getElementById("transcript");
const markdownEl = document.getElementById("markdownBlog");
const communityPostStatusEl = document.getElementById("communityPostStatus");
const logsEl = document.getElementById("logs");
const statusEl = document.getElementById("recordingStatus");
const pageRootEl = document.getElementById("pageRoot");
const siteCanvasEl = document.getElementById("siteCanvas");
const pageTitleEl = document.getElementById("pageTitle");
const pageSubtitleEl = document.getElementById("pageSubtitle");
const transformStatusEl = document.getElementById("transformStatus");
const transformSectionsEl = document.getElementById("transformSections");
const promptInputEl = document.getElementById("promptInput");
const publishPathEl = document.getElementById("publishPath");
const publishToggleEl = document.getElementById("publishToggle");
const workflowBtn = document.getElementById("workflowBtn");
const publishStatusEl = document.getElementById("publishStatus");
const authBadgeEl = document.getElementById("authBadge");
const authMenuToggleEl = document.getElementById("authMenuToggle");
const authMenuEl = document.getElementById("authMenu");
const switchUserBtnEl = document.getElementById("switchUserBtn");
const signOutBtnEl = document.getElementById("signOutBtn");
const TRANSFORM_STORAGE_KEY = "voiceBlog.siteTransform.v3";
const BLOCKED_BOX_TITLES = new Set(["key takeaways", "discussion points", "final thoughts"]);
const SLOT_IDS = {
  canvas: "siteCanvas",
  capture: "capturePanel",
  transcript: "transcriptPanel",
  markdown: "markdownPanel",
  workflow: "workflowPanel",
  logs: "logsPanel",
};
const DEFAULT_SLOT_ORDER = Object.keys(SLOT_IDS);

const recorder = new AudioRecorder();
let currentAudioBlob = null;
let latestTransform = null;

function isBlockedBoxTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? BLOCKED_BOX_TITLES.has(normalized) : false;
}

function closeAuthMenu() {
  if (!authMenuEl || !authMenuToggleEl) {
    return;
  }
  authMenuEl.hidden = true;
  authMenuToggleEl.setAttribute("aria-expanded", "false");
}

function openAuthMenu() {
  if (!authMenuEl || !authMenuToggleEl) {
    return;
  }
  authMenuEl.hidden = false;
  authMenuToggleEl.setAttribute("aria-expanded", "true");
}

function setupAuthMenuBehavior() {
  if (!authMenuToggleEl || !authMenuEl || !signOutBtnEl || !switchUserBtnEl) {
    return;
  }

  authMenuToggleEl.addEventListener("click", () => {
    if (authMenuEl.hidden) {
      openAuthMenu();
      return;
    }
    closeAuthMenu();
  });

  switchUserBtnEl.addEventListener("click", async () => {
    switchUserBtnEl.disabled = true;
    signOutBtnEl.disabled = true;
    try {
      await fetch("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login?switch=1";
    }
  });

  signOutBtnEl.addEventListener("click", async () => {
    switchUserBtnEl.disabled = true;
    signOutBtnEl.disabled = true;
    try {
      await fetch("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  });

  document.addEventListener("click", (event) => {
    if (!authBadgeEl || authMenuEl.hidden) {
      return;
    }
    if (authBadgeEl.contains(event.target)) {
      return;
    }
    closeAuthMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAuthMenu();
    }
  });
}

async function loadAuthenticatedUser() {
  if (!authBadgeEl || !authMenuToggleEl) {
    return;
  }

  try {
    const response = await fetch("/api/auth/me", { method: "GET" });
    if (!response.ok) {
      authMenuToggleEl.textContent = "Signed in";
      return;
    }

    const payload = await response.json().catch(() => ({}));
    const user = payload?.user || {};
    const email = Array.isArray(user.emails) ? user.emails[0]?.value : "";
    const name = user.displayName || email || "Unknown user";
    authMenuToggleEl.textContent = email ? `Signed in as ${name} (${email})` : `Signed in as ${name}`;
  } catch {
    authMenuToggleEl.textContent = "Signed in";
  }
}

function log(message) {
  if (!logsEl) {
    return;
  }
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

function extractCommunityTitleFromMarkdown(markdown) {
  const text = String(markdown || "");
  const headingMatch = text.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1]) {
    return headingMatch[1].trim().slice(0, 120);
  }
  return "Community Blog Update";
}

async function publishMarkdownToCommunity(markdown) {
  const content = String(markdown || "").trim();
  if (!content) {
    return;
  }

  const response = await fetch("/api/community/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: extractCommunityTitleFromMarkdown(content),
      content,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Community publish failed: ${response.status}`);
  }
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

  applyGlobalComposition(transform?.composition || {});

  const layout = transform?.layout || {};
  const layoutMode = String(layout.mode || "stack").trim() || "stack";
  if (siteCanvasEl) {
    siteCanvasEl.className = `site-canvas layout-mode-${layoutMode}`;
  }

  transformSectionsEl.innerHTML = "";
  const hasExplicitLayoutSections = Array.isArray(layout.sections);
  const layoutSections = hasExplicitLayoutSections ? layout.sections : [];
  const sections =
    hasExplicitLayoutSections
      ? layoutSections
      : (Array.isArray(transform?.panels) ? transform.panels : []).map((panel) => ({
          type: "text",
          heading: panel.heading,
          body: panel.body,
        }));

  const filteredSections = sections.filter((section) => !isBlockedBoxTitle(section?.heading));

  for (const section of filteredSections) {
    const element = renderLayoutSection(section);
    if (element) {
      transformSectionsEl.appendChild(element);
    }
  }

  latestTransform = transform;
  if (persistBtn) {
    persistBtn.disabled = false;
  }
}

function applyGlobalComposition(composition) {
  if (!pageRootEl) {
    return;
  }

  const requestedOrder = Array.isArray(composition?.order)
    ? composition.order.map((slot) => String(slot).trim().toLowerCase()).filter(Boolean)
    : [];
  const visibleSlots = new Set(
    Array.isArray(composition?.visible)
      ? composition.visible.map((slot) => String(slot).trim().toLowerCase())
      : DEFAULT_SLOT_ORDER
  );

  for (const [slot, elementId] of Object.entries(SLOT_IDS)) {
    const element = document.getElementById(elementId);
    if (!element) {
      continue;
    }
    element.style.display = visibleSlots.has(slot) ? "" : "none";
  }

  const finalOrder = [];
  for (const slot of requestedOrder) {
    if (SLOT_IDS[slot] && !finalOrder.includes(slot)) {
      finalOrder.push(slot);
    }
  }
  for (const slot of DEFAULT_SLOT_ORDER) {
    if (!finalOrder.includes(slot)) {
      finalOrder.push(slot);
    }
  }

  for (const slot of finalOrder) {
    const element = document.getElementById(SLOT_IDS[slot]);
    if (element) {
      pageRootEl.appendChild(element);
    }
  }
}

function renderLayoutSection(section) {
  const type = String(section?.type || "text").trim();

  if (type === "hero") {
    const hero = document.createElement("article");
    hero.className = "transform-card layout-hero";

    const heading = document.createElement("h3");
    heading.textContent = section.heading || "Hero";

    const body = document.createElement("p");
    body.textContent = section.body || "";

    const ctaText = section.cta || "Get Started";
    const ctaTarget = String(section?.ctaUrl || section?.ctaHref || "").trim();
    const shouldLinkToRepository = /^(read|learn)\s*more$/i.test(ctaText);
    const ctaHref = ctaTarget || (shouldLinkToRepository ? "/repository" : "");

    const cta = document.createElement(ctaHref ? "a" : "span");
    cta.className = "hero-cta";
    cta.textContent = ctaText;
    if (ctaHref) {
      cta.setAttribute("href", ctaHref);
    }

    hero.append(heading, body, cta);
    return hero;
  }

  if (type === "cards") {
    const cards = document.createElement("article");
    cards.className = "transform-card layout-cards";

    const heading = document.createElement("h3");
    heading.textContent = section.heading || "Highlights";
    cards.appendChild(heading);

    const list = document.createElement("div");
    list.className = "card-items";
    const items = Array.isArray(section.items) ? section.items : [];
    const filteredItems = items.filter((item) => !isBlockedBoxTitle(item?.title));
    for (const item of filteredItems) {
      const itemEl = document.createElement("article");
      const size = String(item?.size || "medium").trim().toLowerCase();
      const spanColumns = Math.max(1, Math.min(3, Number(item?.spanColumns || 1) || 1));
      itemEl.className = `card-item size-${size}`;
      itemEl.style.gridColumn = spanColumns > 1 ? `span ${spanColumns}` : "";

      const itemTitle = document.createElement("h4");
      itemTitle.textContent = item?.title || "Item";

      const itemBody = document.createElement("p");
      itemBody.textContent = item?.body || "";

      itemEl.append(itemTitle, itemBody);
      list.appendChild(itemEl);
    }

    cards.appendChild(list);
    return cards;
  }

  if (type === "twoColumn") {
    const wrapper = document.createElement("article");
    wrapper.className = "transform-card layout-two-column";

    const left = document.createElement("section");
    left.className = "col";
    const leftHeading = document.createElement("h3");
    leftHeading.textContent = section?.left?.heading || "Left";
    const leftBody = document.createElement("p");
    leftBody.textContent = section?.left?.body || "";
    left.append(leftHeading, leftBody);

    const right = document.createElement("section");
    right.className = "col";
    const rightHeading = document.createElement("h3");
    rightHeading.textContent = section?.right?.heading || "Right";
    const rightBody = document.createElement("p");
    rightBody.textContent = section?.right?.body || "";
    right.append(rightHeading, rightBody);

    wrapper.append(left, right);
    return wrapper;
  }

  if (type === "quote") {
    const quote = document.createElement("article");
    quote.className = "transform-card layout-quote";

    const body = document.createElement("p");
    body.textContent = section.body || "";

    const attribution = document.createElement("h3");
    attribution.textContent = section.heading || "Quote";

    quote.append(body, attribution);
    return quote;
  }

  const text = document.createElement("article");
  text.className = "transform-card layout-text";

  const heading = document.createElement("h3");
  heading.textContent = section?.heading || "Section";

  const body = document.createElement("p");
  body.textContent = section?.body || "";

  text.append(heading, body);
  return text;
}

function persistTransform(transform) {
  try {
    localStorage.setItem(TRANSFORM_STORAGE_KEY, JSON.stringify(transform));
  } catch {
    log("Could not save transform to local storage.");
  }
}

function restoreTransformFromStorage() {
  try {
    const raw = localStorage.getItem(TRANSFORM_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const savedTransform = JSON.parse(raw);
    applySiteTransform(savedTransform);
    transformStatusEl.textContent = "Restored saved transform from this browser.";
    log("Restored saved site transform from local storage.");
  } catch {
    transformStatusEl.textContent = "Could not restore saved transform.";
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

async function persistTransformToSource(transform) {
  const response = await fetch("/api/transform/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transform }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Persist failed: ${response.status}`);
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
    if (!currentAudioBlob.size) {
      throw new Error("Recorded audio is empty. Check microphone permissions and input device.");
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
    if (communityPostStatusEl) {
      communityPostStatusEl.textContent = "";
    }
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
    try {
      if (communityPostStatusEl) {
        communityPostStatusEl.textContent = "Posting to Community Blog...";
      }
      await publishMarkdownToCommunity(markdown);
      if (communityPostStatusEl) {
        communityPostStatusEl.textContent = "Posted to Community Blog successfully.";
      }
      log("Published markdown to Community Posts.");
    } catch (communityError) {
      if (communityPostStatusEl) {
        communityPostStatusEl.textContent = `Community Blog post failed: ${communityError.message}`;
      }
      log(`Community publish skipped: ${communityError.message}`);
    }
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
    persistTransform(result.transform);
    transformStatusEl.textContent = `Applied transform using ${result.provider}.`;
    log(`Site transform applied using ${result.provider}.`);
  } catch (error) {
    transformStatusEl.textContent = `Error: ${error.message}`;
    log(`Site transform error: ${error.message}`);
  } finally {
    transformBtn.disabled = false;
  }
});

if (persistBtn) {
  persistBtn.addEventListener("click", async () => {
    try {
      if (!latestTransform) {
        throw new Error("No transform available yet. Run transform first.");
      }

      persistBtn.disabled = true;
      transformStatusEl.textContent = "Persisting transform to source files...";
      log("Persisting current transform into source files...");

      const payload = await persistTransformToSource(latestTransform);
      transformStatusEl.textContent = payload.message || "Transform persisted to source files.";
      log(payload.message || "Transform persisted to source files.");
    } catch (error) {
      transformStatusEl.textContent = `Error: ${error.message}`;
      log(`Persist error: ${error.message}`);
    } finally {
      persistBtn.disabled = false;
    }
  });
}

if (workflowBtn && promptInputEl && publishPathEl && publishToggleEl && publishStatusEl) {
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
}

restoreTransformFromStorage();
setupAuthMenuBehavior();
loadAuthenticatedUser();
