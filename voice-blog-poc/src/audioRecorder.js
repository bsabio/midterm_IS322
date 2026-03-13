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
  }

  /**
   * Starts microphone capture using MediaRecorder.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRecording) return;

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.chunks = [];

    this.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    this.mediaRecorder.start();
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
          resolve(new Blob(this.chunks, { type: "audio/webm" }));
        },
        { once: true }
      );
      recorder.stop();
    });

    this.stream.getTracks().forEach((track) => track.stop());
    this.isRecording = false;
    this.mediaRecorder = null;
    this.stream = null;

    return blob;
  }
}
