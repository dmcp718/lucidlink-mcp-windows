package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "modernc.org/sqlite"
)

// AuditEvent mirrors the structure produced by LucidLink .lucid_audit log files.
// Real format uses "timestamp" as unix microseconds (int64), not ISO 8601.
type AuditEvent struct {
	TimestampRaw json.Number `json:"timestamp"` // unix microseconds
	User         struct {
		Name string `json:"name"`
		ID   string `json:"id"`
	} `json:"user"`
	Device struct {
		HostName  string `json:"hostName"`
		OSName    string `json:"osName"`
		OSVersion string `json:"osVersion"`
	} `json:"device"`
	Event struct {
		Filespace     string `json:"filespace"`
		NodeID        string `json:"nodeId"`
		FilespaceUUID string `json:"filespaceUuid"`
	} `json:"event"`
	Operation struct {
		Action    string `json:"action"`
		EntryPath string `json:"entryPath"`
		FileID    string `json:"fileId"`
		Target    string `json:"targetPath"`
	} `json:"operation"`
}

// ISOTimestamp converts the unix-microsecond timestamp to ISO 8601 for storage.
func (e *AuditEvent) ISOTimestamp() string {
	us, err := e.TimestampRaw.Int64()
	if err != nil {
		return e.TimestampRaw.String()
	}
	return time.Unix(us/1_000_000, (us%1_000_000)*1000).UTC().Format(time.RFC3339)
}

// FileName extracts the filename from EntryPath since real logs use fileId not file.
func (e *AuditEvent) FileName() string {
	p := e.Operation.EntryPath
	if idx := strings.LastIndex(p, "/"); idx >= 0 {
		return p[idx+1:]
	}
	return p
}

// AuditDB manages the SQLite database for audit trail events.
// Concurrency is handled by SQLite WAL mode + busy_timeout; no application mutex needed.
type AuditDB struct {
	db *sql.DB
}

// OpenAuditDB opens (or creates) the SQLite database at the given path.
func OpenAuditDB(dbPath string) (*AuditDB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := initSchema(db); err != nil {
		db.Close()
		return nil, err
	}

	// Limit open connections to 1 writer + readers via SQLite's own locking.
	db.SetMaxOpenConns(4)
	return &AuditDB{db: db}, nil
}

func initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS audit_events (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp   TEXT    NOT NULL,
		user_name   TEXT,
		user_id     TEXT,
		device_host TEXT,
		device_os   TEXT,
		filespace   TEXT,
		action      TEXT    NOT NULL,
		entry_path  TEXT    NOT NULL,
		file_name   TEXT,
		target_path TEXT,
		ingested_at TEXT    NOT NULL DEFAULT (datetime('now'))
	);

	CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON audit_events(timestamp);
	CREATE INDEX IF NOT EXISTS idx_events_user_name  ON audit_events(user_name);
	CREATE INDEX IF NOT EXISTS idx_events_action     ON audit_events(action);
	CREATE INDEX IF NOT EXISTS idx_events_entry_path ON audit_events(entry_path);
	CREATE INDEX IF NOT EXISTS idx_events_filespace  ON audit_events(filespace);

	-- Track ingested file positions so we don't re-read on restart.
	CREATE TABLE IF NOT EXISTS file_offsets (
		file_path TEXT PRIMARY KEY,
		offset    INTEGER NOT NULL DEFAULT 0,
		updated   TEXT    NOT NULL DEFAULT (datetime('now'))
	);
	`
	_, err := db.Exec(schema)
	return err
}

// InsertEvents inserts a batch of audit events in a single transaction.
func (a *AuditDB) InsertEvents(events []AuditEvent) (int, error) {
	tx, err := a.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO audit_events
		(timestamp, user_name, user_id, device_host, device_os, filespace,
		 action, entry_path, file_name, target_path)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	count := 0
	for _, e := range events {
		_, err := stmt.Exec(
			e.ISOTimestamp(), e.User.Name, e.User.ID,
			e.Device.HostName, e.Device.OSName,
			e.Event.Filespace, e.Operation.Action,
			e.Operation.EntryPath, e.FileName(),
			e.Operation.Target,
		)
		if err != nil {
			continue // skip malformed rows
		}
		count++
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}

// GetFileOffset returns the last-read byte offset for a log file.
func (a *AuditDB) GetFileOffset(path string) int64 {
	var offset int64
	a.db.QueryRow("SELECT offset FROM file_offsets WHERE file_path = ?", path).Scan(&offset)
	return offset
}

// SetFileOffset records the byte offset we've read up to for a log file.
func (a *AuditDB) SetFileOffset(path string, offset int64) {
	a.db.Exec(`INSERT INTO file_offsets (file_path, offset, updated) VALUES (?, ?, datetime('now'))
		ON CONFLICT(file_path) DO UPDATE SET offset = excluded.offset, updated = excluded.updated`,
		path, offset)
}

// Close closes the database.
func (a *AuditDB) Close() error {
	return a.db.Close()
}

// --- Query helpers for the dashboard API ---

// EventRow is a single event returned by queries.
type EventRow struct {
	ID        int64  `json:"id"`
	Timestamp string `json:"timestamp"`
	UserName  string `json:"userName"`
	Action    string `json:"action"`
	EntryPath string `json:"entryPath"`
	FileName  string `json:"fileName"`
	Target    string `json:"targetPath,omitempty"`
	Filespace string `json:"filespace"`
	Device    string `json:"device,omitempty"`
}

// SearchParams holds search/filter parameters.
type SearchParams struct {
	User      string `json:"user"`
	Action    string `json:"action"`
	Path      string `json:"path"`
	Filespace string `json:"filespace"`
	Since     string `json:"since"` // ISO 8601 or relative like "24h"
	Until     string `json:"until"`
	Limit     int    `json:"limit"`
	Offset    int    `json:"offset"`
}

// SearchEvents queries events with optional filters.
func (a *AuditDB) SearchEvents(p SearchParams) ([]EventRow, int, error) {
	where, args := buildWhere(p)

	// Get total count.
	var total int
	countSQL := "SELECT COUNT(*) FROM audit_events" + where
	a.db.QueryRow(countSQL, args...).Scan(&total)

	if p.Limit <= 0 || p.Limit > 1000 {
		p.Limit = 100
	}

	querySQL := `SELECT id, timestamp, user_name, action, entry_path, file_name, target_path, filespace, device_host
		FROM audit_events` + where + ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`
	args = append(args, p.Limit, p.Offset)

	rows, err := a.db.Query(querySQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []EventRow
	for rows.Next() {
		var r EventRow
		var target, device sql.NullString
		if err := rows.Scan(&r.ID, &r.Timestamp, &r.UserName, &r.Action,
			&r.EntryPath, &r.FileName, &target, &r.Filespace, &device); err != nil {
			continue
		}
		r.Target = target.String
		r.Device = device.String
		results = append(results, r)
	}
	return results, total, nil
}

// CountByField returns aggregated counts grouped by a field.
func (a *AuditDB) CountByField(field string, p SearchParams) (map[string]int, error) {
	col := fieldToColumn(field)
	if col == "" {
		return nil, fmt.Errorf("invalid field: %s", field)
	}

	where, args := buildWhere(p)
	q := fmt.Sprintf("SELECT %s, COUNT(*) FROM audit_events%s GROUP BY %s ORDER BY COUNT(*) DESC LIMIT 50", col, where, col)

	rows, err := a.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int)
	for rows.Next() {
		var key string
		var count int
		if rows.Scan(&key, &count) == nil {
			result[key] = count
		}
	}
	return result, nil
}

// TimeHistogram returns event counts bucketed by hour.
func (a *AuditDB) TimeHistogram(p SearchParams) ([]map[string]interface{}, error) {
	where, args := buildWhere(p)
	q := `SELECT strftime('%Y-%m-%dT%H:00:00Z', timestamp) as bucket, COUNT(*)
		FROM audit_events` + where + ` GROUP BY bucket ORDER BY bucket`

	rows, err := a.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []map[string]interface{}
	for rows.Next() {
		var bucket string
		var count int
		if rows.Scan(&bucket, &count) == nil {
			result = append(result, map[string]interface{}{"time": bucket, "count": count})
		}
	}
	return result, nil
}

