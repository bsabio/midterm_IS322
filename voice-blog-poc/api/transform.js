import { generateSiteTransformFromTranscript } from "../lib/transformEngine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const transcript = String(body.transcript || body.prompt || "").trim();
    const result = await generateSiteTransformFromTranscript(transcript);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Transform failed." });
  }
}
