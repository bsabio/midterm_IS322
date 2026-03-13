import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
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
const USERS_FILE_PATH = path.resolve(process.cwd(), "users.local.json");
const COMMUNITY_POSTS_FILE_PATH = path.resolve(process.cwd(), "community-posts.json");
const scrypt = promisify(scryptCallback);

const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-session-secret-change-me";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL = 
  process.env.GOOGLE_CALLBACK_URL || `http://127.0.0.1:${DEFAULT_PORT}/auth/google/callback`;
const GOOGLE_AUTH_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

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
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

if (GOOGLE_AUTH_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const safeUser = {
          id: profile.id,
          displayName: profile.displayName,
          emails: profile.emails || [],
        };
        done(null, safeUser);
      }
    )
  );
}

function ensureAuthenticatedPage(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.redirect("/login");
}

function ensureAuthenticatedApi(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required. Sign in first." });
}

app.get("/login", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "login.html"));
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function readLocalUsers() {
  try {
    const raw = await readFile(USERS_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

async function writeLocalUsers(users) {
  const payload = JSON.stringify({ users }, null, 2);
  await writeFile(USERS_FILE_PATH, payload, "utf8");
}

async function readCommunityPosts() {
  try {
    const raw = await readFile(COMMUNITY_POSTS_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const posts = Array.isArray(parsed?.posts) ? parsed.posts : [];
    return posts
      .filter((post) => post && typeof post === "object")
      .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
  } catch {
    return [];
  }
}

async function writeCommunityPosts(posts) {
  const payload = JSON.stringify({ posts }, null, 2);
  await writeFile(COMMUNITY_POSTS_FILE_PATH, payload, "utf8");
}

function getAuthorFromRequest(req) {
  const user = req.user && typeof req.user === "object" ? req.user : {};
  const emailFromArray = Array.isArray(user.emails) ? user.emails[0]?.value : "";
  const email = String(user.email || emailFromArray || "").trim().toLowerCase();
  const displayName = String(user.displayName || email || "Unknown user").trim();
  return {
    id: String(user.id || "").trim() || null,
    displayName,
    email: email || null,
  };
}

function canUserDeletePost(req, post) {
  const actor = getAuthorFromRequest(req);
  const owner = post?.author && typeof post.author === "object" ? post.author : {};

  const actorId = String(actor.id || "").trim();
  const ownerId = String(owner.id || "").trim();
  if (actorId && ownerId && actorId === ownerId) {
    return true;
  }

  const actorEmail = String(actor.email || "").trim().toLowerCase();
  const ownerEmail = String(owner.email || "").trim().toLowerCase();
  if (actorEmail && ownerEmail && actorEmail === ownerEmail) {
    return true;
  }

  return false;
}

async function hashPassword(password, saltHex) {
  const derived = await scrypt(password, saltHex, 64);
  return Buffer.from(derived).toString("hex");
}

function toSessionUser(localUser) {
  return {
    id: localUser.id,
    displayName: localUser.displayName || localUser.email,
    email: localUser.email,
    emails: [{ value: localUser.email }],
    provider: "local",
  };
}

function clearAuthSession(req) {
  return new Promise((resolve) => {
    const finish = () => {
      if (req.session) {
        req.session.destroy(() => resolve());
      } else {
        resolve();
      }
    };

    if (req.isAuthenticated && req.isAuthenticated() && typeof req.logout === "function") {
      req.logout(() => finish());
      return;
    }

    finish();
  });
}

app.post("/auth/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const users = await readLocalUsers();
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password, salt);
    const newUser = {
      id: `local-${randomBytes(12).toString("hex")}`,
      email,
      displayName: email,
      passwordSalt: salt,
      passwordHash,
      createdAt: new Date().toISOString(),
      provider: "local",
    };

    users.push(newUser);
    await writeLocalUsers(users);

    const safeUser = toSessionUser(newUser);
    return req.login(safeUser, (loginError) => {
      if (loginError) {
        return res.status(500).json({ error: "Account created but login failed." });
      }
      return res.json({ ok: true, user: safeUser });
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Registration failed." });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const users = await readLocalUsers();
    const user = users.find((candidate) => normalizeEmail(candidate.email) === email);
    if (!user) {
      await clearAuthSession(req);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const hasValidSalt = /^[a-f0-9]{32}$/i.test(String(user.passwordSalt || ""));
    const hasValidHash = /^[a-f0-9]{128}$/i.test(String(user.passwordHash || ""));
    if (!hasValidSalt || !hasValidHash) {
      await clearAuthSession(req);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const expectedHash = Buffer.from(user.passwordHash || "", "hex");
    const actualHash = Buffer.from(await hashPassword(password, user.passwordSalt || ""), "hex");
    if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) {
      await clearAuthSession(req);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const safeUser = toSessionUser(user);
    return req.login(safeUser, (loginError) => {
      if (loginError) {
        return res.status(500).json({ error: "Login failed." });
      }
      return res.json({ ok: true, user: safeUser });
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Login failed." });
  }
});

app.get("/auth/google", (req, res, next) => {
  if (!GOOGLE_AUTH_ENABLED) {
    return res
      .status(500)
      .send("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!GOOGLE_AUTH_ENABLED) {
      return res
        .status(500)
        .send("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    }
    return passport.authenticate("google", { failureRedirect: "/login" })(req, res, next);
  },
  (_req, res) => {
    res.redirect("/");
  }
);

app.post("/auth/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, user: req.user || null });
});

app.get("/", ensureAuthenticatedPage, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "index.html"));
});

app.get("/repository", ensureAuthenticatedPage, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "repository.html"));
});

app.get("/community", ensureAuthenticatedPage, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "community.html"));
});

app.get("/styles.css", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "styles.css"));
});

