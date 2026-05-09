/**
 * Blueprint generator for the LucidLink audit-trail dashboard.
 *
 * Mirrors the create_connect_ui pattern: emits a small Node project
 * (Express + a single static index.html that loads React + recharts +
 * lucide-react via CDN and uses Babel-standalone for inline JSX). The MCP
 * tool runs `npm install` and starts the server for the customer; the
 * customer never touches a shell.
 *
 * Static template files live in audit-dashboard-assets/ and are read at
 * runtime from known relative locations (matches the python-sdk chunks
 * pattern). See src/blueprints/README.md for the full convention.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

function findTemplate(filename: string): string {
  const candidates = [
    // Production: dist sits next to src; assets ship as src/blueprints/audit-dashboard-assets/
    resolve(__dir, "audit-dashboard-assets", filename),
    // Dev: compiled dist/blueprints/<file>.js → walk back to src/blueprints/audit-dashboard-assets/
    resolve(__dir, "..", "..", "src", "blueprints", "audit-dashboard-assets", filename),
    resolve(__dir, "..", "..", "..", "src", "blueprints", "audit-dashboard-assets", filename),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, "utf-8");
  }
  throw new Error(`audit-dashboard template not found: ${filename}. Searched: ${candidates.join(", ")}`);
}

export interface GeneratedProject {
  files: Record<string, string>;
  instructions: string;
}

export interface AuditDashboardData {
  meta: {
    filespace: string;
    totalEvents: number;
    uniqueUsers: number;
    rangeStart: string;
    rangeEnd: string;
    spanDays: number;
    lastEvent?: string;
  };
  users: Array<{ name: string; count: number; short: string }>;
  actionGroups: Array<{
    title: string;
    actions: Array<{ name: string; count: number; icon: string; color: string }>;
  }>;
  osDist: Array<{ name: string; count: number; color: string }>;
  hosts: Array<{ name: string; count: number; type: string }>;
  daily: Array<{ date: string; count: number }>;
  topPaths: Array<{ path: string; count: number; kind?: string }>;
  recent: Array<{ ts: string; user: string; action: string; path: string; host: string }>;
}

/** Sensible defaults so a customer can demo the dashboard without supplying data. */
const SAMPLE_DATA: AuditDashboardData = {
  meta: {
    filespace: "example.lucid-demo",
    totalEvents: 100000,
    uniqueUsers: 12,
    rangeStart: "2026-04-01",
    rangeEnd: "2026-05-01",
    spanDays: 30,
    lastEvent: "2026-05-01 18:00 UTC",
  },
  users: [
    { name: "alice@example.com",  count: 60000, short: "alice" },
    { name: "bob@example.com",    count: 18000, short: "bob" },
    { name: "carol@example.com",  count: 12000, short: "carol" },
    { name: "dave@example.com",   count:  6000, short: "dave" },
    { name: "erin@example.com",   count:  4000, short: "erin" },
  ],
  actionGroups: [
    { title: "File operations", actions: [
      { name: "FileRead",    count: 80000, icon: "Eye",      color: "#60a5fa" },
      { name: "FileWritten", count:  6000, icon: "Edit3",    color: "#a78bfa" },
      { name: "FileCreate",  count:  2000, icon: "FilePlus", color: "#34d399" },
      { name: "FileDelete",  count:  1000, icon: "Trash2",   color: "#f87171" },
    ]},
    { title: "Directory operations", actions: [
      { name: "DirectoryCreate", count: 800, icon: "FolderOpen", color: "#4ade80" },
      { name: "DirectoryDelete", count: 300, icon: "Trash2",     color: "#fb7185" },
      { name: "Move",            count: 500, icon: "Move",       color: "#22d3ee" },
    ]},
    { title: "Metadata & cache", actions: [
      { name: "ExtendedAttributeSet", count: 200, icon: "Tag", color: "#fbbf24" },
      { name: "Pin",                  count: 100, icon: "Pin", color: "#f472b6" },
    ]},
    { title: "System", actions: [
      { name: "PreHydrate", count: 50, icon: "Activity", color: "#cbd5e1" },
    ]},
  ],
  osDist: [
    { name: "macOS",    count: 70000, color: "#94a3b8" },
    { name: "Linux",    count: 25000, color: "#fbbf24" },
    { name: "Windows",  count:  5000, color: "#60a5fa" },
  ],
  hosts: [
    { name: "alice-mbp.local",  count: 60000, type: "MacBook" },
    { name: "ci-runner-01",     count: 18000, type: "Linux Server" },
    { name: "bob-desktop.lan",  count: 12000, type: "MacBook" },
  ],
  daily: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(2026, 3, i + 1).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
    count: Math.round(2000 + Math.random() * 4000),
  })),
  topPaths: [
    { path: "/Projects/Active/film.mov",    count: 240, kind: "Video" },
    { path: "/Projects/Active/edit.prproj", count: 180, kind: "Premiere" },
  ],
  recent: [
    { ts: "2026-05-01 17:55:00", user: "alice", action: "FileRead",    path: "/Projects/Active/film.mov",    host: "alice-mbp.local" },
    { ts: "2026-05-01 17:54:30", user: "alice", action: "FileWritten", path: "/Projects/Active/edit.prproj", host: "alice-mbp.local" },
  ],
};

