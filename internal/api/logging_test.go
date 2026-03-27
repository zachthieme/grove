package api

// Scenarios: CONTRACT-005 — all tests in this file

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLogBuffer_Add_and_Entries(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	buf.Add(LogEntry{Source: "api", Method: "GET", Path: "/api/org"})
	buf.Add(LogEntry{Source: "web", Method: "POST", Path: "/api/update"})

	entries := buf.Entries(LogFilter{})
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Path != "/api/update" {
		t.Errorf("expected most recent first, got %s", entries[0].Path)
	}
	if entries[0].ID == "" {
		t.Error("expected ID to be assigned")
	}
	if entries[0].Timestamp.IsZero() {
		t.Error("expected timestamp to be assigned")
	}
}

func TestLogBuffer_Eviction(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(3)
	buf.Add(LogEntry{Path: "/first"})
	buf.Add(LogEntry{Path: "/second"})
	buf.Add(LogEntry{Path: "/third"})
	buf.Add(LogEntry{Path: "/fourth"})

	entries := buf.Entries(LogFilter{})
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	for _, e := range entries {
		if e.Path == "/first" {
			t.Error("/first should have been evicted")
		}
	}
}

func TestLogBuffer_Clear(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	buf.Add(LogEntry{Path: "/a"})
	buf.Add(LogEntry{Path: "/b"})
	buf.Clear()

	entries := buf.Entries(LogFilter{})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
}

func TestLogBuffer_FilterByCorrelationID(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	buf.Add(LogEntry{CorrelationID: "abc", Path: "/a"})
	buf.Add(LogEntry{CorrelationID: "def", Path: "/b"})
	buf.Add(LogEntry{CorrelationID: "abc", Path: "/c"})

	entries := buf.Entries(LogFilter{CorrelationID: "abc"})
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
}

func TestLogBuffer_FilterBySource(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	buf.Add(LogEntry{Source: "api", Path: "/a"})
	buf.Add(LogEntry{Source: "web", Path: "/b"})

	entries := buf.Entries(LogFilter{Source: "api"})
	if len(entries) != 1 {
		t.Fatalf("expected 1, got %d", len(entries))
	}
	if entries[0].Path != "/a" {
		t.Errorf("expected /a, got %s", entries[0].Path)
	}
}

func TestLogBuffer_FilterBySince(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	buf.Add(LogEntry{Path: "/old"})
	cutoff := time.Now()
	time.Sleep(time.Millisecond)
	buf.Add(LogEntry{Path: "/new"})

	entries := buf.Entries(LogFilter{Since: cutoff})
	if len(entries) != 1 {
		t.Fatalf("expected 1, got %d", len(entries))
	}
	if entries[0].Path != "/new" {
		t.Errorf("expected /new, got %s", entries[0].Path)
	}
}

func TestLogBuffer_FilterByLimit(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	for range 5 {
		buf.Add(LogEntry{Path: "/x"})
	}

	entries := buf.Entries(LogFilter{Limit: 2})
	if len(entries) != 2 {
		t.Fatalf("expected 2, got %d", len(entries))
	}
}

func TestLogBuffer_Size(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	if buf.Size() != 100 {
		t.Errorf("expected size 100, got %d", buf.Size())
	}
}

func TestLoggingMiddleware_CapturesRequest(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	})
	handler := LoggingMiddleware(buf)(inner)

	body := `{"personId":"abc"}`
	req := httptest.NewRequest("POST", "/api/update", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Correlation-ID", "corr-123")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	entries := buf.Entries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 log entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Source != "api" {
		t.Errorf("expected source api, got %s", e.Source)
	}
	if e.Method != "POST" {
		t.Errorf("expected POST, got %s", e.Method)
	}
	if e.Path != "/api/update" {
		t.Errorf("expected /api/update, got %s", e.Path)
	}
	if e.CorrelationID != "corr-123" {
		t.Errorf("expected corr-123, got %s", e.CorrelationID)
	}
	if e.ResponseStatus != 200 {
		t.Errorf("expected status 200, got %d", e.ResponseStatus)
	}
	if e.DurationMs < 0 {
		t.Errorf("expected non-negative duration, got %d", e.DurationMs)
	}
	if len(e.RequestBody) == 0 {
		t.Error("expected request body to be captured")
	}
	if len(e.ResponseBody) == 0 {
		t.Error("expected response body to be captured")
	}
}

