# Serverless Voice-to-Blog POC (Client-Side Only)

This proof-of-concept records voice in the browser, transcribes it with Whisper, and formats it into a strict Markdown blog post using an LLM.

## Architecture

- `index.html`
  - UI shell and module bootstrap.
- `src/config.js`
  - Placeholder API key and model configuration.
- `src/audioRecorder.js`
  - MediaRecorder wrapper for browser audio capture.
- `src/transcriptionService.js`
  - Function to call Whisper transcription endpoint.
- `src/blogFormatterService.js`
  - Function to convert transcript into strict Markdown blog format.
- `src/app.js`
  - UI orchestration only, no API logic.

## Requirements

- Modern browser with `MediaRecorder` and `getUserMedia` support.
- HTTPS context or localhost for microphone permissions.

## Setup

1. Create a `.env` file in this folder.

2. Configure `.env` values:
  - `OPENAI_API_KEY` for backend transcription endpoint (`/api/transcribe`)
  - `OLLAMA_URL` and `OLLAMA_MODEL` for backend formatting/workflow
  - `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` for backend publishing endpoints

3. Install dependencies:

```bash
npm install
```

4. Start the backend server (also serves frontend):

```bash
npm run dev
```

Then open:

`http://127.0.0.1:3000`

## Google Login Required

This app now requires Google sign-in before users can access the UI and protected APIs.

Add these environment variables to `.env`:

- `SESSION_SECRET` (long random string)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL` (for local dev: `http://127.0.0.1:3000/auth/google/callback`)

Google Cloud Console setup:

1. Create OAuth 2.0 Client ID (Web application).
2. Add Authorized redirect URI matching `GOOGLE_CALLBACK_URL`.
3. Add Authorized JavaScript origins for your local host if needed.

Runtime behavior:

- Unauthenticated users are redirected to `/login`.
- API routes require auth except `GET /api/health` and `GET /api/auth/me`.
- Sign-in route: `/auth/google`
- Callback route: `/auth/google/callback`

Optional static-only mode (no backend APIs):

```bash
npm run serve
```

This serves at `http://127.0.0.1:4173` (or next available port).

## Flow

1. Click **Start Recording**.
2. Click **Stop Recording**.
3. Click **Transcribe Audio (Whisper)**.
4. Click **Generate Strict Markdown Blog**.

## Prompt Workflow From Frontend

The page now includes **Prompt Workflow via Backend**:

1. Enter a prompt in the prompt box.
2. Optional: check **Publish to GitHub** and provide a repo path like `posts/2026-03-13-note.md`.
3. Click **Run Prompt Workflow**.
4. The app calls `POST /api/workflow` and updates:
  - Markdown output box
  - publish status text with GitHub link when available

## Transcript-to-Site Transform

You can now transform the page directly from transcript text:

1. Record and transcribe audio.
2. Click **Transform Site From Transcript**.
3. The app calls `POST /api/transform`.
4. Returned JSON updates:
  - page title/subtitle
  - CSS theme variables
  - live transform section cards

## Backend API Endpoints

- `GET /api/health`
- `POST /api/transcribe` (multipart field: `audio`)
- `POST /api/format` (`{ transcript, systemPrompt? }`)
- `POST /api/publish` (`{ path, markdown, sha?, message? }`)
- `POST /api/workflow` (`{ prompt, publish, publishPath?, sha? }`)
- `POST /api/transform` (`{ transcript }`)

## Deploy on Vercel (Keep Transform Working)

This project includes serverless API route support via `api/transform.js` and `vercel.json`.

On Vercel, set these environment variables in Project Settings:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional, default `https://api.openai.com/v1`)
- `OPENAI_CHAT_MODEL` (optional, default `gpt-4o-mini`)
- `TRANSFORM_PROVIDER=openai` (recommended for Vercel)

Optional local fallback variables:

- `OLLAMA_URL`
- `OLLAMA_MODEL`

Note: Vercel cannot call your local Ollama instance. Use OpenAI in production by setting `TRANSFORM_PROVIDER=openai`.

## Important Security Note

This is intentionally **client-only** as requested. In real production systems, never expose provider API keys in browser code.

## Local Ollama Module

You can format posts with a local Ollama model using:

- `src/ollamaClient.js`

Main function:

- `generateBlogWithOllama({ transcript, systemPrompt, outputFormat })`

Details:

- Endpoint: `http://localhost:11434/api/generate`
- Model: `llama3.2:3b`
- `outputFormat` can be `markdown` or `json`
- Includes targeted error handling for:
  - Ollama not running
  - Local CORS/browser policy issues

## GitHub Pages Publisher (Voice-First)

You can publish Markdown output from local Ollama directly to GitHub Pages using:

- `src/githubPagesPublisher.js`

Main publishing function:

- `pushMarkdownToGitHubPages({ path, markdown, sha })`

Voice-to-publish helper:

- `voicePublishToGitHub({ transcript, systemPrompt, path, sha })`

This uses:

- `PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}`

Required placeholders to replace in `src/githubPagesPublisher.js`:

- `GITHUB_PAT`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`

Example usage:

```js
import { voicePublishToGitHub } from "./src/githubPagesPublisher.js";

const result = await voicePublishToGitHub({
  transcript: "Today I shipped a local AI publishing workflow.",
  systemPrompt: "Output only raw Markdown blog content.",
  path: "posts/2026-03-13-local-ai-workflow.md",
  sha: null,
});

console.log(result.publish.content.html_url);
```

This enables a no-IDE workflow after deployment: voice input -> Ollama markdown -> GitHub Pages update.

## Multimodal Feedback Tool (Gemini)

This project now includes an autonomous multimodal design QA loop under:

- `tools/multimodal-feedback/`

Capabilities:

- Captures full-page screenshots for local generated site and NJIT reference.
- Uses deterministic viewport presets:
  - Desktop `1440x900`
  - Tablet `1024x1366`
  - Mobile `390x844`
- Calls Gemini multimodal endpoint with paired images.
- Expects strict JSON with scores, critical issues, and suggested code changes.
- Applies safe token/replace patches to `styles.css` and `index.html`.
- Repeats until score target is met or max iterations is reached.
- Writes full report and artifacts to `feedback-artifacts/`.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Ensure a local `.env` file exists in this folder.

3. Set your Gemini API key in `.env`:

- `GEMINI_API_KEY`

### Run full autonomous loop

```bash
npm run feedback:run
```

Outputs:

- Screenshots by iteration and viewport in `feedback-artifacts/iter-XXX/`
- Iteration decisions in `feedback-artifacts/iteration-report.json`

