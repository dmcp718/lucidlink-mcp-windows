/**
 * Cross-platform configuration for LucidLink MCP servers.
 *
 * Resolution order: environment variable → config file → default.
 * Config file: ~/.lucidlink/mcp-config.json (optional)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface McpConfig {
  apiUrl?: string;
  bearerToken?: string;
  fsIndexPort?: number;
  fsIndexBinary?: string;
}

const CONFIG_PATH = join(homedir(), ".lucidlink", "mcp-config.json");

let cachedConfig: McpConfig | null = null;

function loadConfigFile(): McpConfig {
  if (cachedConfig) return cachedConfig;

  if (existsSync(CONFIG_PATH)) {
    try {
      cachedConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as McpConfig;
    } catch {
      cachedConfig = {};
    }
  } else {
    cachedConfig = {};
  }

  return cachedConfig;
}

export function getApiUrl(): string {
  return (
    process.env.LUCIDLINK_API_URL ||
    loadConfigFile().apiUrl ||
    "http://localhost:3003/api/v1"
  );
}

export function getBearerToken(): string | null {
  return (
    process.env.LUCIDLINK_BEARER_TOKEN ||
    loadConfigFile().bearerToken ||
    null
  );
}

export function getFsIndexPort(): number {
  const envPort = process.env.FS_INDEX_PORT;
  if (envPort) return parseInt(envPort, 10);
  return loadConfigFile().fsIndexPort ?? 3201;
}

export function getFsIndexBinary(): string | null {
  return (
    process.env.FS_INDEX_BINARY ||
    loadConfigFile().fsIndexBinary ||
    null
  );
}

export const CONFIG_PATH_DISPLAY = CONFIG_PATH;
