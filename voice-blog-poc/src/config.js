/**
 * Module: config
 * Purpose: Centralized client-side configuration for API access and model names.
 *
 * Security note:
 * This POC is intentionally client-only. Do not use this pattern in production,
 * because browser-delivered API keys can be extracted by users.
 */

export const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY_HERE";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const WHISPER_MODEL = "whisper-1";
export const BLOG_MODEL = "gpt-4.1-mini";

export const USE_OLLAMA_FOR_BLOG = false;
export const OLLAMA_URL = "http://localhost:11434/api/generate";
export const OLLAMA_MODEL = "llama3.2:3b";
