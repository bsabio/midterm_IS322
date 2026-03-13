/**
 * Module: audioRecorder
 * Purpose: Encapsulate MediaRecorder API usage for microphone capture.
 */

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
    this.mimeType = "";
  }

  /**
   * Starts microphone capture using MediaRecorder.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRecording) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access is unavailable in this browser or context.");
    }

    const preferredMimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    const supportedMimeType = preferredMimeTypes.find(
      (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)
    );

    const recorderOptions = supportedMimeType ? { mimeType: supportedMimeType } : undefined;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        throw new Error("Microphone permission is blocked. Please allow mic access and try again.");
      }
      throw error;
    }

    this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
    this.mimeType = this.mediaRecorder.mimeType || supportedMimeType || "audio/webm";
    this.chunks = [];

    this.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    this.mediaRecorder.start(250);
    this.isRecording = true;
  }

  /**
   * Stops recording and returns an audio Blob.
   * @returns {Promise<Blob>}
   */
  async stop() {
    if (!this.mediaRecorder || !this.isRecording) {
      throw new Error("Recorder is not active.");
    }

    const recorder = this.mediaRecorder;

    const blob = await new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          resolve(new Blob(this.chunks, { type: this.mimeType || "audio/webm" }));
        },
        { once: true }
      );
      recorder.requestData();
      recorder.stop();
    });

    this.stream.getTracks().forEach((track) => track.stop());
    this.isRecording = false;
    this.mediaRecorder = null;
    this.stream = null;

    return blob;
  }
}
