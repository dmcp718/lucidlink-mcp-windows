#!/usr/bin/env node
/**
 * Claude Desktop configuration generator for LucidLink MCP servers.
 * Detects platform, generates config snippet, optionally merges into
 * the existing Claude Desktop config file.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";

function getClaudeConfigPath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    default:
      return join(home, ".config", "claude", "claude_desktop_config.json");
  }
}

function generateConfig(): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  const serverDefs = [
    { name: "lucidlink-api", script: "lucid-api-server.js" },
    { name: "lucidlink-connect-api", script: "connect-server.js" },
    { name: "lucidlink-filespace", script: "filespace-server.js" },
    { name: "lucidlink-audit-trail", script: "audit-trail-server.js" },
    { name: "lucidlink-python-sdk", script: "python-sdk-server.js" },
  ];

  for (const def of serverDefs) {
    servers[def.name] = {
      command: "npx",
      args: ["-y", "@lucidlink/mcp-server", def.name.replace("lucidlink-", "lucidlink-")],
      env: {
        LUCIDLINK_API_URL: "http://localhost:3003/api/v1",
        LUCIDLINK_BEARER_TOKEN: "YOUR_TOKEN_HERE",
      },
    };
  }

  return { mcpServers: servers };
}

function main() {
  const args = process.argv.slice(2);
  const doMerge = args.includes("--merge");
  const configPath = getClaudeConfigPath();

  console.log("LucidLink MCP — Claude Desktop Setup\n");
  console.log(`Platform:    ${platform()}`);
  console.log(`Config path: ${configPath}`);
  console.log(`Config exists: ${existsSync(configPath)}\n`);

  const generated = generateConfig();

  if (doMerge) {
    let existing: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existing = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        console.error("Failed to parse existing config. Creating new one.");
      }
    }

    const existingServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
    const newServers = generated.mcpServers as Record<string, unknown>;
    existing.mcpServers = { ...existingServers, ...newServers };

    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
    console.log("Merged LucidLink MCP servers into Claude Desktop config.");
    console.log("\nIMPORTANT: Replace YOUR_TOKEN_HERE with your actual bearer token.");
    console.log("Restart Claude Desktop to pick up the changes.");
  } else {
    console.log("Add this to your Claude Desktop config:\n");
    console.log(JSON.stringify(generated, null, 2));
    console.log("\nTo auto-merge into your config, run:");
    console.log("  npx @lucidlink/mcp-server lucidlink-mcp-setup --merge");
    console.log("\nIMPORTANT: Replace YOUR_TOKEN_HERE with your actual bearer token.");
  }
}

main();
