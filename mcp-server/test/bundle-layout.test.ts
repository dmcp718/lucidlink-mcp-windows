/**
 * Unit tests for findFsIndexBinary across the layouts we ship.
 *
 * These would have caught the v2.5.0 bug where the .app bundle layout
 * (binary at Contents/Resources/fs-index-server, script at
 * Contents/Resources/mcp/filespace-server.js) wasn't in the candidate list,
 * so customers got "binary not found" → Claude tried to compile it.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findFsIndexBinary } from "../dist/shared/find-fs-index.js";

function makeStubBinary(path: string): void {
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
}

describe("findFsIndexBinary: macOS .app bundle layout", () => {
  let root: string;
  before(() => {
    // Mimic the production .app: Contents/Resources/fs-index-server (binary)
    // sibling of Contents/Resources/mcp/ (where the script lives).
    root = mkdtempSync(join(tmpdir(), "ll-bundle-"));
    const resources = join(root, "Contents", "Resources");
    const mcpDir = join(resources, "mcp");
    mkdirSync(mcpDir, { recursive: true });
    makeStubBinary(join(resources, "fs-index-server"));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("resolves the binary at Contents/Resources/fs-index-server", () => {
    const scriptDir = join(root, "Contents", "Resources", "mcp");
    const result = findFsIndexBinary(scriptDir);
    assert.ok(result, "expected to find binary, got null");
    assert.equal(result!.binaryPath, join(root, "Contents", "Resources", "fs-index-server"));
  });
});

describe("findFsIndexBinary: dev checkout layout", () => {
  let root: string;
  before(() => {
    // Dev: <repo>/mcp-server/dist/filespace-server.js + <repo>/fs-index-server/fs-index-server
    root = mkdtempSync(join(tmpdir(), "ll-dev-"));
    const distDir = join(root, "mcp-server", "dist");
    const binDir = join(root, "fs-index-server");
    mkdirSync(distDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    makeStubBinary(join(binDir, "fs-index-server"));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("resolves the dev binary from mcp-server/dist/", () => {
    const scriptDir = join(root, "mcp-server", "dist");
    const result = findFsIndexBinary(scriptDir);
    assert.ok(result, "expected to find binary, got null");
    assert.equal(result!.binaryPath, join(root, "fs-index-server", "fs-index-server"));
  });
});

describe("findFsIndexBinary: flat layout (script + binary same dir)", () => {
  let root: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "ll-flat-"));
    makeStubBinary(join(root, "fs-index-server"));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("resolves the binary in the same directory as the script", () => {
    const result = findFsIndexBinary(root);
    assert.ok(result, "expected to find binary, got null");
    assert.equal(result!.binaryPath, join(root, "fs-index-server"));
  });
});

describe("findFsIndexBinary: explicit override wins over candidates", () => {
  let root: string;
  let explicitPath: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "ll-explicit-"));
    // Place a binary at a candidate location AND a different explicit override.
    const resources = join(root, "Contents", "Resources");
    const mcpDir = join(resources, "mcp");
    mkdirSync(mcpDir, { recursive: true });
    makeStubBinary(join(resources, "fs-index-server")); // would be found by .app candidate

    explicitPath = join(root, "custom-bin");
    makeStubBinary(explicitPath);
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("returns the explicit path even when a candidate would resolve", () => {
    const scriptDir = join(root, "Contents", "Resources", "mcp");
    const result = findFsIndexBinary(scriptDir, explicitPath);
    assert.ok(result, "expected to find explicit binary");
    assert.equal(result!.binaryPath, explicitPath);
  });
});

describe("findFsIndexBinary: nothing reachable", () => {
  let root: string;
  before(() => {
    // Empty layout — no binary anywhere reachable from scriptDir.
    root = mkdtempSync(join(tmpdir(), "ll-empty-"));
    mkdirSync(join(root, "isolated", "scriptDir"), { recursive: true });
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("returns null when scriptDir-relative candidates miss (PATH/cwd may still hit on this machine — informational only)", () => {
    const scriptDir = join(root, "isolated", "scriptDir");
    const result = findFsIndexBinary(scriptDir);
    // Note: this assertion is intentionally weak. cwd or PATH on the test
    // machine could resolve a real fs-index-server. The point of this case
    // is to confirm the helper doesn't crash on a miss; the positive cases
    // above carry the actual coverage.
    if (result) {
      // Anything found here came from PATH or cwd, not from scriptDir.
      assert.notEqual(result.binaryPath.startsWith(scriptDir), true);
    }
  });
});
