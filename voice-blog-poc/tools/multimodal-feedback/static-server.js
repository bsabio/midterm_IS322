import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sanitize(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(clean).replace(/^\.+/, "");
  return normalized === "/" ? "/index.html" : normalized;
}

const server = http.createServer(async (req, res) => {
  try {
    const relPath = sanitize(req.url || "/");
    const fullPath = path.join(ROOT, relPath);

    if (!fullPath.startsWith(ROOT) || !existsSync(fullPath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const body = await readFile(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`Static server running at http://127.0.0.1:${PORT}\n`);
});
