#!/usr/bin/env node
/**
 * LucidLink Python SDK MCP Server
 *
 * 6th MCP server — provides searchable access to the LucidLink Python SDK
 * documentation. 12 doc chunks covering setup, daemon lifecycle, file I/O,
 * Connect, fsspec, models, examples, performance, file locking,
 * quick reference, and configuration/sync.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerBrandResource } from "./shared/brand-resource.js";
import { registerCapabilitiesResource } from "./shared/capabilities-resource.js";
import { registerDocsSearch } from "./docs/docs-search.js";
import { CHUNKS } from "./python-sdk/constants.js";
import { searchDocs, loadChunk } from "./python-sdk/tools.js";

const server = new McpServer(
  { name: "lucidlink-python-sdk", version: "2.3.1" },
  {
    instructions: `LucidLink Python SDK documentation server.

Provides searchable access to the full Python SDK reference:
- Daemon lifecycle and authentication (ServiceAccountCredentials, StorageConfig)
- Workspace and Filespace file/directory operations
- Streaming I/O (LucidFileStream, buffered/text wrappers)
- Connect (external S3 files via ConnectManager)
- fsspec integration (Pandas, Dask, PyArrow via lucidlink:// URLs)
- Models and exception hierarchy
- Code examples (PyTorch, NumPy, LangChain, Hugging Face)
- Performance constraints and optimization

USE lucidlink_sdk_search to find relevant documentation by keyword.
READ individual resources via lucidlink-sdk://docs/{topic} for full content.`,
  },
);

// Register shared resources
registerBrandResource(server);
registerCapabilitiesResource(server);
registerDocsSearch(server);

// Register SDK doc resources — one per documentation chunk
for (const chunk of CHUNKS) {
  server.resource(
    chunk.id,
    `lucidlink-sdk://docs/${chunk.id}`,
    { description: chunk.description, mimeType: "text/markdown" },
    async () => {
      const content = await loadChunk(chunk.filename);
      return {
        contents: [
          {
            uri: `lucidlink-sdk://docs/${chunk.id}`,
            text: content,
            mimeType: "text/markdown",
          },
        ],
      };
    },
  );
}

// Register SDK search tool. By default returns focused snippets (the
// section enclosing the first match, plus a context window). Pass full=true
// to get the entire chunk, or read lucidlink-sdk://docs/{id} as a resource.
server.tool(
  "lucidlink_sdk_search",
  "Search LucidLink Python SDK documentation. Returns the matched section from each top-ranked chunk (use full=true for the entire chunk).",
  {
    query: z
      .string()
      .describe(
        "Search query — class names, method names, concepts (e.g., 'filespace open', 'connect S3', 'fsspec pandas')",
      ),
    max_results: z
      .number()
      .min(1)
      .max(12)
      .default(3)
      .describe("Maximum chunks to return (1-12, default 3)"),
    full: z
      .boolean()
      .optional()
      .describe("Return the full chunk text instead of a focused snippet (default false)"),
  },
  async ({ query, max_results, full }) => {
    const results = searchDocs(query, max_results ?? 3, full ?? false);
    return {
      content: results.map((r) => ({
        type: "text" as const,
        text: r,
      })),
    };
  },
);

// ── Main ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
