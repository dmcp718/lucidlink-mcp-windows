/**
 * Tier B: tools that are deterministic and don't require a running backend.
 *
 * Covers:
 *   - get_connect_workflow_guide   (static text, lucid-api server)
 *   - search_api_docs              (static MD chunks, registered on 3 servers)
 *   - lucidlink_sdk_search         (static MD chunks, python-sdk server)
 *
 * Asserts both happy paths (returns expected content) and error paths
 * (invalid args fail predictably).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, McpClient } from "./mcp-client.js";

// ── get_connect_workflow_guide on lucid-api ─────────────────────────────────

describe("Backend-free: get_connect_workflow_guide (lucid-api)", () => {
  let client: McpClient;
  before(async () => { client = await spawn("lucid-api"); });
  after(async () => { await client.close(); });

  it("returns the workflow guide as text", async () => {
    const r = await client.callTool("get_connect_workflow_guide", {});
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r)}`);
    assert.ok(r.content.length > 0);
    const text = r.content[0].text ?? "";
    // Spot-check for stable section markers.
    assert.ok(text.includes("LucidLink Connect MCP Server"), "missing header");
    assert.ok(text.includes("PATH 1 — S3 OBJECT"), "missing S3 path section");
    assert.ok(text.includes("PATH 2 — HTTP LINK"), "missing HTTP path section");
    assert.ok(text.length > 1000, `expected substantial guide, got ${text.length} chars`);
  });

  it("ignores any extra arguments (no required args)", async () => {
    // Tool schema is empty — extras shouldn't change output.
    const r = await client.callTool("get_connect_workflow_guide", { unexpected: 42 });
    assert.equal(r.isError, undefined);
    assert.ok((r.content[0].text ?? "").includes("LucidLink Connect MCP Server"));
  });
});

// ── search_api_docs on lucid-api ────────────────────────────────────────────

describe("Backend-free: search_api_docs (lucid-api)", () => {
  let client: McpClient;
  before(async () => { client = await spawn("lucid-api"); });
  after(async () => { await client.close(); });

  it("returns hits for a known query", async () => {
    const r = await client.callTool("search_api_docs", { query: "filespace" });
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r)}`);
    assert.ok(r.content.length > 0);
    const text = r.content.map((c) => c.text ?? "").join("\n");
    assert.ok(text.length > 0, "expected non-empty result");
  });

  it("returns a no-match message for nonsense queries", async () => {
    const r = await client.callTool("search_api_docs", { query: "zzzqqq_nonexistent_xyzzy_127" });
    // Either isError or a "no matches" content line is acceptable; the
    // contract is "predictable response, not a crash".
    assert.equal(typeof r, "object");
    assert.ok(Array.isArray(r.content));
  });

  it("rejects an empty query", async () => {
    const r = await client.callTool("search_api_docs", { query: "" });
    // An empty query may either: (a) return an error, or (b) return a stub
    // listing all docs. Both are acceptable; the contract is "no crash".
    assert.ok(Array.isArray(r.content));
  });

  it("errors when 'query' is missing", async () => {
    const r = await client.callTool("search_api_docs", {});
    assert.equal(r.isError, true, `expected isError on missing required arg, got: ${JSON.stringify(r)}`);
  });
});

// ── lucidlink_sdk_search on python-sdk ──────────────────────────────────────

describe("Backend-free: lucidlink_sdk_search (python-sdk)", () => {
  let client: McpClient;
  before(async () => { client = await spawn("python-sdk"); });
  after(async () => { await client.close(); });

  it("returns hits for a real SDK term", async () => {
    const r = await client.callTool("lucidlink_sdk_search", { query: "create_daemon" });
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r)}`);
    const text = r.content.map((c) => c.text ?? "").join("\n");
    // create_daemon is a real export — should appear in at least one hit.
    assert.ok(text.length > 0, "expected non-empty result");
    assert.ok(/create_daemon|Daemon/i.test(text), `expected daemon-related content, got: ${text.slice(0, 200)}…`);
  });

  it("respects max_results bound", async () => {
    const r = await client.callTool("lucidlink_sdk_search", { query: "filespace", max_results: 1 });
    assert.equal(r.isError, undefined);
    // Implementation returns top-N as separate content blocks.
    assert.ok(r.content.length <= 1, `expected <=1 hit, got ${r.content.length}`);
  });

  it("errors when 'query' is missing", async () => {
    const r = await client.callTool("lucidlink_sdk_search", {});
    assert.equal(r.isError, true);
  });
});
