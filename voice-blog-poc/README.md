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
