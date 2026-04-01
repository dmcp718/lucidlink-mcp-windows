# LucidLink MCP Server

Cross-platform MCP servers for managing LucidLink filespaces through Claude Desktop (or any MCP client). Works on macOS, Linux, and Windows.

## Servers

| Server | Tools | Description |
|--------|-------|-------------|
| `lucidlink-api` | 28 | Filespace administration — members, groups, permissions, direct links |
| `lucidlink-connect-api` | 18 | S3 object linking — data stores, external entries, bulk import |
| `lucidlink-filespace-search` | 5 | Full-text search across indexed filespaces (Go backend + SQLite FTS5) |
| `lucidlink-filespace-browser` | 1 | Generate a web-based file browser app |
| `lucidlink-audit-trail` | 15 | File operation analytics — OpenSearch stack, queries, alerts, Slack |
| `lucidlink-python-sdk` | 1 + 9 resources | Searchable Python SDK documentation |

## Prerequisites

- **Node.js 18+**
- **LucidLink API** — running as a Docker container or any accessible HTTP endpoint:
  ```bash
  docker run -d -p 3003:3003 lucidlink/lucidlink-api
  ```
- **Bearer token** — from your LucidLink workspace

## Quick start

### 1. Install

```bash
npm install -g @lucidlink/mcp-server
```

### 2. Configure Claude Desktop

Run the setup tool to generate the config:

```bash
lucidlink-mcp-setup
```

Or auto-merge into your existing Claude Desktop config:

```bash
lucidlink-mcp-setup --merge
```

### 3. Set your credentials

Either export environment variables:

```bash
export LUCIDLINK_API_URL=http://localhost:3003/api/v1
export LUCIDLINK_BEARER_TOKEN=your_token_here
```

Or create `~/.lucidlink/mcp-config.json`:

```json
{
  "apiUrl": "http://localhost:3003/api/v1",
  "bearerToken": "your_token_here"
}
```

### 4. Restart Claude Desktop

The MCP tools will be available immediately.

## Manual Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), or `~/.config/claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "lucidlink-api": {
      "command": "npx",
      "args": ["-y", "@lucidlink/mcp-server", "lucidlink-api"],
      "env": {
        "LUCIDLINK_API_URL": "http://localhost:3003/api/v1",
        "LUCIDLINK_BEARER_TOKEN": "your_token_here"
      }
    }
  }
}
```

Repeat for each server you want (`lucidlink-connect`, `lucidlink-search`, `lucidlink-browser`, `lucidlink-audit-trail`, `lucidlink-python-sdk`).

## Configuration

| Setting | Env var | Config key | Default |
|---------|---------|------------|---------|
| API URL | `LUCIDLINK_API_URL` | `apiUrl` | `http://localhost:3003/api/v1` |
| Bearer token | `LUCIDLINK_BEARER_TOKEN` | `bearerToken` | — |
| fs-index-server port | `FS_INDEX_PORT` | `fsIndexPort` | `3201` |
| fs-index-server binary | `FS_INDEX_BINARY` | `fsIndexBinary` | auto-discover |

Environment variables take precedence over the config file.

## fs-index-server (optional)

The filespace search server requires the `fs-index-server` Go binary for file indexing. Build from source:

```bash
cd fs-index-server
go build -o fs-index-server .
```

Or place the binary on your PATH. The search server will return a helpful error if the binary is not found.

## Development

```bash
git clone git@bitbucket.org:lucidlink/lucidlink-mcp-server.git
cd lucidlink-mcp-server
npm install
npm run build

# Run individual servers
npm run lucid-api
npm run connect
npm run search
npm run browser
npm run audit-trail
npm run python-sdk
```

## Architecture

```
Claude Desktop ──► MCP servers ───┬─ lucidlink-api ──────────┐
                                  ├─ lucidlink-connect-api ──┤──► LucidLink API (Docker)
                                  ├─ lucidlink-filespace-search ──► fs-index-server (Go)
                                  ├─ lucidlink-filespace-browser
                                  ├─ lucidlink-audit-trail ──► OpenSearch (Docker)
                                  └─ lucidlink-python-sdk
```

The `lucidlink-api` and `lucidlink-connect-api` servers connect to a LucidLink API instance. All other servers are self-contained.

## Related

- [LucidLink MCP macOS App](https://bitbucket.org/lucidlink/mcp-server-mac-v2) — macOS menu bar app that bundles the MCP servers and API
