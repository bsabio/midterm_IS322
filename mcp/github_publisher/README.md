# github_publisher MCP Tool

`github_publisher` is an MCP server tool that writes files directly to GitHub via the REST Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`), without using a local git client.

## Tool Contract

Tool name: `github_publisher`

Input parameters:
- `filename` (string): target file name, for example `my-post.md`
- `content` (string): raw file content
- `sha` (string | null): existing file SHA for updates; use `null` to create

The tool writes to:
- `${GITHUB_PUBLISH_FOLDER}/${filename}`

Example:

```json
{
  "filename": "my-post.md",
  "content": "# My Post\n\nHello from voice.",
  "sha": null
}
```

## Environment Variables

Create a `.env` file in this folder and set:
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `GITHUB_PUBLISH_FOLDER`

Token scope requirements:
- Fine-grained PAT with `Contents: Read and write` for the target repo.

## Run

```bash
cd mcp/github_publisher
npm install
npm start
```

## Voice-First Publishing Flow

1. Voice agent generates Markdown content.
2. Agent calls `github_publisher` with `filename`, `content`, and `sha`.
3. File is committed directly to your repo under `/posts`.
4. GitHub Action in `.github/workflows/deploy.yml` triggers rebuild when new `.md` files are added.