func TestLoggingMiddleware_ExcludesLogEndpoints(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := LoggingMiddleware(buf)(inner)

	for _, path := range []string{"/api/logs", "/api/config"} {
		req := httptest.NewRequest("GET", path, nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
	}
	req := httptest.NewRequest("POST", "/api/logs", strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	entries := buf.Entries(LogFilter{})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries (excluded paths), got %d", len(entries))
	}
}

func TestLoggingMiddleware_ExcludesUploadBody(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	})
	handler := LoggingMiddleware(buf)(inner)

	req := httptest.NewRequest("POST", "/api/upload", strings.NewReader("large file data"))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	entries := buf.Entries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1, got %d", len(entries))
	}
	if entries[0].RequestBody != nil {
		t.Error("upload request body should not be captured")
	}
}

func TestLoggingMiddleware_ExcludesExportResponseBody(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("binary data"))
	})
	handler := LoggingMiddleware(buf)(inner)

	req := httptest.NewRequest("GET", "/api/export/csv", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	entries := buf.Entries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1, got %d", len(entries))
	}
	if entries[0].ResponseBody != nil {
		t.Error("export response body should not be captured")
	}
}

func TestLogEndpoints_GET(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	buf.Add(LogEntry{Source: "api", Method: "GET", Path: "/api/org", CorrelationID: "c1"})
	buf.Add(LogEntry{Source: "web", Method: "POST", Path: "/api/update", CorrelationID: "c2"})

	router := NewRouter(NewOrgService(NewMemorySnapshotStore()), buf, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/logs", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var resp struct {
		Entries    []LogEntry `json:"entries"`
		Count      int        `json:"count"`
		BufferSize int        `json:"bufferSize"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Count != 2 {
		t.Errorf("expected count 2, got %d", resp.Count)
	}
	if resp.BufferSize != 100 {
		t.Errorf("expected bufferSize 100, got %d", resp.BufferSize)
	}

	req = httptest.NewRequest("GET", "/api/logs?correlationId=c1", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	_ = json.NewDecoder(rr.Body).Decode(&resp)
	if resp.Count != 1 {
		t.Errorf("expected 1 filtered entry, got %d", resp.Count)
	}

	req = httptest.NewRequest("GET", "/api/logs?source=web", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	_ = json.NewDecoder(rr.Body).Decode(&resp)
	if resp.Count != 1 {
		t.Errorf("expected 1 web entry, got %d", resp.Count)
	}
}

func TestLogEndpoints_POST(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	router := NewRouter(NewOrgService(NewMemorySnapshotStore()), buf, NewMemoryAutosaveStore())

	body := `{"source":"web","method":"POST","path":"/api/update","responseStatus":200,"durationMs":15}`
	req := httptest.NewRequest("POST", "/api/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rr.Code)
	}
	entries := buf.Entries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Source != "web" {
		t.Errorf("expected source web, got %s", entries[0].Source)
	}
}

func TestLogEndpoints_DELETE(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(100)
	buf.Add(LogEntry{Path: "/a"})
	buf.Add(LogEntry{Path: "/b"})
	router := NewRouter(NewOrgService(NewMemorySnapshotStore()), buf, NewMemoryAutosaveStore())

	req := httptest.NewRequest("DELETE", "/api/logs", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rr.Code)
	}
	if buf.Count() != 0 {
		t.Errorf("expected buffer cleared, got %d", buf.Count())
	}
}

func TestLogEndpoints_NotRegistered_WhenNilBuffer(t *testing.T) {
	t.Parallel()
	router := NewRouter(NewOrgService(NewMemorySnapshotStore()), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/logs", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404 when logging disabled, got %d", rr.Code)
	}
}

func TestConfigEndpoint(t *testing.T) {
	t.Parallel()
	router := NewRouter(NewOrgService(NewMemorySnapshotStore()), NewLogBuffer(10), NewMemoryAutosaveStore())
	req := httptest.NewRequest("GET", "/api/config", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var cfg map[string]bool
	_ = json.NewDecoder(rr.Body).Decode(&cfg)
	if !cfg["logging"] {
		t.Error("expected logging: true")
	}

	router = NewRouter(NewOrgService(NewMemorySnapshotStore()), nil, NewMemoryAutosaveStore())
	req = httptest.NewRequest("GET", "/api/config", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	_ = json.NewDecoder(rr.Body).Decode(&cfg)
	if cfg["logging"] {
		t.Error("expected logging: false")
	}
}
