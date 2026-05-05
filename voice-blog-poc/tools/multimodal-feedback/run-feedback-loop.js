import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { captureScreenshots, VIEWPORTS } from "./screenshot.js";
import { compareWithGemini } from "./gemini-compare.js";
import { applyFeedbackSuggestions } from "./apply-feedback.js";

const PROJECT_ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(PROJECT_ROOT, "feedback-artifacts");
const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS || 8);
const SATISFACTION_SCORE = Number(process.env.SATISFACTION_SCORE || 95);
const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:4173";
const REFERENCE_URL = process.env.REFERENCE_URL || "https://www.njit.edu";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

if (!GEMINI_API_KEY) {
  process.stderr.write("Missing GEMINI_API_KEY in environment.\n");
  process.exit(1);
}

function startStaticServer() {
  const child = spawn(process.execPath, ["tools/multimodal-feedback/static-server.js"], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timed out waiting for static server startup."));
      }
    }, 8000);

    child.stdout.on("data", (buf) => {
      const line = buf.toString("utf8");
      if (!settled && line.includes("Static server running")) {
        settled = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });

    child.stderr.on("data", (buf) => {
      process.stderr.write(buf.toString("utf8"));
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Static server exited early with code ${code}`));
      }
    });
  });
}

function aggregateScores(viewportAnalyses) {
  const overall = viewportAnalyses.reduce((sum, item) => sum + Number(item.score_overall || 0), 0);
  return Math.round(overall / Math.max(viewportAnalyses.length, 1));
}

function flattenSuggestions(viewportAnalyses) {
  const all = [];
  for (const analysis of viewportAnalyses) {
    const suggestions = Array.isArray(analysis.suggested_code_changes)
      ? analysis.suggested_code_changes
      : [];
    for (const suggestion of suggestions) {
      all.push(suggestion);
    }
  }
  return all;
}

function hasCriticalIssues(viewportAnalyses) {
  return viewportAnalyses.some((analysis) => (analysis.critical_issues || []).length > 0);
}

async function run() {
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const staticServer = await startStaticServer();

  const report = {
    config: {
      target_url: TARGET_URL,
      reference_url: REFERENCE_URL,
      max_iterations: MAX_ITERATIONS,
      satisfaction_score: SATISFACTION_SCORE,
      model: GEMINI_MODEL,
      viewports: VIEWPORTS,
    },
    iterations: [],
    final: null,
  };

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
      const iterId = String(iteration).padStart(3, "0");
      const iterationDir = path.join(ARTIFACT_ROOT, `iter-${iterId}`);

      const captures = await captureScreenshots({
        iterationDir,
        targetUrl: TARGET_URL,
        referenceUrl: REFERENCE_URL,
      });

      const analyses = [];
      for (const capture of captures) {
        const analysis = await compareWithGemini({
          model: GEMINI_MODEL,
          apiKey: GEMINI_API_KEY,
          viewportName: capture.viewport,
          generatedPath: capture.generatedPath,
          referencePath: capture.referencePath,
        });
        analyses.push({ viewport: capture.viewport, ...analysis });
      }

      const score = aggregateScores(analyses);
      const critical = hasCriticalIssues(analyses);
      const suggestions = flattenSuggestions(analyses);
      const patchResult = await applyFeedbackSuggestions({
        projectRoot: PROJECT_ROOT,
        suggestions,
      });

      report.iterations.push({
        iteration,
        score_overall: score,
        critical_issues_remaining: critical,
        analyses,
        applied_changes_count: patchResult.appliedCount,
        changed_files: patchResult.touchedFiles,
        rationale:
          patchResult.appliedCount > 0
            ? "Applied safe token/replace patches from Gemini suggestions."
            : "No safe direct patch could be applied from current suggestions.",
      });

      const metGoal = score >= SATISFACTION_SCORE && !critical;
      if (metGoal) {
        report.final = {
          status: "satisfied",
          best_iteration: iteration,
          best_score: score,
          residual_gaps: [],
        };
        break;
      }

      if (iteration === MAX_ITERATIONS) {
        const last = report.iterations[report.iterations.length - 1];
        const allCritical = last.analyses.flatMap((a) => a.critical_issues || []);
        report.final = {
          status: "max-iterations-reached",
          best_iteration: last.iteration,
          best_score: last.score_overall,
          residual_gaps: allCritical,
          prioritized_next_10_changes: [
            "Increase heading scale contrast by 10-20%.",
            "Tighten grid alignment and equalize horizontal gutters.",
            "Strengthen glass card border highlights with subtle white alpha.",
            "Raise backdrop blur on key panels by 2-4px while preserving readability.",
            "Reduce body text line length in desktop hero/content containers.",
            "Normalize spacing scale to consistent 8px or 10px increments.",
            "Increase primary CTA prominence via contrast and shadow depth.",
            "Balance Bauhaus accent shapes for asymmetry without clutter.",
            "Improve section rhythm with clearer vertical cadence.",
            "Increase text/background contrast for accessibility on translucent layers.",
          ],
        };
      }
    }
  } finally {
    staticServer.kill("SIGTERM");
  }

  const outPath = path.join(ARTIFACT_ROOT, "iteration-report.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`Feedback loop completed. Report: ${outPath}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
