/**
 * Module: app
 * Purpose: UI orchestration only. Delegates recording/transcription/formatting to service modules.
 */

import { AudioRecorder } from "./audioRecorder.js";
import { transcribeAudioWithWhisper } from "./transcriptionService.js";
import { formatTranscriptToMarkdownBlog } from "./blogFormatterService.js";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const transcribeBtn = document.getElementById("transcribeBtn");
const formatBtn = document.getElementById("formatBtn");
const playback = document.getElementById("playback");
const transcriptEl = document.getElementById("transcript");
const markdownEl = document.getElementById("markdownBlog");
const logsEl = document.getElementById("logs");
const statusEl = document.getElementById("recordingStatus");

const recorder = new AudioRecorder();
let currentAudioBlob = null;

function log(message) {
  const time = new Date().toLocaleTimeString();
  logsEl.textContent += `[${time}] ${message}\n`;
  logsEl.scrollTop = logsEl.scrollHeight;
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
    log("Sending audio to Whisper for transcription...");

    const transcript = await transcribeAudioWithWhisper(currentAudioBlob);
    transcriptEl.value = transcript;
    formatBtn.disabled = !transcript.trim();
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
    formatBtn.disabled = true;
    log("Formatting transcript into strict Markdown blog...");

    const markdown = await formatTranscriptToMarkdownBlog(transcript);
    markdownEl.value = markdown;
    log("Markdown blog generation completed.");
  } catch (error) {
    log(`Markdown generation error: ${error.message}`);
  } finally {
    formatBtn.disabled = false;
  }
});
