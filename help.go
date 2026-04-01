package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows"
)

const appVersion = "2.3.0"

// showAbout displays a Windows MessageBox with version info.
func showAbout() {
	title, _ := syscall.UTF16PtrFromString("LucidLink MCP")
	msg, _ := syscall.UTF16PtrFromString(fmt.Sprintf(
		"Version %s\nLucidLink MCP servers for Claude Desktop.\n\n"+
			"Provides audit trail analytics, filespace search,\n"+
			"file browsing, and administration tools.",
		appVersion,
	))
	windows.MessageBox(0, msg, title, windows.MB_OK|windows.MB_ICONINFORMATION)
}

// showHelp writes the help HTML to a temp file and opens it in the default browser.
func showHelp() {
	tmpDir := os.TempDir()
	htmlPath := filepath.Join(tmpDir, "lucidlink-mcp-help.html")

	html := generateHelpHTML()
	if err := os.WriteFile(htmlPath, []byte(html), 0644); err != nil {
		showMessageBox("Error", "Failed to write help file: "+err.Error())
		return
	}

	cmd := exec.Command("cmd", "/c", "start", "", htmlPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	cmd.Run()
}

// showMessageBox displays a simple Windows MessageBox.
func showMessageBox(title, message string) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(message)
	windows.MessageBox(0, m, t, windows.MB_OK|windows.MB_ICONINFORMATION)
}

// showErrorBox displays an error MessageBox.
func showErrorBox(title, message string) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(message)
	windows.MessageBox(0, m, t, windows.MB_OK|windows.MB_ICONERROR)
}

// showNotification attempts to show a Windows toast notification.
// Falls back silently if not available.
func showNotification(title, body string) {
	// Use PowerShell to show a toast notification (Windows 10+).
	script := fmt.Sprintf(`
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>%s</text>
      <text>%s</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("LucidLink MCP").Show($toast)
`, title, body)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	go cmd.Run() // best-effort, non-blocking
}

func generateHelpHTML() string {
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LucidLink MCP Help</title>
<style>
    :root { color-scheme: light dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: "Segoe UI", -apple-system, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text);
        padding: 28px 32px 40px;
        max-width: 700px;
        margin: 0 auto;
        --text: #1d1d1f;
        --dim: #86868b;
        --accent: #0071e3;
        --border: #d2d2d7;
        --card-bg: rgba(0,0,0,0.03);
        --code-bg: rgba(0,0,0,0.05);
    }
    @media (prefers-color-scheme: dark) {
        body {
            --text: #f5f5f7;
            --dim: #86868b;
            --accent: #2997ff;
            --border: #424245;
            --card-bg: rgba(255,255,255,0.05);
            --code-bg: rgba(255,255,255,0.08);
        }
    }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 16px; }
    h2 {
        font-size: 16px;
        font-weight: 600;
        margin: 24px 0 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border);
    }
    h2:first-of-type { margin-top: 0; }
    p { margin: 6px 0; }
    .dim { color: var(--dim); font-size: 13px; }
    .card {
        background: var(--card-bg);
        border-radius: 8px;
        padding: 12px 16px;
        margin: 10px 0;
    }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { padding: 4px 0; vertical-align: top; }
    td:first-child { white-space: nowrap; padding-right: 16px; font-weight: 500; }
    td:last-child { color: var(--dim); }
    ol { margin: 6px 0 6px 20px; }
    ol li { margin: 2px 0; }
    code {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 12.5px;
        background: var(--code-bg);
        padding: 1px 5px;
        border-radius: 4px;
    }
    .prompt {
        display: block;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 7px 12px;
        margin: 5px 0;
        font-size: 13px;
    }
    .prompt-group { margin: 14px 0 6px; }
    .prompt-group strong {
        display: block;
        font-size: 12px;
        color: var(--dim);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
    }
</style>
</head>
<body>

<h1>LucidLink MCP Help</h1>

<h2>Getting Started</h2>
<p>LucidLink MCP provides MCP servers for Claude Desktop, with a focus on <strong>Audit Trail Analytics</strong>:</p>
<div class="card">
    <table>
        <tr><td>Audit Trail</td><td>File operation analytics &mdash; deploy OpenSearch stack, query events, set up alerts and Slack notifications (15 tools)</td></tr>
        <tr><td>Admin API</td><td>Manage filespaces, members, groups, and permissions (30 tools + API docs search)</td></tr>
        <tr><td>Connect API</td><td>Manage data stores, entries, and S3 workflows via LucidLink Connect</td></tr>
        <tr><td>Filespace Search</td><td>Full-text search across indexed filespaces with a generated web UI</td></tr>
        <tr><td>Filespace Browser</td><td>Generate a web-based filespace browser for navigating mounted filespaces</td></tr>
        <tr><td>Python SDK</td><td>Searchable documentation for the LucidLink Python SDK</td></tr>
    </table>
</div>

<h2>First Launch</h2>
<p>On first launch, the app automatically:</p>
<ol>
    <li>Configures Claude Desktop with all MCP server entries</li>
    <li>Shows a notification to restart Claude Desktop</li>
</ol>
<p class="dim">After restarting Claude Desktop, the MCP tools will be available.</p>

