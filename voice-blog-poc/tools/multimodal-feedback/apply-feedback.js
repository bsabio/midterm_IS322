import { readFile, writeFile } from "node:fs/promises";

const SUPPORTED_FILES = new Set(["styles.css", "index.html"]);

function normalizeTarget(file) {
  return file.replace(/^\.\//, "").trim();
}

function applyTokenPatch(cssText, tokenName, tokenValue) {
  const pattern = new RegExp(`(--${tokenName}\\s*:\\s*)([^;]+)(;)`, "i");
  if (!pattern.test(cssText)) {
    return cssText;
  }
  return cssText.replace(pattern, `$1${tokenValue}$3`);
}

function parsePatchInstruction(exactChange) {
  const tokenMatch = exactChange.match(/set\s+token\s+([a-zA-Z0-9_-]+)\s*=\s*([^\n]+)/i);
  if (tokenMatch) {
    return {
      type: "token",
      token: tokenMatch[1].trim(),
      value: tokenMatch[2].trim(),
    };
  }

  const replaceMatch = exactChange.match(/replace\s+"([\s\S]*?)"\s+with\s+"([\s\S]*?)"/i);
  if (replaceMatch) {
    return {
      type: "replace",
      from: replaceMatch[1],
      to: replaceMatch[2],
    };
  }

  return null;
}

export async function applyFeedbackSuggestions({ projectRoot, suggestions }) {
  const touched = new Set();
  let appliedCount = 0;

  for (const suggestion of suggestions || []) {
    const target = normalizeTarget(String(suggestion.file || ""));
    if (!SUPPORTED_FILES.has(target)) {
      continue;
    }

    const patch = parsePatchInstruction(String(suggestion.exact_change || ""));
    if (!patch) {
      continue;
    }

    const fullPath = `${projectRoot}/${target}`;
    const current = await readFile(fullPath, "utf8");
    let updated = current;

    if (patch.type === "token" && target === "styles.css") {
      updated = applyTokenPatch(current, patch.token, patch.value);
    }

    if (patch.type === "replace") {
      updated = updated.replace(patch.from, patch.to);
    }

    if (updated !== current) {
      await writeFile(fullPath, updated, "utf8");
      touched.add(target);
      appliedCount += 1;
    }
  }

  return {
    appliedCount,
    touchedFiles: [...touched],
  };
}
