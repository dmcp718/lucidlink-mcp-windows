# LucidLink MCP for Windows

Windows system tray app that bundles LucidLink MCP servers for Claude Desktop, Kiro IDE, and VS Code. Includes a built-in audit trail dashboard powered by SQLite and WebView2 — no Docker required.

## Features

- Bundles all 6 LucidLink MCP servers for IDE integration
- Auto-configures Claude Desktop, Kiro IDE, and VS Code on first launch
- **Audit Trail Dashboard**: SQLite-backed event ingestion from `.lucid_audit` logs with interactive WebView2 visualization
- Auto-discovers mounted filespaces via `lucid` CLI (falls back to drive scanning)
- Supports multiple filespaces simultaneously with per-filespace filtering
- System tray with flask icon (half-full = healthy, empty = idle)

## Bundled MCP Servers

| Server | Description |
|--------|-------------|
| lucidlink-api | Filespace administration — 28 tools + API docs search |
| lucidlink-connect-api | S3 object linking — data stores, external entries, bulk import |
| lucidlink-filespace-search | Full-text search via fs-index-server (Go + SQLite FTS5) |
| lucidlink-filespace-browser | Web-based file browser generator |
| lucidlink-audit-trail | File operation analytics with OpenSearch (15 tools) |
| lucidlink-python-sdk | Python SDK documentation search |

## Installation

### Installer (recommended)

Download `LucidLinkMCP-Setup.exe` from [Releases](https://github.com/dmcp718/lucidlink-mcp-windows/releases).

- No admin rights required — installs to `%LOCALAPPDATA%\Programs\LucidLinkMCP`
- Creates Start Menu shortcuts and auto-start on login
- Shows in Add/Remove Programs
- LZMA compression: ~107 MB compresses to ~27 MB installer

### Portable ZIP

Download `LucidLinkMCP-Portable.zip` from [Releases](https://github.com/dmcp718/lucidlink-mcp-windows/releases). Extract anywhere and run `LucidLinkMCP.exe`.

## Building from Source

### Prerequisites

- **Windows** 10/11 (x64)
- **Go** 1.22+
- **Node.js** (build-time only, for `npm install` + `npm run build`)
- **NSIS 3.x** (optional, only for creating the installer)

### Build

```powershell
# Clone
git clone https://github.com/dmcp718/lucidlink-mcp-windows.git
cd lucidlink-mcp-windows

# Full build
powershell -ExecutionPolicy Bypass -File scripts/build.ps1

# Create installer (requires NSIS)
makensis installer/installer.nsi
```

### Quick iteration

```powershell
# Recompile Go tray app only (~2s)
go build -ldflags "-H windowsgui" -o build/LucidLinkMCP/LucidLinkMCP.exe .
```

## Usage

### First Launch

On first launch, the app automatically configures Claude Desktop with all MCP server entries and shows a notification to restart Claude Desktop.

### Audit Trail Dashboard

1. Mount your LucidLink filespace (audit logs appear in `.lucid_audit`)
2. Click **"Start Audit Watcher..."** from the tray menu
3. The app auto-discovers your filespace mounts and begins ingesting events
4. Click **"Open Audit Dashboard"** to view the interactive dashboard
5. Dashboard auto-refreshes every 5 minutes; click Search to refresh manually

Events are stored locally at `%APPDATA%\LucidLinkMCP\audit-trail.db`.

### System Tray

| Icon | Meaning |
|------|---------|
| Flask (half-full purple) | LucidLink MCP is running |
| Flask (empty outline) | No active connections |

### Menu Items

| Item | Description |
|------|-------------|
| Configure Claude Desktop | Writes MCP server entries into Claude Desktop config |
| Configure Kiro IDE | Writes MCP server entries into Kiro IDE config |
| Configure VS Code | Writes MCP server entries into VS Code config |
| Open Audit Dashboard | Opens the SQLite + WebView2 audit trail dashboard |
| Start Audit Watcher | Discovers filespace mounts and begins ingesting events |
| Stop Audit Watcher | Stops the file watcher |

### IDE Config Paths

| IDE | Config File | Key |
|-----|-------------|-----|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| Kiro IDE | `%USERPROFILE%\.kiro\settings\mcp.json` | `mcpServers` |
| VS Code | `%APPDATA%\Code\User\mcp.json` | `servers` |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Claude doesn't see MCP servers | Click "Configure Claude Desktop" from the tray menu and restart Claude Desktop |
| No filespaces found | Ensure your filespace is mounted. The watcher looks for `.lucid_audit` directories. |
| No events appearing | Events are polled every 10 seconds. Verify `.lucid_audit` exists and contains log files. |
| Dashboard blank | Start the audit watcher first, then open the dashboard. |
| WebView2 not opening | Requires Edge WebView2 Runtime (pre-installed on Windows 11). Falls back to default browser. |

## Project Structure

```
lucidlink-mcp-windows/
├── main.go                # System tray app entry point
├── audit.go               # SQLite audit engine + filespace discovery
├── dashboard.go           # HTTP API server for dashboard
├── dashboard_html.go      # Embedded HTML/JS dashboard (Chart.js)
├── webview.go             # WebView2 window launcher
├── config.go              # IDE config merging
├── watcher_manager.go     # Multi-filespace watcher manager
├── icon.go                # Programmatic flask ICO generation
├── paths.go               # Windows path resolution
├── help.go                # Help/About dialogs + toast notifications
├── go.mod / go.sum
├── mcp-server/            # MCP server source (TypeScript)
├── scripts/
│   ├── build.ps1          # Full build script (PowerShell)
│   └── download-node.ps1  # Node.js v22.18.0 downloader
├── installer/
│   └── installer.nsi      # NSIS installer script
└── .github/workflows/     # CI/CD (build + signing)
```

## License

MIT