// Stats returns summary statistics, optionally filtered.
// One aggregate query instead of four — SQLite computes all five values
// in a single scan with the same WHERE clause.
func (a *AuditDB) Stats(p SearchParams) map[string]interface{} {
	where, args := buildWhere(p)
	stats := map[string]interface{}{}

	q := `SELECT
		COUNT(*),
		COUNT(DISTINCT user_name),
		COUNT(DISTINCT CASE WHEN filespace != '' THEN filespace END),
		MIN(timestamp),
		MAX(timestamp)
	FROM audit_events` + where

	var total, users, filespaces int
	var oldest, newest sql.NullString
	a.db.QueryRow(q, args...).Scan(&total, &users, &filespaces, &oldest, &newest)

	stats["totalEvents"] = total
	stats["uniqueUsers"] = users
	stats["filespaces"] = filespaces
	stats["oldestEvent"] = oldest.String
	stats["newestEvent"] = newest.String
	return stats
}

// ListFilespaces returns distinct filespace names from the database.
func (a *AuditDB) ListFilespaces() ([]string, error) {
	rows, err := a.db.Query("SELECT DISTINCT filespace FROM audit_events WHERE filespace != '' ORDER BY filespace")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			result = append(result, name)
		}
	}
	return result, nil
}

func buildWhere(p SearchParams) (string, []interface{}) {
	var clauses []string
	var args []interface{}

	if p.User != "" {
		clauses = append(clauses, "user_name LIKE ?")
		args = append(args, "%"+p.User+"%")
	}
	if p.Action != "" {
		clauses = append(clauses, "action = ?")
		args = append(args, p.Action)
	}
	if p.Path != "" {
		clauses = append(clauses, "entry_path LIKE ?")
		args = append(args, "%"+p.Path+"%")
	}
	if p.Filespace != "" {
		clauses = append(clauses, "filespace = ?")
		args = append(args, p.Filespace)
	}
	if p.Since != "" {
		since := resolveTime(p.Since)
		clauses = append(clauses, "timestamp >= ?")
		args = append(args, since)
	}
	if p.Until != "" {
		clauses = append(clauses, "timestamp <= ?")
		args = append(args, p.Until)
	}

	if len(clauses) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func fieldToColumn(field string) string {
	switch field {
	case "user", "userName":
		return "user_name"
	case "action":
		return "action"
	case "filespace":
		return "filespace"
	case "device":
		return "device_host"
	case "file", "fileName":
		return "file_name"
	default:
		return ""
	}
}

// resolveTime converts relative durations (e.g. "24h", "7d") to ISO timestamps.
func resolveTime(s string) string {
	s = strings.TrimSpace(s)
	if len(s) < 2 {
		return s
	}
	unit := s[len(s)-1]
	numStr := s[:len(s)-1]
	var dur time.Duration
	switch unit {
	case 'h':
		var n int
		fmt.Sscanf(numStr, "%d", &n)
		dur = time.Duration(n) * time.Hour
	case 'd':
		var n int
		fmt.Sscanf(numStr, "%d", &n)
		dur = time.Duration(n) * 24 * time.Hour
	case 'w':
		var n int
		fmt.Sscanf(numStr, "%d", &n)
		dur = time.Duration(n) * 7 * 24 * time.Hour
	default:
		return s // assume ISO timestamp
	}
	return time.Now().UTC().Add(-dur).Format(time.RFC3339)
}

// --- Log file watcher ---

// fileFingerprint is the (size, mtime) pair we use to detect file changes
// between polls. Audit logs only grow, so any change to either field means
// new content to ingest.
type fileFingerprint struct {
	size  int64
	mtime time.Time
}

// AuditWatcher watches .lucid_audit directories and ingests new log lines into SQLite.
type AuditWatcher struct {
	db        *AuditDB
	mountPath string
	stopCh    chan struct{}
	wg        sync.WaitGroup
	running   bool
	mu        sync.Mutex

	// Cache of last-seen (size, mtime) per file path. Lets scanAndIngest
	// skip unchanged files entirely without opening or stat'ing the offset DB.
	// Owned by watchLoop goroutine; not concurrent.
	seen map[string]fileFingerprint

	// Stats
	filesProcessed int
	eventsIngested int
	lastError      string
}

// NewAuditWatcher creates a watcher for the given filespace mount point.
func NewAuditWatcher(db *AuditDB, mountPath string) *AuditWatcher {
	return &AuditWatcher{
		db:        db,
		mountPath: mountPath,
		stopCh:    make(chan struct{}),
		seen:      make(map[string]fileFingerprint),
	}
}

// Start begins watching for new audit log files and ingesting events.
func (w *AuditWatcher) Start() {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return
	}
	w.running = true
	w.mu.Unlock()

	w.wg.Add(1)
	go w.watchLoop()
}

