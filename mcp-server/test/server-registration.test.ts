/**
 * Server Registration Tests
 *
 * Validates that all MCP servers:
 * - Have unique tool names (no collisions across servers)
 * - Set instructions in server options
 * - Register brand and capabilities resources
 * - Have proper tool descriptions (not empty)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "..", "src");

// Server entry-points: each constructs McpServer({...}, {instructions: ...})
// and registers brand + capabilities resources directly.
const SERVER_ENTRYPOINTS = [
  "lucid-api-server.ts",
  "filespace-server.ts",
  "audit-trail-server.ts",
  "python-sdk-server.ts",
];

// Tool-registrar modules: export register*Tools(server, deps) functions that
// add tools onto a parent server. Tools live here, but McpServer construction
// and brand/capabilities registration live in the parent entry-point.
const TOOL_REGISTRARS = ["connect/register.ts"];

// All files that contain server.tool(...) calls — used for tool-name and
// description checks. Entry-points + registrars together represent the full
// tool surface across all four MCP servers.
const ALL_TOOL_FILES = [...SERVER_ENTRYPOINTS, ...TOOL_REGISTRARS];

function readSrc(name: string): string {
  return readFileSync(resolve(srcDir, name), "utf-8");
}

function extractToolNames(content: string): string[] {
  const names: string[] = [];
  const re = /server\.tool\(\s*\n?\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    names.push(m[1]);
  }
  return names;
}

describe("Server tool registration", () => {
  // Group tool-registrar files under their owning entry-point so the
  // cross-server dup check works correctly. connect/register.ts is owned
  // by lucid-api-server.ts.
  const REGISTRAR_OWNERS: Record<string, string> = {
    "connect/register.ts": "lucid-api-server.ts",
  };

  // serverName (entry-point) -> [tool names contributed by all files for that server]
  const toolsByServer = new Map<string, string[]>();

  for (const file of ALL_TOOL_FILES) {
    const owner = REGISTRAR_OWNERS[file] ?? file;
    const content = readSrc(file);
    const tools = extractToolNames(content);

    it(`${file}: registers at least one tool`, () => {
      assert.ok(tools.length > 0, `${file} has no tools registered`);
    });

    if (!toolsByServer.has(owner)) toolsByServer.set(owner, []);
    toolsByServer.get(owner)!.push(...tools);
  }

  for (const [server, tools] of toolsByServer) {
    it(`${server}: no duplicate tool names within the server`, () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const t of tools) {
        if (seen.has(t)) dupes.push(t);
        seen.add(t);
      }
      assert.equal(dupes.length, 0, `Duplicate tools in ${server}: ${dupes.join(", ")}`);
    });
  }

  it("no duplicate tool names across servers", () => {
    // Tool name -> list of servers registering it. Cross-server dups would mean
    // two different MCP servers expose the same tool name (legitimate when
    // different servers genuinely need the same name, e.g. search_api_docs
    // from registerDocsSearch lives on multiple servers — that's acceptable).
    const allTools = new Map<string, string[]>();
    for (const [server, tools] of toolsByServer) {
      for (const t of tools) {
        if (!allTools.has(t)) allTools.set(t, []);
        allTools.get(t)!.push(server);
      }
    }

    // search_api_docs is intentionally registered on multiple servers via
    // registerDocsSearch — extract source files don't show it but it's added
    // at runtime to each server that calls registerDocsSearch(server). The
    // grep above won't see it. So in practice this check only flags real
    // dups in source files, which is what we want.
    const dupes: string[] = [];
    for (const [name, servers] of allTools) {
      if (servers.length > 1) {
        dupes.push(`"${name}" in: ${servers.join(", ")}`);
      }
    }
    assert.equal(dupes.length, 0, `Duplicate tool names across servers:\n${dupes.join("\n")}`);
  });
});

describe("Server entry-point boilerplate", () => {
  for (const file of SERVER_ENTRYPOINTS) {
    it(`${file}: passes instructions in McpServer options`, () => {
      const content = readSrc(file);
      assert.ok(
        content.includes("instructions:") || content.includes("instructions :"),
        `${file} does not set instructions in McpServer options`,
      );
    });

    it(`${file}: registers brand resource`, () => {
      const content = readSrc(file);
      assert.ok(
        content.includes("registerBrandResource"),
        `${file} does not register brand resource`,
      );
    });

    it(`${file}: registers capabilities resource`, () => {
      const content = readSrc(file);
      assert.ok(
        content.includes("registerCapabilitiesResource"),
        `${file} does not register capabilities resource`,
      );
    });
  }
});

describe("Tool descriptions", () => {
  for (const file of ALL_TOOL_FILES) {
    const content = readSrc(file);
    const re = /server\.tool\(\s*\n?\s*"([^"]+)",\s*\n?\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const [, name, desc] = m;
      it(`${file} > ${name}: description is not empty`, () => {
        assert.ok(desc.trim().length > 10,
          `Tool "${name}" has a too-short description: "${desc}"`);
      });
    }
  }
});
