fs-index-server REST API Reference
=====================================
Base URL: http://localhost:3201  (port configurable via start_filespace_indexer)
All responses are JSON unless noted. CORS is enabled (Access-Control-Allow-Origin: *).

ENDPOINTS
=========

GET /api/health
  Response: { "status": "ok" }

GET /api/filespaces
  Lists discovered filespace names.
  Response: ["filespace-a", "filespace-b"]

GET /api/mounts
  Lists discovered mounts with instance details.
  Response: [{ "Name": "myfs", "MountPoint": "/Volumes/myfs", "InstanceID": "2001" }]

GET /api/files?path=<dir>
  Lists directory contents. Defaults to mount prefix root.
  Response: {
    "path": "/Volumes/myfs/documents",
    "entries": [{
      "id": 42,
      "path": "/Volumes/myfs/documents/report.pdf",
      "name": "report.pdf",
      "parent_path": "/Volumes/myfs/documents",
      "is_directory": false,
      "size": 1048576,
      "modified_at": "2026-03-01T12:00:00Z",
      "created_at": "2026-02-15T09:30:00Z"
    }]
  }

GET /api/stats
  Index statistics.
  Response: { "total_files": 12345, "total_dirs": 678, "indexed_date": "2026-03-07T..." }

GET /api/crawl/stats
  Crawl progress and throughput.
  Response: {
    "crawl": { "pending": 5, "crawling": 2, "completed": 100, "failed": 0, "total": 107 },
    "indexed_files": 12345,
    "throughput": { "dirs_per_sec": 15.2, "files_per_sec": 342.1, "elapsed_sec": 36, "total_dirs": 547, "total_files": 12345 }
  }

GET /api/events?category=<cat>&filespace=<name>&level=<level>&limit=<n>&before_id=<id>
  Event log (all params optional).
  Response: [{ "id": 1, "timestamp": "2026-03-07T...", "category": "indexer", "level": "info", "filespace": "myfs", "message": "Crawl complete", "detail": null }]

POST /api/discover
  Re-discover filespace mounts.
  Response: { "mounts": [...], "count": 2 }

DELETE /api/filespaces/<name>/index
  Clear index for one filespace (triggers re-crawl).
  Response: { "filespace": "myfs", "deleted": 5000 }

SSE ENDPOINTS (Server-Sent Events — for real-time UI)
=====================================================
These return SSE streams, NOT JSON. They use Datastar conventions
(event types: datastar-patch-elements, datastar-patch-signals).
For a custom frontend, use the JSON endpoints above instead.

GET /sse/search?q=<query>&limit=<n>&fs=<filespace>
  FTS5 full-text search. Returns HTML fragments + signal patches via SSE.

GET /sse/search/live?q=<query>&timeout=<sec>&fs=<filespace>
  Live filesystem search (uses find). Streams results as they're found.

GET /sse/directory-view?path=<dir>
  Real-time directory listing via SSE.

GET /sse/events
  Live event stream.

BUILDING A SEARCH WEB APP — COMPLETE BLUEPRINT
================================================

TECH STACK (must follow exactly):
  - Node.js + Express static server (ESM, "type": "module")
  - Vanilla HTML/CSS/JS (no React, no bundler, no framework)
  - Express serves static files from public/ and proxies to fs-index-server
  - package.json dependencies: { "express": "^4.21.0" }

PROJECT STRUCTURE:
  package.json
  server.js          — Express server (proxy + static)
  public/index.html  — single page app shell
  public/style.css   — all styles (dark theme)
  public/app.js      — all client logic

