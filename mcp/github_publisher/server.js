import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const PUBLISH_FOLDER = process.env.GITHUB_PUBLISH_FOLDER || "posts";

function validateEnv() {
  const missing = [];
  if (!GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!GITHUB_OWNER) missing.push("GITHUB_OWNER");
  if (!GITHUB_REPO) missing.push("GITHUB_REPO");
  return missing;
}

function toBase64(input) {
  return Buffer.from(input, "utf8").toString("base64");
}

function sanitizeFileName(filename) {
  const clean = filename.replace(/^\/+/, "").trim();
  if (!clean) {
    throw new Error("filename cannot be empty");
  }
  if (clean.includes("..")) {
    throw new Error("filename must not contain path traversal segments");
  }
  return clean;
}

const server = new McpServer({
  name: "github_publisher",
  version: "0.1.0",
});

server.registerTool(
  "github_publisher",
  {
    title: "GitHub Publisher",
    description:
      "Publish or update a file in a GitHub repository folder using the REST Contents API PUT endpoint.",
    inputSchema: {
      filename: z
        .string()
        .describe("File name including extension, for example: my-post.md"),
      content: z
        .string()
        .describe("Raw UTF-8 file content. The tool base64-encodes it before API upload."),
      sha: z
        .string()
        .nullable()
        .describe("Current file blob SHA for updates. Use null for new files."),
    },
  },
  async ({ filename, content, sha }) => {
    const missing = validateEnv();
    if (missing.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: `Missing environment variables: ${missing.join(", ")}`,
          },
        ],
      };
    }

    try {
      const safeName = sanitizeFileName(filename);
      const path = `${PUBLISH_FOLDER}/${safeName}`;
      const encodedPath = path
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}`;

      const body = {
        message: `chore(content): publish ${path}`,
        content: toBase64(content),
        branch: GITHUB_BRANCH,
      };

      if (sha) {
        body.sha = sha;
      }

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `GitHub publish failed: ${response.status} ${errorText}`,
            },
          ],
          isError: true,
        };
      }

      const payload = await response.json();
      const result = {
        path: payload.content?.path,
        sha: payload.content?.sha,
        html_url: payload.content?.html_url,
        commit_url: payload.commit?.html_url,
        branch: GITHUB_BRANCH,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
