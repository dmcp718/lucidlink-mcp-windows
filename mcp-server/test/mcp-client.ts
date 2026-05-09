/**
 * Minimal stdio MCP client used by protocol/backend-free tests.
 *
 * Spawns a compiled server (dist/<name>-server.js), performs the initialize
 * handshake, and exposes a small request API. No external SDK — direct
 * JSON-RPC over stdin/stdout, line-delimited.
 *
 * Designed so tests can:
 *   const client = await spawn("lucid-api");
 *   const tools = await client.listTools();
 *   const result = await client.callTool("get_connect_workflow_guide", {});
 *   await client.close();
 */
import { spawn as nodeSpawn, ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");

export type ServerName = "lucid-api" | "filespace" | "audit-trail" | "python-sdk";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ResourceDescriptor {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface ResourceContents {
  contents: Array<{ uri: string; text?: string; mimeType?: string }>;
}

export class McpClient {
  private proc: ChildProcess;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, (msg: JsonRpcResponse) => void>();
  private closed = false;

  constructor(serverName: ServerName, env: Record<string, string> = {}) {
    const entry = resolve(DIST, `${serverName}-server.js`);
    this.proc = nodeSpawn("node", [entry], {
      stdio: ["pipe", "pipe", "pipe"],
      // Provide a stub bearer token so lazy ApiClient construction in tools
      // that capture token at definition-time doesn't blow up. Tools that
      // actually contact the API will fail at the network layer (which we
      // do not exercise in this harness).
      env: { ...process.env, LUCIDLINK_BEARER_TOKEN: "stub-test", ...env },
    });

    this.proc.stdout!.setEncoding("utf-8");
    this.proc.stdout!.on("data", (chunk: string) => {
      this.buf += chunk;
      let idx;
      while ((idx = this.buf.indexOf("\n")) !== -1) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        let msg: JsonRpcResponse;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof msg.id === "number") {
          const cb = this.pending.get(msg.id);
          if (cb) {
            this.pending.delete(msg.id);
            cb(msg);
          }
        }
      }
    });

    this.proc.on("exit", () => {
      this.closed = true;
      // Reject any in-flight callers.
      for (const cb of this.pending.values()) {
        cb({ jsonrpc: "2.0", id: -1, error: { code: -1, message: "server exited" } });
      }
      this.pending.clear();
    });
  }

  /** Send a JSON-RPC request and resolve with the parsed response. */
  private request(method: string, params?: unknown, timeoutMs = 5000): Promise<JsonRpcResponse> {
    if (this.closed) throw new Error("client is closed");
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        res(msg);
      });
      this.proc.stdin!.write(payload);
    });
  }

  async initialize(): Promise<{ name: string; version: string }> {
    const resp = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-harness", version: "0" },
    });
    if (resp.error) throw new Error(`initialize failed: ${resp.error.message}`);
    const r = resp.result as { serverInfo: { name: string; version: string } };
    // Per spec: client must send notifications/initialized after successful initialize.
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    return r.serverInfo;
  }

  async listTools(): Promise<ToolDescriptor[]> {
    const resp = await this.request("tools/list", {});
    if (resp.error) throw new Error(`tools/list failed: ${resp.error.message}`);
    return (resp.result as { tools: ToolDescriptor[] }).tools;
  }

  async listResources(): Promise<ResourceDescriptor[]> {
    const resp = await this.request("resources/list", {});
    if (resp.error) throw new Error(`resources/list failed: ${resp.error.message}`);
    return (resp.result as { resources: ResourceDescriptor[] }).resources;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const resp = await this.request("tools/call", { name, arguments: args });
    if (resp.error) {
      // Some servers return tool-arg validation errors as JSON-RPC errors
      // rather than ToolResult.isError. Surface them in a uniform shape.
      return { content: [{ type: "text", text: resp.error.message }], isError: true };
    }
    return resp.result as ToolCallResult;
  }

  async readResource(uri: string): Promise<ResourceContents> {
    const resp = await this.request("resources/read", { uri });
    if (resp.error) throw new Error(`resources/read(${uri}) failed: ${resp.error.message}`);
    return resp.result as ResourceContents;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try {
      this.proc.stdin!.end();
    } catch {
      // already closed
    }
    await new Promise<void>((res) => {
      if (this.closed) return res();
      this.proc.once("exit", () => res());
      // Backstop: SIGTERM after 1s if it hasn't exited cleanly.
      setTimeout(() => {
        if (!this.closed) this.proc.kill("SIGTERM");
      }, 1000);
    });
  }
}

/** Spawn + initialize in one step; convenience for test setup. */
export async function spawn(name: ServerName, env: Record<string, string> = {}): Promise<McpClient> {
  const client = new McpClient(name, env);
  await client.initialize();
  return client;
}
