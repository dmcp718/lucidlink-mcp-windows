/**
 * Tier C: live-API tests against the bundled LucidLink API.
 *
 * The macOS app bundles the LucidLink API (extracted from
 * lucidlink/lucidlink-api Docker image) and starts it at localhost:3003.
 * When the app is running, these tests exercise tools that talk to the API
 * over HTTP — making the harness a meaningful end-to-end check, not just a
 * protocol surface check.
 *
 * Skip behavior:
 *   - If localhost:3003/api/v1/health is not reachable, the suite is skipped
 *     with a clear message (run the macOS app first or `make build`).
 *   - Auth-required tests are gated on LUCIDLINK_TEST_BEARER_TOKEN. Without
 *     it, we still verify that auth-required tools fail predictably with
 *     401, which is itself a useful determinism check.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, McpClient } from "./mcp-client.js";

const API_URL = process.env.LUCIDLINK_TEST_API_URL ?? "http://localhost:3003/api/v1";
const TEST_TOKEN = process.env.LUCIDLINK_TEST_BEARER_TOKEN;

async function apiReachable(): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

describe("Live API: no-auth surface (lucid-api)", async () => {
  if (!(await apiReachable())) {
    it("skipped: LucidLink API not reachable at " + API_URL, { skip: true }, () => {});
    return;
  }

  let client: McpClient;
  before(async () => {
    // Use a stub token: the API's /health endpoint doesn't validate it, but
    // the server-side ApiClient construction requires SOMETHING.
    client = await spawn("lucid-api", { LUCIDLINK_BEARER_TOKEN: "stub-test", LUCIDLINK_API_URL: API_URL });
  });
  after(async () => { await client.close(); });

  it("check_api_connection succeeds against the bundled API", async () => {
    const r = await client.callTool("check_api_connection", {});
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r).slice(0, 300)}`);
    const text = r.content[0].text ?? "";
    assert.ok(/connect/i.test(text) && /success|ok|connected/i.test(text),
      `expected success message, got: ${text.slice(0, 200)}`);
  });

  it("check_api_health reports the API is healthy", async () => {
    const r = await client.callTool("check_api_health", {});
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r).slice(0, 300)}`);
    const text = r.content[0].text ?? "";
    assert.ok(/health/i.test(text), `expected health response, got: ${text.slice(0, 200)}`);
  });

  it("list_providers returns 401 with a stub token (predictable auth failure)", async () => {
    const r = await client.callTool("list_providers", {});
    // The auth failure must surface as isError:true with a recognizable message —
    // not as a silent success or a crash.
    assert.equal(r.isError, true, `expected isError on stub-token call: ${JSON.stringify(r).slice(0, 200)}`);
    const text = r.content[0].text ?? "";
    assert.ok(/auth|token|401|invalid/i.test(text), `expected auth error message, got: ${text.slice(0, 200)}`);
  });

  it("list_filespaces returns 401 with a stub token (predictable auth failure)", async () => {
    const r = await client.callTool("list_filespaces", {});
    assert.equal(r.isError, true, `expected isError on stub-token call: ${JSON.stringify(r).slice(0, 200)}`);
    const text = r.content[0].text ?? "";
    assert.ok(/auth|token|401|invalid/i.test(text), `expected auth error message, got: ${text.slice(0, 200)}`);
  });
});

// ── Tier C-2: authenticated read-only tests (gated on env var) ──────────────

describe("Live API: authenticated read-only (lucid-api)", async () => {
  if (!(await apiReachable())) {
    it("skipped: LucidLink API not reachable at " + API_URL, { skip: true }, () => {});
    return;
  }
  if (!TEST_TOKEN) {
    it("skipped: LUCIDLINK_TEST_BEARER_TOKEN not set", { skip: true }, () => {});
    return;
  }

  let client: McpClient;
  before(async () => {
    client = await spawn("lucid-api", { LUCIDLINK_BEARER_TOKEN: TEST_TOKEN, LUCIDLINK_API_URL: API_URL });
  });
  after(async () => { await client.close(); });

  it("list_providers returns the four expected cloud providers", async () => {
    const r = await client.callTool("list_providers", {});
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r).slice(0, 300)}`);
    const text = r.content.map((c) => c.text ?? "").join("\n");
    // Stable, deterministic providers: AWS, Azure, GCP, Wasabi.
    assert.ok(/AWS/i.test(text), `expected AWS in providers, got: ${text.slice(0, 300)}`);
    assert.ok(/Azure/i.test(text), `expected Azure in providers, got: ${text.slice(0, 300)}`);
    assert.ok(/GCP|Google/i.test(text), `expected GCP in providers, got: ${text.slice(0, 300)}`);
    assert.ok(/Wasabi/i.test(text), `expected Wasabi in providers, got: ${text.slice(0, 300)}`);
  });

  it("list_filespaces returns a list (possibly empty) without crashing", async () => {
    const r = await client.callTool("list_filespaces", {});
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r).slice(0, 300)}`);
    const text = r.content[0].text ?? "";
    // Either "Found N filespace(s)" or "No filespaces found".
    assert.ok(/filespace/i.test(text), `expected filespace-related output, got: ${text.slice(0, 200)}`);
  });

  it("list_service_accounts returns a list (possibly empty) without crashing", async () => {
    const r = await client.callTool("list_service_accounts", {});
    assert.equal(r.isError, undefined, `unexpected error: ${JSON.stringify(r).slice(0, 300)}`);
    const text = r.content[0].text ?? "";
    assert.ok(/service account|No service accounts/i.test(text),
      `expected service-account-related output, got: ${text.slice(0, 200)}`);
  });
});
