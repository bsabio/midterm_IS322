/**
 * Module: transcriptionService
 * Purpose: Send audio to OpenAI Whisper API and return plain transcript text.
 */

import { OPENAI_API_KEY, OPENAI_BASE_URL, WHISPER_MODEL } from "./config.js";

/**
 * Sends an audio blob to Whisper and returns transcript text.
 * @param {Blob} audioBlob - Recorded audio from MediaRecorder.
 * @returns {Promise<string>} Transcript text.
 */
export async function transcribeAudioWithWhisper(audioBlob) {
  if (!audioBlob) {
    throw new Error("No audio blob provided.");
  }

  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes("YOUR_OPENAI_API_KEY")) {
    throw new Error("Set OPENAI_API_KEY in src/config.js before calling Whisper.");
  }

  const formData = new FormData();
  formData.append("model", WHISPER_MODEL);
  formData.append("file", audioBlob, "recording.webm");

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper transcription failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.text || "";
}
