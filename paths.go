package main

import (
	"os"
	"path/filepath"
)

// exeDir returns the directory containing the running executable.
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

// bundlePaths holds resolved paths to bundled resources relative to the exe directory.
type bundlePaths struct {
	Root         string // directory containing LucidLinkMCP.exe
	NodeExe      string // bundled node.exe
	MCPDir       string // mcp/ directory (compiled MCP server JS)
	ManifestJSON string // mcp-servers.json
}

func newBundlePaths() bundlePaths {
	root := exeDir()
	return bundlePaths{
		Root:         root,
		NodeExe:      filepath.Join(root, "node.exe"),
		MCPDir:       filepath.Join(root, "mcp"),
		ManifestJSON: filepath.Join(root, "mcp-servers.json"),
	}
}

// IDE config file paths on Windows.

func claudeDesktopConfigPath() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	return filepath.Join(appData, "Claude", "claude_desktop_config.json")
}

func kiroConfigPath() string {
	home := os.Getenv("USERPROFILE")
	return filepath.Join(home, ".kiro", "settings", "mcp.json")
}

func vscodeConfigPath() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	return filepath.Join(appData, "Code", "User", "mcp.json")
}

// configuredFlagPath returns the path to the first-launch marker file.
func configuredFlagPath() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	return filepath.Join(appData, "LucidLinkMCP", "configured.flag")
}

// auditDBPath returns the path to the local SQLite audit trail database.
func auditDBPath() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	return filepath.Join(appData, "LucidLinkMCP", "audit-trail.db")
}