app.use("/src", ensureAuthenticatedPage, express.static("src"));
app.use("/tools", ensureAuthenticatedPage, express.static("tools"));

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
  const hasExplicitLayoutSections = Array.isArray(transform?.layout?.sections);
  const layoutSections = hasExplicitLayoutSections ? transform.layout.sections : [];
  const sections =
    hasExplicitLayoutSections
      ? layoutSections
      : (Array.isArray(transform?.panels) ? transform.panels : []).map((panel) => ({
          type: "text",
          heading: panel?.heading,
          body: panel?.body,
        }));

  return sections
    .map((section) => {
      const type = String(section?.type || "text");

      if (type === "hero") {
        return [
          '<article class="transform-card layout-hero">',
          `  <h3>${escapeHtml(section?.heading || "Hero")}</h3>`,
          `  <p>${escapeHtml(section?.body || "")}</p>`,
          `  <span class="hero-cta">${escapeHtml(section?.cta || "Get Started")}</span>`,
          "</article>",
        ].join("\n");
      }

      if (type === "cards") {
        const items = Array.isArray(section?.items) ? section.items : [];
        const itemsHtml = items
          .map((item) => {
            const size = String(item?.size || "medium").trim().toLowerCase();
            const spanColumns = Math.max(1, Math.min(3, Number(item?.spanColumns || 1) || 1));
            const styleAttr = spanColumns > 1 ? ` style="grid-column: span ${spanColumns};"` : "";
            return [
              `<article class="card-item size-${escapeHtml(size)}"${styleAttr}>`,
              `  <h4>${escapeHtml(item?.title || "Item")}</h4>`,
              `  <p>${escapeHtml(item?.body || "")}</p>`,
              "</article>",
            ].join("\n");
          })
          .join("\n");

        return [
          '<article class="transform-card layout-cards">',
          `  <h3>${escapeHtml(section?.heading || "Highlights")}</h3>`,
          '  <div class="card-items">',
          itemsHtml,
          "  </div>",
          "</article>",
        ].join("\n");
      }

      if (type === "twoColumn") {
        return [
          '<article class="transform-card layout-two-column">',
          '  <section class="col">',
          `    <h3>${escapeHtml(section?.left?.heading || "Left")}</h3>`,
          `    <p>${escapeHtml(section?.left?.body || "")}</p>`,
          "  </section>",
          '  <section class="col">',
          `    <h3>${escapeHtml(section?.right?.heading || "Right")}</h3>`,
          `    <p>${escapeHtml(section?.right?.body || "")}</p>`,
          "  </section>",
          "</article>",
        ].join("\n");
      }

      if (type === "quote") {
        return [
          '<article class="transform-card layout-quote">',
          `  <p>${escapeHtml(section?.body || "")}</p>`,
          `  <h3>${escapeHtml(section?.heading || "Quote")}</h3>`,
          "</article>",
        ].join("\n");
      }

      return [
        '<article class="transform-card layout-text">',
        `  <h3>${escapeHtml(section?.heading || "Section")}</h3>`,
        `  <p>${escapeHtml(section?.body || "")}</p>`,
        "</article>",
      ].join("\n");
    })
    .join("\n");
}

function applyTransformToIndexHtml(indexHtml, transform) {
  const title = escapeHtml(transform?.page?.title || "Voice-to-Blog POC");
  const subtitle = escapeHtml(transform?.page?.subtitle || "Transcript converted into live page content.");
  const cardsHtml = buildTransformCardsHtml(transform);
  const layoutMode = escapeHtml(transform?.layout?.mode || "stack");
  const shouldUpdateTitle = Boolean(transform?.behavior?.updateTitle);

  let updated = indexHtml;
  updated = updated.replace(
    /<section id="siteCanvas" class="site-canvas[^"]*">/,
    `<section id="siteCanvas" class="site-canvas layout-mode-${layoutMode}">`
  );
  if (shouldUpdateTitle) {
    updated = updated.replace(
      /<h1 id="pageTitle">[\s\S]*?<\/h1>/,
      `<h1 id="pageTitle">${title}</h1>`
    );
  }
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

app.use("/api", (req, res, next) => {
  if (req.path === "/health") {
    return next();
  }
  if (req.path === "/auth/me") {
    return next();
  }
  return ensureAuthenticatedApi(req, res, next);
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

app.get("/api/community/posts", async (_req, res) => {
  try {
    const posts = await readCommunityPosts();
    return res.json({ posts });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not load community posts." });
  }
});

app.post("/api/community/posts", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();

    if (!title || !content) {
      return res.status(400).json({ error: "title and content are required" });
    }

    const posts = await readCommunityPosts();
    const post = {
      id: `post-${randomBytes(10).toString("hex")}`,
      title: title.slice(0, 120),
      content: content.slice(0, 4000),
      author: getAuthorFromRequest(req),
      createdAt: new Date().toISOString(),
    };

    const nextPosts = [post, ...posts].slice(0, 200);
    await writeCommunityPosts(nextPosts);

    return res.status(201).json({ ok: true, post });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not create community post." });
  }
});

app.delete("/api/community/posts/:postId", async (req, res) => {
  try {
    const postId = String(req.params?.postId || "").trim();
    if (!postId) {
      return res.status(400).json({ error: "postId is required" });
    }

    const posts = await readCommunityPosts();
    const index = posts.findIndex((post) => String(post?.id || "") === postId);
    if (index < 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const targetPost = posts[index];
    if (!canUserDeletePost(req, targetPost)) {
      return res.status(403).json({ error: "Only the original author can delete this post." });
    }

    posts.splice(index, 1);
    await writeCommunityPosts(posts);
    return res.json({ ok: true, deletedPostId: postId });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not delete community post." });
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
