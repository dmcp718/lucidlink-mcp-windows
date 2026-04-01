package main

import (
	"fmt"
	"log"
	"os"

	"github.com/energye/systray"
)

var (
	paths        bundlePaths
	healthyICO   []byte
	unhealthyICO []byte

	// Audit trail globals — initialized on first use.
	auditDB   *AuditDB
	manager   *WatcherManager
	dashboard *Dashboard
)

func main() {
	paths = newBundlePaths()

	// Pre-generate tray icons.
	healthyICO = generateIcon(true)
	unhealthyICO = generateIcon(false)

	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetIcon(healthyICO)
	systray.SetTooltip("LucidLink MCP")

	mConfigClaude := systray.AddMenuItem("Configure Claude Desktop", "Write MCP server entries to Claude Desktop config")
	mConfigKiro := systray.AddMenuItem("Configure Kiro IDE", "Write MCP server entries to Kiro IDE config")
	mConfigVSCode := systray.AddMenuItem("Configure VS Code", "Write MCP server entries to VS Code config")

	systray.AddSeparator()

	// --- Audit Trail section ---
	mAuditDash := systray.AddMenuItem("Open Audit Dashboard", "Open the audit trail dashboard")
	mAuditStart := systray.AddMenuItem("Start Audit Watcher...", "Start watching filespaces for audit events")
	mAuditStop := systray.AddMenuItem("Stop Audit Watcher", "Stop watching for audit events")
	mAuditStop.Disable()

	systray.AddSeparator()

	mAbout := systray.AddMenuItem("About LucidLink MCP", "Show version info")
	mHelp := systray.AddMenuItem("Help", "Open help page in browser")

	systray.AddSeparator()

	mQuit := systray.AddMenuItem("Quit", "Quit LucidLink MCP")

	// --- IDE config handlers ---
	mConfigClaude.Click(func() {
		if err := configureClaudeDesktop(paths); err != nil {
			showErrorBox("Error", err.Error())
		} else {
			showMessageBox("Configuration Updated",
				"Claude Desktop config updated.\nRestart Claude Desktop to apply.")
		}
	})

	mConfigKiro.Click(func() {
		if err := configureKiro(paths); err != nil {
			showErrorBox("Error", err.Error())
		} else {
			showMessageBox("Configuration Updated",
				"Kiro IDE config updated.\nFile: %USERPROFILE%\\.kiro\\settings\\mcp.json\n\nRestart Kiro to apply.")
		}
	})

	mConfigVSCode.Click(func() {
		if err := configureVSCode(paths); err != nil {
			showErrorBox("Error", err.Error())
		} else {
			showMessageBox("Configuration Updated",
				"VS Code MCP config updated.\nFile: %APPDATA%\\Code\\User\\mcp.json\n\nRestart VS Code to apply.")
		}
	})

	// --- Audit Trail handlers ---
	mAuditDash.Click(func() {
		if err := ensureAuditDB(); err != nil {
			showErrorBox("Audit Trail Error", err.Error())
			return
		}
		if dashboard == nil {
			if manager == nil {
				manager = NewWatcherManager(auditDB)
			}
			dashboard = NewDashboard(auditDB, manager)
		}
		if _, err := dashboard.Start(); err != nil {
			showErrorBox("Dashboard Error", err.Error())
			return
		}
		dashboard.OpenWindow()
	})

	mAuditStart.Click(func() {
		if err := ensureAuditDB(); err != nil {
			showErrorBox("Audit Trail Error", err.Error())
			return
		}

		// Disable immediately to prevent double-clicks during discovery.
		mAuditStart.SetTitle("Discovering filespaces...")
		mAuditStart.Disable()

		// Run discovery in background to avoid blocking the UI thread.
		go func() {
			mounts := DiscoverMounts()
			if len(mounts) == 0 {
				mAuditStart.SetTitle("Start Audit Watcher...")
				mAuditStart.Enable()
				showErrorBox("No Filespaces Found",
					"No LucidLink filespace mount points were found.\n\n"+
						"Make sure a filespace is mounted with audit logging enabled\n"+
						"(.lucid_audit directory must be present).")
				return
			}

			// Stop existing manager if running.
			if manager != nil && manager.IsRunning() {
				manager.Stop()
			}

			manager = NewWatcherManager(auditDB)
			manager.StartMounts(mounts)

			// Update dashboard reference.
			if dashboard != nil {
				dashboard.manager = manager
			}

			// Build notification message listing all discovered filespaces.
			msg := fmt.Sprintf("Watching %d filespace(s):\n", len(mounts))
			for _, m := range mounts {
				name := m.Filespace
				if name == "" {
					name = m.MountPoint
				}
				msg += fmt.Sprintf("  %s (%s)\n", name, m.MountPoint)
			}

			mAuditStart.SetTitle(fmt.Sprintf("Watching %d filespace(s)", len(mounts)))
			mAuditStop.Enable()

			showNotification("Audit Trail Started", msg)
		}()
	})

	mAuditStop.Click(func() {
		if manager != nil && manager.IsRunning() {
			manager.Stop()
		}
		mAuditStart.SetTitle("Start Audit Watcher...")
		mAuditStart.Enable()
		mAuditStop.Disable()
		showNotification("Audit Trail Stopped", "Stopped watching for audit events.")
	})

	mAbout.Click(func() {
		showAbout()
	})

	mHelp.Click(func() {
		showHelp()
	})

	mQuit.Click(func() {
		if manager != nil && manager.IsRunning() {
			manager.Stop()
		}
		if dashboard != nil {
			dashboard.Stop()
		}
		if auditDB != nil {
			auditDB.Close()
		}
		systray.Quit()
		os.Exit(0)
	})

	// Auto-configure on first launch (async to avoid blocking UI thread).
	go autoConfigureIfNeeded(paths)
}

func onExit() {
	if manager != nil && manager.IsRunning() {
		manager.Stop()
	}
	if dashboard != nil {
		dashboard.Stop()
	}
	if auditDB != nil {
		auditDB.Close()
	}
}

// ensureAuditDB lazily initializes the SQLite database.
func ensureAuditDB() error {
	if auditDB != nil {
		return nil
	}
	db, err := OpenAuditDB(auditDBPath())
	if err != nil {
		log.Printf("audit db error: %v", err)
		return fmt.Errorf("Failed to open audit database:\n%v", err)
	}
	auditDB = db
	return nil
}