SERVER.JS PATTERN:
  import express from "express";
  import { fileURLToPath } from "node:url";
  import { dirname, join } from "node:path";
  import { exec } from "node:child_process";
  import { platform } from "node:os";

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PORT = 3099;
  const INDEXER = "http://localhost:3201";

  const app = express();
  app.use("/public", express.static(join(__dirname, "public")));
  app.get("/", (_req, res) => res.sendFile(join(__dirname, "public/index.html")));

  // Proxy ALL /api/* requests to fs-index-server (avoids CORS issues)
  app.all("/api/*", async (req, res) => {
    try {
      const url = INDEXER + req.originalUrl;
      const resp = await fetch(url);
      const ct = resp.headers.get("content-type") || "application/json";
      const body = await resp.text();
      res.status(resp.status).set("Content-Type", ct).send(body);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Proxy SSE search — stream back to client
  app.get("/sse/search", async (req, res) => {
    try {
      const url = INDEXER + "/sse/search?" + new URLSearchParams(req.query).toString();
      const resp = await fetch(url);
      res.status(resp.status);
      resp.headers.forEach((v, k) => res.set(k, v));
      const reader = resp.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      pump();
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.listen(PORT, "127.0.0.1", () => {
    const url = "http://localhost:" + PORT;
    console.log("LucidLink Search  ->  " + url);
    const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
    setTimeout(() => exec(cmd + " " + url), 800);
  });

UI LAYOUT (index.html):
  - Header: app title "LucidLink Search" with LucidLink circle logo SVG
  - Status bar: shows indexer connection status, indexed file count, crawl progress
  - Filespace filter: horizontal pill/chip buttons from GET /api/filespaces
  - Search input: large, prominent, with placeholder "Search files across filespaces..."
  - Results area: table or card list showing filename, path, size, modified date
  - Empty state: "Start typing to search across {N} indexed files"

SEARCH IMPLEMENTATION (app.js):
  The client should search via the JSON proxy, NOT SSE. Here is the recommended approach:

  1. On page load:
     - GET /api/health → show green/red status indicator
     - GET /api/filespaces → render filespace filter chips
     - GET /api/crawl/stats → show "X files indexed" and crawl progress

  2. On search (debounced 300ms after typing):
     - GET /api/files?path=<mount_prefix>  is for browsing, NOT for search
     - For FTS5 search, fetch the SSE endpoint and parse it:

       async function search(query, filespace) {
         const params = new URLSearchParams({ q: query, limit: "100" });
         if (filespace) params.set("fs", filespace);
         const resp = await fetch("/sse/search?" + params);
         const text = await resp.text();
         // Extract structured data from SSE HTML fragments
         const paths = [...text.matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
         const names = [...text.matchAll(/class="file-name">([^<]+)</g)].map(m => m[1]);
         const countMatch = text.match(/_searchCount:\s*(\d+)/);
         return { paths, names, total: countMatch ? parseInt(countMatch[1]) : paths.length };
       }

  3. Render results as a table:
     | Icon | Name | Path | Size | Modified |
     - Directory icon (folder emoji or SVG) for is_directory entries
     - File icon for files
     - Path shown as breadcrumb-style with filespace name highlighted

  4. Polling for crawl progress (optional, nice UX):
     - Every 5s while crawling: GET /api/crawl/stats
     - Show progress bar: completed / total directories
     - Show throughput: "342 files/sec"

BROWSE MODE (complementary to search):
  - Clicking a directory result navigates into it: GET /api/files?path=<clicked_path>
  - Breadcrumb trail above results showing path hierarchy
  - Back button / breadcrumb click to navigate up

CSS DESIGN TOKENS (from lucidlink://brand/design-tokens):
  :root {
    --bg: #151519;
    --surface: #1e1e24;
    --border: #2a2a32;
    --text: #ffffff;
    --muted: #8a8a96;
    --accent: #B0FB15;
    --accent-dim: rgba(176, 251, 21, 0.12);
    --indigo: #5E53E0;
    --error: #F8685A;
    --r: 12px;
  }
  body {
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  - Google Fonts: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  - Search input: large (44-48px height), rounded, surface bg, border on focus = accent
  - Results table: surface bg, border rows, monospace paths (IBM Plex Mono)
  - File size: muted color, right-aligned
  - Accent color (#B0FB15) for: active filespace chip, search icon, focus rings, CTAs only
  - Border radius: 8-12px for cards, 20px for pill chips
  - Transitions: 150ms ease

SETUP INSTRUCTIONS (returned to user):
  cd <output-directory>
  npm install
  node server.js
  → Opens http://localhost:3099

  Requirements:
  - Node.js 18+
  - fs-index-server running on localhost:3201 (use start_filespace_indexer MCP tool)

IMPORTANT RULES
===============
- NEVER rewrite the Go binary — it is compiled, tested, and production-ready.
- NEVER build a search backend in Python, FastAPI, or any other language.
- The Express server proxies to fs-index-server — do NOT duplicate its logic.
- Use Inter font (body) and IBM Plex Mono (paths/mono). NEVER use Aeonik or DM Sans.
- Dark theme only: #151519 background, #FFFFFF text, #B0FB15 accent.
- Sentence case only. No title case, no ALL CAPS.
- Read lucidlink://brand/design-tokens for the complete brand specification.