// Stop halts the watcher.
func (w *AuditWatcher) Stop() {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return
	}
	w.running = false
	w.mu.Unlock()
	close(w.stopCh)
	w.wg.Wait()
}

// IsRunning returns whether the watcher is active.
func (w *AuditWatcher) IsRunning() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.running
}

// Status returns watcher status for the API.
func (w *AuditWatcher) Status() map[string]interface{} {
	w.mu.Lock()
	defer w.mu.Unlock()
	return map[string]interface{}{
		"running":        w.running,
		"mountPath":      w.mountPath,
		"filesProcessed": w.filesProcessed,
		"eventsIngested": w.eventsIngested,
		"lastError":      w.lastError,
	}
}

func (w *AuditWatcher) watchLoop() {
	defer w.wg.Done()

	// Initial scan, then poll every 10 seconds.
	w.scanAndIngest()

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.scanAndIngest()
		}
	}
}

func (w *AuditWatcher) scanAndIngest() {
	// .lucid_audit log files are at: <mount>/.lucid_audit/<year>/<month>/<day>/*.log*
	auditDir := filepath.Join(w.mountPath, ".lucid_audit")
	if _, err := os.Stat(auditDir); os.IsNotExist(err) {
		w.mu.Lock()
		w.lastError = "no .lucid_audit directory at " + w.mountPath
		w.mu.Unlock()
		return
	}

	// Walk once; only ingest files whose (size, mtime) changed since last poll.
	// Audit logs only grow, so unchanged fingerprint == nothing to do.
	type pending struct {
		path string
		fp   fileFingerprint
	}
	var changed []pending

	filepath.Walk(auditDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		name := info.Name()
		if !strings.HasSuffix(name, ".log") && !strings.Contains(name, ".log.") {
			return nil
		}
		fp := fileFingerprint{size: info.Size(), mtime: info.ModTime()}
		if prev, ok := w.seen[path]; ok && prev == fp {
			return nil // unchanged since last poll
		}
		changed = append(changed, pending{path: path, fp: fp})
		return nil
	})

	for _, p := range changed {
		select {
		case <-w.stopCh:
			return
		default:
		}
		w.ingestFile(p.path)
		w.seen[p.path] = p.fp
	}
}

func (w *AuditWatcher) ingestFile(path string) {
	offset := w.db.GetFileOffset(path)

	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	// Seek to where we left off.
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			return
		}
	}

	buf := make([]byte, 0, 64*1024)
	readBuf := make([]byte, 32*1024)
	events := make([]AuditEvent, 0, 256)
	totalRead := offset

	for {
		n, err := f.Read(readBuf)
		if n > 0 {
			buf = append(buf, readBuf[:n]...)
			totalRead += int64(n)

			// Process complete lines.
			for {
				idx := bytes.IndexByte(buf, '\n')
				if idx < 0 {
					break
				}
				line := bytes.TrimSpace(buf[:idx])
				buf = buf[idx+1:]

				if len(line) == 0 {
					continue
				}

				var event AuditEvent
				if json.Unmarshal(line, &event) == nil && event.Operation.Action != "" {
					events = append(events, event)
				}
			}
		}
		if err != nil {
			break
		}
	}

	if len(events) > 0 {
		count, err := w.db.InsertEvents(events)
		w.mu.Lock()
		w.filesProcessed++
		w.eventsIngested += count
		if err != nil {
			w.lastError = fmt.Sprintf("insert error: %v", err)
		}
		w.mu.Unlock()

		if err != nil {
			log.Printf("audit: ingested %d events from %s (error: %v)", count, filepath.Base(path), err)
		}
	}

	// Always update offset even if no new events (tracks position for empty reads).
	w.db.SetFileOffset(path, totalRead)
}

// FilespaceMount represents a discovered LucidLink filespace instance.
type FilespaceMount struct {
	InstanceID string // e.g. "2008"
	Filespace  string // e.g. "nab.lucid-demo"
	MountPoint string // e.g. "L:"
}

