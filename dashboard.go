package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
)

// Dashboard manages the HTTP API server and WebView2 window for audit trail visualization.
type Dashboard struct {
	db      *AuditDB
	manager *WatcherManager
	server  *http.Server
	port    int
	mu      sync.Mutex
	running bool
}

// NewDashboard creates a dashboard backed by the given AuditDB and WatcherManager.
func NewDashboard(db *AuditDB, manager *WatcherManager) *Dashboard {
	return &Dashboard{
		db:      db,
		manager: manager,
	}
}

// Start launches the HTTP server and returns the port it's listening on.
func (d *Dashboard) Start() (int, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.running {
		return d.port, nil
	}

	mux := http.NewServeMux()
	d.registerRoutes(mux)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("listen: %w", err)
	}
	d.port = listener.Addr().(*net.TCPAddr).Port

	d.server = &http.Server{Handler: mux}
	d.running = true

	go func() {
		if err := d.server.Serve(listener); err != http.ErrServerClosed {
			log.Printf("dashboard server error: %v", err)
		}
	}()

	return d.port, nil
}

// Stop shuts down the HTTP server.
func (d *Dashboard) Stop() {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.running && d.server != nil {
		d.server.Close()
		d.running = false
	}
}

// URL returns the dashboard URL.
func (d *Dashboard) URL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", d.port)
}

// OpenWindow opens the dashboard in a WebView2 window.
func (d *Dashboard) OpenWindow() {
	url := d.URL()
	openWebView2Window("LucidLink Audit Trail", url, 1200, 800)
}

func (d *Dashboard) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(dashboardHTML))
	})

	mux.HandleFunc("/api/events", d.handleEvents)
	mux.HandleFunc("/api/stats", d.handleStats)
	mux.HandleFunc("/api/count", d.handleCount)
	mux.HandleFunc("/api/histogram", d.handleHistogram)
	mux.HandleFunc("/api/filespaces", d.handleFilespaces)
	mux.HandleFunc("/api/status", d.handleStatus)
}

func parseSearchParams(r *http.Request) SearchParams {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	return SearchParams{
		User:      q.Get("user"),
		Action:    q.Get("action"),
		Path:      q.Get("path"),
		Filespace: q.Get("filespace"),
		Since:     q.Get("since"),
		Until:     q.Get("until"),
		Limit:     limit,
		Offset:    offset,
	}
}

func (d *Dashboard) handleEvents(w http.ResponseWriter, r *http.Request) {
	params := parseSearchParams(r)

	events, total, err := d.db.SearchEvents(params)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  params.Limit,
		"offset": params.Offset,
	})
}

func (d *Dashboard) handleStats(w http.ResponseWriter, r *http.Request) {
	params := parseSearchParams(r)
	stats := d.db.Stats(params)
	jsonResponse(w, stats)
}

func (d *Dashboard) handleCount(w http.ResponseWriter, r *http.Request) {
	params := parseSearchParams(r)
	field := r.URL.Query().Get("field")
	if field == "" {
		field = "action"
	}

	counts, err := d.db.CountByField(field, params)
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"field":  field,
		"counts": counts,
	})
}

func (d *Dashboard) handleHistogram(w http.ResponseWriter, r *http.Request) {
	params := parseSearchParams(r)

	buckets, err := d.db.TimeHistogram(params)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"buckets": buckets,
	})
}

func (d *Dashboard) handleFilespaces(w http.ResponseWriter, r *http.Request) {
	filespaces, err := d.db.ListFilespaces()
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	jsonResponse(w, map[string]interface{}{
		"filespaces": filespaces,
	})
}

func (d *Dashboard) handleStatus(w http.ResponseWriter, r *http.Request) {
	params := parseSearchParams(r)
	status := map[string]interface{}{
		"db":       d.db.Stats(params),
		"watchers": d.manager.Status(),
	}
	jsonResponse(w, status)
}

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
