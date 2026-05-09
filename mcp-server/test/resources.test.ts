/**
 * Tier B: resource reads.
 *
 * MCP resources are content the model can fetch by URI. This file covers the
 * static resources every consolidated server exposes plus a couple of
 * server-specific ones.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, McpClient, ServerName } from "./mcp-client.js";

// ── Shared resources (every entry-point registers brand + capabilities) ─────

const SHARED_RESOURCES: Array<{ name: ServerName; serverInfoName: string }> = [
  { name: "lucid-api",   serverInfoName: "lucidlink-api" },
  { name: "filespace",   serverInfoName: "lucidlink-filespace" },
  { name: "audit-trail", serverInfoName: "lucidlink-audit-trail" },
  { name: "python-sdk",  serverInfoName: "lucidlink-python-sdk" },
];

for (const s of SHARED_RESOURCES) {
  describe(`Resources: ${s.serverInfoName}`, () => {
    let client: McpClient;
    before(async () => { client = await spawn(s.name); });
    after(async () => { await client.close(); });

    it("can read lucidlink://brand/design-tokens", async () => {
      const r = await client.readResource("lucidlink://brand/design-tokens");
      assert.equal(r.contents.length, 1);
      const text = r.contents[0].text ?? "";
      assert.ok(text.includes("#151519"), "missing charcoal background color");
      assert.ok(text.includes("#B0FB15"), "missing neon accent color");
    });

    it("can read lucidlink://guide/capabilities", async () => {
      const r = await client.readResource("lucidlink://guide/capabilities");
      assert.equal(r.contents.length, 1);
      const text = r.contents[0].text ?? "";
      // Post-consolidation the architecture diagram should mention all four servers.
      assert.ok(text.includes("lucidlink-api"));
      assert.ok(text.includes("lucidlink-filespace"));
      assert.ok(text.includes("lucidlink-audit-trail"));
      assert.ok(text.includes("lucidlink-python-sdk"));
    });
  });
}

// ── filespace: search API reference resource ────────────────────────────────

describe("Resources: lucidlink-filespace specific", () => {
  let client: McpClient;
  before(async () => { client = await spawn("filespace"); });
  after(async () => { await client.close(); });

  it("can read lucidlink://search/api-reference", async () => {
    const r = await client.readResource("lucidlink://search/api-reference");
    assert.equal(r.contents.length, 1);
    const text = r.contents[0].text ?? "";
    assert.ok(text.length > 100, `expected substantial API reference, got ${text.length} chars`);
  });
});

// ── python-sdk: chunk resource ──────────────────────────────────────────────

describe("Resources: lucidlink-python-sdk specific", () => {
  let client: McpClient;
  before(async () => { client = await spawn("python-sdk"); });
  after(async () => { await client.close(); });

  it("lists at least 11 SDK doc chunk resources", async () => {
    const resources = await client.listResources();
    const sdkDocs = resources.filter((r) => r.uri.startsWith("lucidlink-sdk://docs/"));
    assert.ok(sdkDocs.length >= 11, `expected >= 11 SDK doc resources, got ${sdkDocs.length}`);
  });

  it("can read a known SDK doc chunk", async () => {
    const r = await client.readResource("lucidlink-sdk://docs/quick-reference");
    assert.equal(r.contents.length, 1);
    const text = r.contents[0].text ?? "";
    assert.ok(text.length > 100, "quick-reference chunk should have content");
    // Spot-check for stable section markers.
    assert.ok(/quick reference|Quick Reference|cheat/i.test(text), `expected quick-reference content, got: ${text.slice(0, 150)}…`);
  });

  it("returns a JSON-RPC error for an unknown SDK chunk URI", async () => {
    await assert.rejects(
      () => client.readResource("lucidlink-sdk://docs/nonexistent-chunk-xyzzy"),
      /resources\/read.*failed|not found|nonexistent/i,
    );
  });
});