// DiscoverMounts uses the lucid CLI to find all mounted filespace instances
// and their mount points. Falls back to drive letter scanning if the CLI
// is not available.
func DiscoverMounts() []FilespaceMount {
	mounts := discoverViaLucidCLI()
	if len(mounts) > 0 {
		return mounts
	}
	return discoverViaDriveScan()
}

// discoverViaLucidCLI runs "lucid list" to get instance IDs, then
// "lucid --instance <id> status" for each to get the mount point.
func discoverViaLucidCLI() []FilespaceMount {
	// Run "lucid list" to discover instances (hidden window).
	cmd := exec.Command("lucid", "list")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil {
		return nil
	}

	instances := parseLucidList(string(out))
	if len(instances) == 0 {
		return nil
	}

	// Run "lucid --instance <id> status" in parallel — each call shells out
	// and waits on the CLI, so total time scales with the slowest instance
	// rather than the sum of all instances.
	results := make([]*FilespaceMount, len(instances))
	var wg sync.WaitGroup
	for i, inst := range instances {
		wg.Add(1)
		go func(i int, inst FilespaceMount) {
			defer wg.Done()
			results[i] = getLucidInstanceStatus(inst.InstanceID, inst.Filespace)
		}(i, inst)
	}
	wg.Wait()

	mounts := make([]FilespaceMount, 0, len(results))
	for _, m := range results {
		if m != nil {
			mounts = append(mounts, *m)
		}
	}
	return mounts
}

// parseLucidList parses the tabular output of "lucid list".
// Format:
//
//	INSTANCE ID        FILESPACE             PORT        MODE
//	2008               nab.lucid-demo        9786        live
func parseLucidList(output string) []FilespaceMount {
	var results []FilespaceMount
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "INSTANCE") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		results = append(results, FilespaceMount{
			InstanceID: fields[0],
			Filespace:  fields[1],
		})
	}
	return results
}

// getLucidInstanceStatus runs "lucid --instance <id> status" and parses the mount point.
func getLucidInstanceStatus(instanceID, filespace string) *FilespaceMount {
	cmd := exec.Command("lucid", "--instance", instanceID, "status")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil {
		return nil
	}

	mountPoint := ""
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Mount point:") {
			mountPoint = strings.TrimSpace(strings.TrimPrefix(line, "Mount point:"))
			break
		}
	}

	if mountPoint == "" {
		return nil
	}

	// Ensure mount point ends with backslash for consistency (e.g. "L:" -> "L:\").
	if len(mountPoint) == 2 && mountPoint[1] == ':' {
		mountPoint += "\\"
	}

	// Verify .lucid_audit exists at the mount.
	if _, err := os.Stat(filepath.Join(mountPoint, ".lucid_audit")); err != nil {
		return nil
	}

	return &FilespaceMount{
		InstanceID: instanceID,
		Filespace:  filespace,
		MountPoint: mountPoint,
	}
}

// discoverViaDriveScan is the fallback if the lucid CLI is unavailable.
// Scans drive letters for .lucid_audit directories.
func discoverViaDriveScan() []FilespaceMount {
	var mounts []FilespaceMount
	seen := make(map[string]bool)

	for d := 'C'; d <= 'Z'; d++ {
		drive := string(d) + ":\\"
		if _, err := os.Stat(drive); err != nil {
			continue
		}
		scanForLucidAudit(drive, 0, 3, seen, &mounts)
	}
	return mounts
}

func scanForLucidAudit(dir string, depth, maxDepth int, seen map[string]bool, mounts *[]FilespaceMount) {
	if depth > maxDepth {
		return
	}

	if _, err := os.Stat(filepath.Join(dir, ".lucid_audit")); err == nil {
		if !seen[dir] {
			*mounts = append(*mounts, FilespaceMount{
				MountPoint: dir,
				Filespace:  filepath.Base(dir), // best guess from directory name
			})
			seen[dir] = true
		}
		return
	}

	if depth == maxDepth {
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") || strings.HasPrefix(entry.Name(), "$") {
			continue
		}
		scanForLucidAudit(filepath.Join(dir, entry.Name()), depth+1, maxDepth, seen, mounts)
	}
}
