package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// manifestEntry represents one entry in mcp-servers.json.
type manifestEntry struct {
	Name   string `json:"name"`
	Script string `json:"script"`
}

// readManifest reads the mcp-servers.json manifest file.
func readManifest(manifestPath string) ([]manifestEntry, error) {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("cannot read mcp-servers.json: %w", err)
	}
	var entries []manifestEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("invalid mcp-servers.json: %w", err)
	}
	return entries, nil
}

// mergeIDEConfig reads the manifest, builds server entries, and merges them
// into the target IDE config file.
//
//   - configPath: full path to the IDE's JSON config file
//   - topKey: the top-level key for MCP servers ("mcpServers" or "servers")
//   - addTypeStdio: if true, adds "type":"stdio" to each entry (VS Code requires this)
func mergeIDEConfig(paths bundlePaths, configPath, topKey string, addTypeStdio bool) error {
	entries, err := readManifest(paths.ManifestJSON)
	if err != nil {
		return err
	}

	// Build new server entries.
	servers := make(map[string]interface{})
	for _, entry := range entries {
		scriptPath := filepath.Join(paths.MCPDir, entry.Script)
		serverEntry := map[string]interface{}{
			"command": paths.NodeExe,
			"args":    []string{scriptPath},
		}
		if addTypeStdio {
			serverEntry["type"] = "stdio"
		}
		servers[entry.Name] = serverEntry
	}

	// Ensure config directory exists.
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("cannot create config directory: %w", err)
	}

	// Read existing config (or start empty).
	var config map[string]interface{}
	if data, err := os.ReadFile(configPath); err == nil {
		json.Unmarshal(data, &config)
	}
	if config == nil {
		config = make(map[string]interface{})
	}

	// Merge: preserve existing servers, overwrite LucidLink entries.
	existing, _ := config[topKey].(map[string]interface{})
	if existing == nil {
		existing = make(map[string]interface{})
	}

	// Garbage-collect stale lucidlink-* entries from previous app versions
	// (e.g. lucidlink-connect-api, lucidlink-filespace-search, -browser before
	// the v2.5.0 consolidation). These point at script files this build no
	// longer ships, so the IDE spawns them and reports "Server disconnected."
	// Non-LucidLink servers the user added themselves are untouched.
	for key := range existing {
		if !strings.HasPrefix(key, "lucidlink-") {
			continue
		}
		if _, stillValid := servers[key]; !stillValid {
			delete(existing, key)
		}
	}

	for name, entry := range servers {
		existing[name] = entry
	}
	config[topKey] = existing

	// Write back with pretty printing.
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// configureClaudeDesktop merges MCP server entries into Claude Desktop's config.
func configureClaudeDesktop(paths bundlePaths) error {
	return mergeIDEConfig(paths, claudeDesktopConfigPath(), "mcpServers", false)
}

// configureKiro merges MCP server entries into Kiro IDE's config.
func configureKiro(paths bundlePaths) error {
	return mergeIDEConfig(paths, kiroConfigPath(), "mcpServers", false)
}

// configureVSCode merges MCP server entries into VS Code's config.
func configureVSCode(paths bundlePaths) error {
	return mergeIDEConfig(paths, vscodeConfigPath(), "servers", true)
}

// autoConfigureIfNeeded runs first-launch auto-configuration.
func autoConfigureIfNeeded(paths bundlePaths) {
	flagPath := configuredFlagPath()

	if _, err := os.Stat(flagPath); err == nil {
		return // already configured
	}

	if err := configureClaudeDesktop(paths); err != nil {
		return // silently skip on error
	}

	// Create marker file.
	os.MkdirAll(filepath.Dir(flagPath), 0755)
	os.WriteFile(flagPath, []byte("configured"), 0644)

	// Show a toast notification (best-effort).
	showNotification("Claude Desktop Configured", "Restart Claude Desktop to activate LucidLink MCP servers.")
}
