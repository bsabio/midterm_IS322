import { chromium } from "playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 1366 },
  { name: "mobile", width: 390, height: 844 },
];

export async function captureScreenshots({ iterationDir, targetUrl, referenceUrl }) {
  const browser = await chromium.launch({ headless: true });
  const output = [];

  try {
    for (const viewport of VIEWPORTS) {
      const vpDir = path.join(iterationDir, viewport.name);
      await mkdir(vpDir, { recursive: true });

      const targetPath = path.join(vpDir, "generated.png");
      const refPath = path.join(vpDir, "reference.png");

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });

      const targetPage = await context.newPage();
      await targetPage.goto(targetUrl, { waitUntil: "networkidle", timeout: 90000 });
      await targetPage.screenshot({ path: targetPath, fullPage: true });

      const refPage = await context.newPage();
      await refPage.goto(referenceUrl, { waitUntil: "networkidle", timeout: 90000 });
      await refPage.screenshot({ path: refPath, fullPage: true });

      await context.close();

      output.push({
        viewport: viewport.name,
        generatedPath: targetPath,
        referencePath: refPath,
      });
    }

    return output;
  } finally {
    await browser.close();
  }
}
