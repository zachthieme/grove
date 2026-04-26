package httpapi

// Scenarios: CONTRACT-005 — all tests in this file

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/logbuf"
	"github.com/zachthieme/grove/internal/org"
	"github.com/zachthieme/grove/internal/snapshot"
)

func TestLoggingMiddleware_CapturesRequest(t *testing.T) {
	t.Parallel()
	buf := logbuf.New(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"ok": "true"})
	})
	handler := LoggingMiddleware(buf)(inner)

	body := `{"personId":"abc"}`
	req := httptest.NewRequest("POST", "/api/update", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("X-Correlation-ID", "corr-123")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	entries := buf.Entries(logbuf.LogFilter{})
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
	buf := logbuf.New(100)
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

	entries := buf.Entries(logbuf.LogFilter{})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries (excluded paths), got %d", len(entries))
	}
}

func TestLoggingMiddleware_ExcludesUploadBody(t *testing.T) {
	t.Parallel()
	buf := logbuf.New(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	})
	handler := LoggingMiddleware(buf)(inner)

	req := httptest.NewRequest("POST", "/api/upload", strings.NewReader("large file data"))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	entries := buf.Entries(logbuf.LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1, got %d", len(entries))
	}
	if entries[0].RequestBody != nil {
		t.Error("upload request body should not be captured")
	}
}

func TestLoggingMiddleware_ExcludesExportResponseBody(t *testing.T) {
	t.Parallel()
	buf := logbuf.New(100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("binary data"))
	})
	handler := LoggingMiddleware(buf)(inner)

	req := httptest.NewRequest("GET", "/api/export/csv", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	entries := buf.Entries(logbuf.LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1, got %d", len(entries))
	}
	if entries[0].ResponseBody != nil {
		t.Error("export response body should not be captured")
	}
}

func TestLogEndpoints_GET(t *testing.T) {
	t.Parallel()
	buf := logbuf.New(100)
	buf.Add(logbuf.LogEntry{Source: "api", Method: "GET", Path: "/api/org", CorrelationID: "c1"})
	buf.Add(logbuf.LogEntry{Source: "web", Method: "POST", Path: "/api/update", CorrelationID: "c2"})

	router := NewRouter(NewServices(org.New(snapshot.NewMemoryStore())), buf, autosave.NewMemoryStore())

	req := httptest.NewRequest("GET", "/api/logs", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var resp struct {
		Entries    []logbuf.LogEntry `json:"entries"`
		Count      int               `json:"count"`
		BufferSize int               `json:"bufferSize"`
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
	buf := logbuf.New(100)
	router := NewRouter(NewServices(org.New(snapshot.NewMemoryStore())), buf, autosave.NewMemoryStore())

	body := `{"source":"web","method":"POST","path":"/api/update","responseStatus":200,"durationMs":15}`
	req := httptest.NewRequest("POST", "/api/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rr.Code)
	}
	entries := buf.Entries(logbuf.LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Source != "web" {
		t.Errorf("expected source web, got %s", entries[0].Source)
	}
}

func TestLogEndpoints_DELETE(t *testing.T) {
	t.Parallel()
	buf := logbuf.New(100)
	buf.Add(logbuf.LogEntry{Path: "/a"})
	buf.Add(logbuf.LogEntry{Path: "/b"})
	router := NewRouter(NewServices(org.New(snapshot.NewMemoryStore())), buf, autosave.NewMemoryStore())

	req := httptest.NewRequest("DELETE", "/api/logs", nil)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
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
	router := NewRouter(NewServices(org.New(snapshot.NewMemoryStore())), nil, autosave.NewMemoryStore())

	req := httptest.NewRequest("GET", "/api/logs", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404 when logging disabled, got %d", rr.Code)
	}
}

func TestConfigEndpoint(t *testing.T) {
	t.Parallel()
	router := NewRouter(NewServices(org.New(snapshot.NewMemoryStore())), logbuf.New(10), autosave.NewMemoryStore())
	req := httptest.NewRequest("GET", "/api/config", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var cfg map[string]bool
	_ = json.NewDecoder(rr.Body).Decode(&cfg)
	if !cfg["logging"] {
		t.Error("expected logging: true")
	}

	router = NewRouter(NewServices(org.New(snapshot.NewMemoryStore())), nil, autosave.NewMemoryStore())
	req = httptest.NewRequest("GET", "/api/config", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	_ = json.NewDecoder(rr.Body).Decode(&cfg)
	if cfg["logging"] {
		t.Error("expected logging: false")
	}
}