<h2>Audit Trail Dashboard (Local)</h2>
<p>The built-in audit trail dashboard uses <strong>SQLite</strong> &mdash; no Docker required. Events are ingested directly from <code>.lucid_audit</code> log files into a local database and visualized in an embedded WebView2 dashboard.</p>
<div class="card">
    <table>
        <tr><td>Start Watcher</td><td>Click <em>"Start Audit Watcher..."</em> in the tray menu &mdash; auto-discovers mounted filespaces</td></tr>
        <tr><td>Open Dashboard</td><td>Click <em>"Open Audit Dashboard"</em> &mdash; opens an interactive dashboard with event timeline, action breakdown, and searchable event log</td></tr>
        <tr><td>Filters</td><td>Filter by user, action type, file path, and time range (1H / 24H / 7D / 30D)</td></tr>
        <tr><td>Data</td><td>Stored locally at <code>%APPDATA%\LucidLinkMCP\audit-trail.db</code></td></tr>
        <tr><td>Requires</td><td>A mounted LucidLink filespace with <code>.lucid_audit</code> logging enabled. No Docker needed.</td></tr>
    </table>
</div>

<h2>Audit Trail Setup</h2>
<ol>
    <li>Mount your LucidLink filespace (audit logs appear in <code>.lucid_audit</code>)</li>
    <li>Click <em>"Start Audit Watcher..."</em> from the tray menu</li>
    <li>The app auto-discovers your filespace mount and begins ingesting events</li>
    <li>Click <em>"Open Audit Dashboard"</em> to view the interactive dashboard</li>
    <li>Dashboard auto-refreshes every 5 minutes (click Search to refresh manually)</li>
</ol>
<p class="dim">Tip: The MCP audit trail tools via Claude still work for advanced queries. The local dashboard provides a quick visual overview without Docker.</p>

<h2>Audit Trail via MCP (Advanced)</h2>
<p>For advanced analytics with OpenSearch, the MCP audit trail server can deploy a Docker Compose stack. Ask Claude to set it up.</p>

<h2>System Tray</h2>
<div class="card">
    <table>
        <tr><td>&#9878; Flask (half-full)</td><td>LucidLink MCP is running</td></tr>
        <tr><td>&#9878; Flask (empty)</td><td>LucidLink MCP &mdash; no active connections</td></tr>
    </table>
</div>

<h2>Menu Items</h2>
<div class="card">
    <table>
        <tr><td>Configure Claude Desktop</td><td>Writes MCP server entries into Claude Desktop config</td></tr>
        <tr><td>Configure Kiro IDE</td><td>Writes MCP server entries into Kiro IDE config</td></tr>
        <tr><td>Configure VS Code</td><td>Writes MCP server entries into VS Code config</td></tr>
        <tr><td>Open Audit Dashboard</td><td>Opens the local audit trail dashboard (SQLite + WebView2)</td></tr>
        <tr><td>Start Audit Watcher</td><td>Discovers filespace mounts and begins ingesting audit events</td></tr>
        <tr><td>Stop Audit Watcher</td><td>Stops the file watcher</td></tr>
    </table>
</div>

<h2>Example Prompts</h2>

<div class="prompt-group">
    <strong>Audit Trail (Primary)</strong>
    <span class="prompt">"Discover filespace mounts"</span>
    <span class="prompt">"Set up audit trail dashboard for my filespace"</span>
    <span class="prompt">"Start audit trail"</span>
    <span class="prompt">"Audit trail status"</span>
    <span class="prompt">"Show me all file deletions in the last 24 hours"</span>
    <span class="prompt">"What did alice.smith do this week?"</span>
    <span class="prompt">"Who has been accessing files in /Confidential?"</span>
    <span class="prompt">"Alert me on Slack when someone deletes files in /Production"</span>
    <span class="prompt">"Count events by user for the last 7 days"</span>
    <span class="prompt">"Get file history for /Projects/design/logo.psd"</span>
</div>

<div class="prompt-group">
    <strong>Other Servers</strong>
    <span class="prompt">"List all my filespaces" (Admin API)</span>
    <span class="prompt">"Set up an S3 data store for my-bucket" (Connect API)</span>
    <span class="prompt">"Search for quarterly report across all filespaces" (Search)</span>
    <span class="prompt">"Create a file browser for my mounted filespaces" (Browser)</span>
    <span class="prompt">"How do I use fsspec with Pandas?" (Python SDK)</span>
</div>

<h2>Troubleshooting</h2>
<div class="card">
    <table>
        <tr><td>Claude doesn't see MCP servers</td><td>Click "Configure Claude Desktop" from the tray menu and restart Claude Desktop</td></tr>
        <tr><td>No filespaces found</td><td>Ensure your LucidLink filespace is mounted. The watcher looks for <code>.lucid_audit</code> directories on all drives.</td></tr>
        <tr><td>No events appearing</td><td>Events are polled every 10 seconds. Verify <code>.lucid_audit</code> directory exists and contains log files.</td></tr>
        <tr><td>Dashboard blank</td><td>Start the audit watcher first, then open the dashboard. Data will appear after the first scan cycle.</td></tr>
        <tr><td>WebView2 not opening</td><td>Requires Microsoft Edge WebView2 Runtime (pre-installed on Windows 11, available for Windows 10). Falls back to your default browser.</td></tr>
    </table>
</div>

</body>
</html>`
}
