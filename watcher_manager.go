package main

import (
	"sync"
)

// WatcherManager owns multiple AuditWatchers, one per filespace mount.
type WatcherManager struct {
	db       *AuditDB
	watchers map[string]*AuditWatcher // mount path -> watcher
	mu       sync.Mutex
	running  bool
}

// NewWatcherManager creates a manager backed by the given AuditDB.
func NewWatcherManager(db *AuditDB) *WatcherManager {
	return &WatcherManager{
		db:       db,
		watchers: make(map[string]*AuditWatcher),
	}
}

// StartMounts starts a watcher for each of the given mounts.
// Discovery is done once by the caller (main.go), not repeated.
func (m *WatcherManager) StartMounts(mounts []FilespaceMount) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.running = true
	for _, mount := range mounts {
		if _, exists := m.watchers[mount.MountPoint]; !exists {
			w := NewAuditWatcher(m.db, mount.MountPoint)
			w.Start()
			m.watchers[mount.MountPoint] = w
		}
	}
}

// Stop halts all watchers.
func (m *WatcherManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for path, w := range m.watchers {
		w.Stop()
		delete(m.watchers, path)
	}
	m.running = false
}

// IsRunning returns whether the manager is active.
func (m *WatcherManager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running
}

// Status returns status for all watchers.
func (m *WatcherManager) Status() []map[string]interface{} {
	m.mu.Lock()
	defer m.mu.Unlock()

	var result []map[string]interface{}
	for _, w := range m.watchers {
		result = append(result, w.Status())
	}
	return result
}

// WatchedCount returns the number of active watchers.
func (m *WatcherManager) WatchedCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.watchers)
}