export function generateAuditDashboard(opts: {
  port?: number;
  data?: AuditDashboardData;
}): GeneratedProject {
  const port = opts.port ?? 3199;
  const data = opts.data ?? SAMPLE_DATA;

  const indexHtml = findTemplate("index.html")
    .replace(/{{TITLE}}/g, data.meta.filespace.replace(/[<>"]/g, ""))
    .replace("{{META_JSON}}", JSON.stringify(data.meta, null, 2))
    .replace("{{USERS_JSON}}", JSON.stringify(data.users, null, 2))
    .replace("{{ACTION_GROUPS_JSON}}", JSON.stringify(data.actionGroups, null, 2))
    .replace("{{OS_DIST_JSON}}", JSON.stringify(data.osDist, null, 2))
    .replace("{{HOSTS_JSON}}", JSON.stringify(data.hosts, null, 2))
    .replace("{{DAILY_JSON}}", JSON.stringify(data.daily, null, 2))
    .replace("{{TOP_PATHS_JSON}}", JSON.stringify(data.topPaths, null, 2))
    .replace("{{RECENT_JSON}}", JSON.stringify(data.recent, null, 2));

  const serverJs = findTemplate("server.js").replace(/{{PORT}}/g, String(port));
  const packageJson = findTemplate("package.json");

  return {
    files: {
      "package.json": packageJson,
      "server.js": serverJs,
      "public/index.html": indexHtml,
    },
    instructions:
      "LucidLink Audit Trail Dashboard — Generated Project\n" +
      "====================================================\n\n" +
      "Setup:\n" +
      "  cd <output-directory>\n" +
      "  npm install\n" +
      "  npm start\n\n" +
      `Then open http://localhost:${port} (auto-opens on start).\n\n` +
      "What's inside:\n" +
      "  - public/index.html — single-file React dashboard. CDN imports for\n" +
      "    React, recharts, lucide-react, Tailwind. Babel-standalone transpiles\n" +
      "    the inline JSX in the browser (~500ms first paint).\n" +
      "  - server.js — Express static server. Opens the browser on launch.\n" +
      "  - package.json — only dependency is Express.\n\n" +
      "Editing:\n" +
      "  Open public/index.html and find the data block (META, USERS, ...).\n" +
      "  Edit the values; reload the page.\n\n" +
      "Live OpenSearch wiring (v2 — not yet implemented):\n" +
      "  Replace the static data block with fetch() calls against the\n" +
      "  audit-trail OpenSearch index (default: http://localhost:9200).\n",
  };
}
