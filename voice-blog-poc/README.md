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

1. Open `src/config.js` and set:
   - `OPENAI_API_KEY`
2. Serve the folder from a static web server.

Example with Python:

```bash
cd voice-blog-poc
python3 -m http.server 8080
```

Then open:

`http://localhost:8080`

## Flow

1. Click **Start Recording**.
2. Click **Stop Recording**.
3. Click **Transcribe Audio (Whisper)**.
4. Click **Generate Strict Markdown Blog**.

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

2. Create local environment file:

```bash
cp .env.example .env
```

3. Set your Gemini API key in `.env`:

- `GEMINI_API_KEY`

### Run full autonomous loop

```bash
npm run feedback:run
```

Outputs:

- Screenshots by iteration and viewport in `feedback-artifacts/iter-XXX/`
- Iteration decisions in `feedback-artifacts/iteration-report.json`

