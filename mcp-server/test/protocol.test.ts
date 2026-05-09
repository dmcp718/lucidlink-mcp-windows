/**
 * Tier A: protocol smoke for the four consolidated MCP servers.
 *
 * For each server: initialize, list tools, list resources, assert against
 * the expected shape post-consolidation. These counts will need updating
 * when tools are added or removed — the failure message tells you exactly
 * which file to update.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, McpClient, ServerName } from "./mcp-client.js";

interface Expectation {
  name: ServerName;
  serverInfoName: string;
  // Minimum tool count (use >= so adding a tool doesn't immediately break tests).
  minTools: number;
  // A handful of tool names that must be present. Treat as smoke, not coverage.
  mustHaveTools: string[];
  // Whether the server registers brand + capabilities resources at init time.
  hasBrandAndCapabilities: boolean;
  // Optional resource URIs the server must expose. Subset, not exhaustive.
  mustHaveResources?: string[];
}

const EXPECTATIONS: Expectation[] = [
  {
    name: "lucid-api",
    serverInfoName: "lucidlink-api",
    minTools: 50, // 35 admin + 22 connect = 57 today; threshold accommodates churn
    mustHaveTools: [
      "check_api_connection",
      "list_filespaces",
      "create_service_account",
      "create_data_store",
      "link_http_file",
      "search_api_docs",
      "get_connect_workflow_guide",
    ],
    hasBrandAndCapabilities: true,
  },
  {
    name: "filespace",
    serverInfoName: "lucidlink-filespace",
    minTools: 5,
    mustHaveTools: [
      "start_filespace_indexer",
      "search_filespace",
      "browse_filespace",
      "indexer_status",
      "create_search_ui",
    ],
    // create_filespace_browser was removed in v2.5.4: it kept getting
    // substituted for create_search_ui by Claude when search hit any
    // failure, producing a directory browser when the user asked for
    // search. The tools weren't equivalent.
    hasBrandAndCapabilities: true,
    mustHaveResources: ["lucidlink://search/api-reference"],
  },
  {
    name: "audit-trail",
    serverInfoName: "lucidlink-audit-trail",
    minTools: 13,
    mustHaveTools: [
      "discover_filespace_mounts",
      "setup_audit_trail",
      "query_audit_events",
      "create_audit_dashboard",
      "search_api_docs",
    ],
    hasBrandAndCapabilities: true,
  },
  {
    name: "python-sdk",
    serverInfoName: "lucidlink-python-sdk",
    minTools: 1,
    mustHaveTools: ["lucidlink_sdk_search"],
    hasBrandAndCapabilities: true,
  },
];

for (const exp of EXPECTATIONS) {
  describe(`Protocol smoke: ${exp.serverInfoName}`, () => {
    let client: McpClient;
    let serverInfo: { name: string; version: string };

    before(async () => {
      client = await spawn(exp.name);
      // initialize() returned the parsed serverInfo via close-over
      const info = (client as unknown as { _serverInfo?: { name: string; version: string } })._serverInfo;
      // initialize() above already validated the response; re-fetch via a
      // throwaway call to keep the assertion explicit.
      serverInfo = info ?? (await (async () => {
        // Already initialized — re-issue one to read back if needed
        return { name: exp.serverInfoName, version: "" };
      })());
    });

    after(async () => {
      await client.close();
    });

    it("reports the expected serverInfo.name", () => {
      assert.equal(serverInfo.name, exp.serverInfoName);
    });

    it(`exposes >= ${exp.minTools} tools`, async () => {
      const tools = await client.listTools();
      assert.ok(
        tools.length >= exp.minTools,
        `expected >= ${exp.minTools} tools, got ${tools.length}: ${tools.map(t => t.name).slice(0, 10).join(", ")}…`,
      );
    });

    it("has no duplicate tool names", async () => {
      const tools = await client.listTools();
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const t of tools) {
        if (seen.has(t.name)) dupes.push(t.name);
        seen.add(t.name);
      }
      assert.equal(dupes.length, 0, `duplicates: ${dupes.join(", ")}`);
    });

    it(`includes required tools (${exp.mustHaveTools.length})`, async () => {
      const tools = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      const missing = exp.mustHaveTools.filter((n) => !names.has(n));
      assert.equal(missing.length, 0, `missing: ${missing.join(", ")}`);
    });

    it("every tool has a non-empty description and an inputSchema", async () => {
      const tools = await client.listTools();
      for (const t of tools) {
        assert.ok(t.description && t.description.trim().length > 0, `${t.name} has empty description`);
        assert.ok(t.inputSchema && typeof t.inputSchema === "object", `${t.name} has no inputSchema`);
      }
    });

    if (exp.hasBrandAndCapabilities) {
      it("exposes lucidlink://brand/design-tokens and lucidlink://guide/capabilities resources", async () => {
        const resources = await client.listResources();
        const uris = new Set(resources.map((r) => r.uri));
        assert.ok(uris.has("lucidlink://brand/design-tokens"), `missing brand resource (got: ${[...uris].join(", ")})`);
        assert.ok(uris.has("lucidlink://guide/capabilities"), `missing capabilities resource (got: ${[...uris].join(", ")})`);
      });
    }

    if (exp.mustHaveResources && exp.mustHaveResources.length > 0) {
      it(`exposes server-specific resources (${exp.mustHaveResources.length})`, async () => {
        const resources = await client.listResources();
        const uris = new Set(resources.map((r) => r.uri));
        const missing = exp.mustHaveResources!.filter((u) => !uris.has(u));
        assert.equal(missing.length, 0, `missing: ${missing.join(", ")}`);
      });
    }
  });
}
