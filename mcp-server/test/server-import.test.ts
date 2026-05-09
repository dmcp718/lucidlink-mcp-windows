/**
 * Server Import Tests
 *
 * Verifies that each compiled server module can be imported
 * without throwing. This catches ESM/CJS issues, missing
 * dependencies, and top-level execution errors.
 *
 * NOTE: The servers call server.connect() at the top level
 * which tries to read stdin. We import individual modules
 * instead to avoid that side effect.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Shared module imports (compiled JS)", () => {
  it("imports shared/formatters", async () => {
    const mod = await import("../dist/shared/formatters.js");
    assert.ok(typeof mod.ok === "function");
    assert.ok(typeof mod.err === "function");
    assert.ok(typeof mod.formatSuccess === "function");
    assert.ok(typeof mod.formatError === "function");
  });

  it("imports shared/validators", async () => {
    const mod = await import("../dist/shared/validators.js");
    assert.ok(typeof mod.validateFilespaceName === "function");
    assert.ok(typeof mod.validateEmail === "function");
    assert.ok(typeof mod.validateGroupName === "function");
  });

  it("imports shared/rate-limiter", async () => {
    const mod = await import("../dist/shared/rate-limiter.js");
    assert.ok(typeof mod.RateLimiter === "function");
  });

  // shared/keychain and shared/process-manager were removed before the test
  // suite was updated; bearer-token retrieval now lives in shared/config.
  it("imports shared/config (bearer token + API URL helpers)", async () => {
    const mod = await import("../dist/shared/config.js");
    assert.ok(typeof mod.getBearerToken === "function");
    assert.ok(typeof mod.getApiUrl === "function");
  });

  it("imports shared/api-client", async () => {
    const mod = await import("../dist/shared/api-client.js");
    assert.ok(typeof mod.ApiClient === "function");
  });

  it("imports shared/brand-resource", async () => {
    const mod = await import("../dist/shared/brand-resource.js");
    assert.ok(typeof mod.registerBrandResource === "function");
  });

  it("imports shared/capabilities-resource", async () => {
    const mod = await import("../dist/shared/capabilities-resource.js");
    assert.ok(typeof mod.registerCapabilitiesResource === "function");
  });

  it("imports connect/workflow-tools", async () => {
    const mod = await import("../dist/connect/workflow-tools.js");
    assert.ok(typeof mod.ensureFolderPath === "function");
    assert.ok(typeof mod.importS3Object === "function");
    assert.ok(typeof mod.bulkImportS3Objects === "function");
  });

  it("imports blueprints/connect-ui", async () => {
    const mod = await import("../dist/blueprints/connect-ui.js");
    assert.ok(typeof mod.generateConnectUI === "function");
  });

  it("imports blueprints/filespace-search-ui", async () => {
    const mod = await import("../dist/blueprints/filespace-search-ui.js");
    assert.ok(typeof mod.generateSearchUI === "function");
  });

  it("imports blueprints/audit-dashboard", async () => {
    const mod = await import("../dist/blueprints/audit-dashboard.js");
    assert.ok(typeof mod.generateAuditDashboard === "function");
  });
});
