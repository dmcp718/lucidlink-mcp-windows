# Blueprints

Reusable project templates that MCP tools stamp out into customer directories.

A **blueprint** is a tool that, when called, writes a small Node project to disk,
runs `npm install`, starts the server in the background, and returns a URL the
customer can open. The customer never touches a shell.

## Current blueprints

| Module | Tool | Server | What it produces |
|---|---|---|---|
| `filespace-search-ui.ts` | `create_search_ui` | `lucidlink-filespace` | Full-text search UI bound to fs-index-server |
| `connect-ui.ts` | `create_connect_ui` | `lucidlink-api` (Connect tools) | S3 import wizard for LucidLink Connect |
| `audit-dashboard.ts` + `audit-dashboard-assets/` | `create_audit_dashboard` | `lucidlink-audit-trail` | Filterable React dashboard for OpenSearch audit data |

## The convention

A blueprint module exports a `generate*(opts)` function that returns:

```ts
interface GeneratedProject {
  files: Record<string, string>;   // relative path → file contents
  instructions: string;            // human-readable next steps
}
```

The MCP tool that calls it does the I/O dance:

1. Resolve `output_dir` (expand `~`, default to a sensible path under `~/Desktop/`).
2. For each `[relPath, content]` in `project.files`, `mkdir -p` the parent and write the file.
3. `execSync("npm install --production", { cwd: dir, stdio: "pipe", timeout: 60000 })`.
4. `spawn("node", ["server.js"], { cwd: dir, detached: true, stdio: "ignore" })`, then `unref()`.
5. Wait ~1.5s, then return a message containing the URL and `kill <pid>` instruction.

## Two flavours of template content

**Inline-as-strings** — for simple projects where the entire output is generated
in TypeScript (`filespace-search-ui.ts`, `connect-ui.ts`).
The whole HTML/JS/CSS is built up via string concatenation inside helper functions.

**External assets** — for projects with a non-trivial UI that benefits from being
edited as a real file (`audit-dashboard.ts`). Static template files live in a
sibling `<name>-assets/` directory and are read at runtime via `readFileSync`.
The TS module substitutes `{{PLACEHOLDER}}` tokens for runtime data.

When in doubt, prefer inline-as-strings; only reach for external assets when the
template is large enough that maintaining it as a literal string is painful (the
audit dashboard is 600+ lines of JSX, which crosses that threshold).

## Adding a new blueprint

1. Create `src/blueprints/<name>.ts` exporting a `generate<Name>(opts): GeneratedProject`.
2. If using external assets, create `src/blueprints/<name>-assets/` and add it to the
   `files` array in `mcp-server/package.json` so it ships in the published package.
3. In whichever server it belongs to, register one tool that takes `output_dir` and
   `port` (and optional data), wires the install + spawn + URL response.
4. Document the tool in `src/shared/capabilities-resource.ts` and the help text in
   `macos-app/LucidLinkMCP/AppDelegate.swift`.
