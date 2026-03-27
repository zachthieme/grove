package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
	"time"
)

// ---------- Flag parsing ----------

func TestDefaultPort(t *testing.T) {
	f := rootCmd.Flags().Lookup("port")
	if f == nil {
		t.Fatal("expected --port flag to be registered")
	}
	if f.DefValue != "8080" {
		t.Errorf("expected default port 8080, got %s", f.DefValue)
	}
}

func TestDefaultDev(t *testing.T) {
	f := rootCmd.Flags().Lookup("dev")
	if f == nil {
		t.Fatal("expected --dev flag to be registered")
	}
	if f.DefValue != "false" {
		t.Errorf("expected default dev false, got %s", f.DefValue)
	}
}

func TestDefaultLog(t *testing.T) {
	f := rootCmd.Flags().Lookup("log")
	if f == nil {
		t.Fatal("expected --log flag to be registered")
	}
	if f.DefValue != "false" {
		t.Errorf("expected default log false, got %s", f.DefValue)
	}
}

func TestPortShorthand(t *testing.T) {
	f := rootCmd.Flags().ShorthandLookup("p")
	if f == nil {
		t.Fatal("expected -p shorthand for --port")
	}
	if f.Name != "port" {
		t.Errorf("expected -p to map to port, got %s", f.Name)
	}
}

// ---------- CORS middleware ----------

func TestCorsDevMiddleware_SetsHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsDevMiddleware(inner)

	req := httptest.NewRequest("GET", "/api/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	tests := []struct {
		header, want string
	}{
		{"Access-Control-Allow-Origin", "*"},
		{"Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"},
		{"Access-Control-Allow-Headers", "Content-Type, X-Correlation-ID"},
	}
	for _, tt := range tests {
		got := rec.Header().Get(tt.header)
		if got != tt.want {
			t.Errorf("header %s = %q, want %q", tt.header, got, tt.want)
		}
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestCorsDevMiddleware_OptionsPreflight(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("inner handler should not be called for OPTIONS preflight")
	})
	handler := corsDevMiddleware(inner)

	req := httptest.NewRequest("OPTIONS", "/api/org", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected status 204 for OPTIONS, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected CORS origin *, got %q", got)
	}
}

func TestCorsDevMiddleware_NonOptionsPassesThrough(t *testing.T) {
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	})
	handler := corsDevMiddleware(inner)

	for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
		called = false
		req := httptest.NewRequest(method, "/api/test", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if !called {
			t.Errorf("%s: inner handler was not called", method)
		}
		if rec.Code != http.StatusCreated {
			t.Errorf("%s: expected status 201, got %d", method, rec.Code)
		}
	}
}

// ---------- Server lifecycle ----------

// freePort asks the OS for a free TCP port.
func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to find free port: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	return port
}

func TestServerLifecycle(t *testing.T) {
	port := freePort(t)

	// Save and restore global state that runServe depends on.
	origPort := servePort
	origDev := serveDev
	origLog := serveLog
	origFS := GetFrontendFS
	t.Cleanup(func() {
		servePort = origPort
		serveDev = origDev
		serveLog = origLog
		GetFrontendFS = origFS
	})

	servePort = port
	serveDev = true // skip frontend embed
	serveLog = false

	// Create a cancellable context so we can shut down the server.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Prepare a cobra command with the context.
	cmd := *rootCmd // shallow copy so we don't mutate the global
	cmd.SetContext(ctx)

	errCh := make(chan error, 1)
	go func() {
		errCh <- runServe(&cmd, nil)
	}()

	// Poll until the server is ready (up to 3 seconds).
	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		resp, err := http.Get(base + "/api/health")
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				lastErr = nil
				break
			}
		}
		lastErr = err
		time.Sleep(20 * time.Millisecond)
	}
	if lastErr != nil {
		t.Fatalf("server did not become ready: %v", lastErr)
	}

	// Verify /api/health returns expected JSON.
	resp, err := http.Get(base + "/api/health")
	if err != nil {
		t.Fatalf("GET /api/health: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding health response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %q", body["status"])
	}

	// Signal shutdown.
	cancel()

	// Wait for runServe to return.
	select {
	case err := <-errCh:
		if err != nil {
			t.Errorf("runServe returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down within 5 seconds")
	}
}

func TestServerLifecycle_WithFrontendFS(t *testing.T) {
	port := freePort(t)

	origPort := servePort
	origDev := serveDev
	origLog := serveLog
	origFS := GetFrontendFS
	t.Cleanup(func() {
		servePort = origPort
		serveDev = origDev
		serveLog = origLog
		GetFrontendFS = origFS
	})

	servePort = port
	serveDev = false
	serveLog = false

	// Provide a minimal in-memory filesystem with an index.html.
	GetFrontendFS = func() (fs.FS, error) {
		return fstest.MapFS{
			"index.html": &fstest.MapFile{
				Data: []byte("<html><body>test</body></html>"),
			},
		}, nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := *rootCmd
	cmd.SetContext(ctx)

	errCh := make(chan error, 1)
	go func() {
		errCh <- runServe(&cmd, nil)
	}()

	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(base + "/api/health")
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
	}

	// Verify the embedded frontend is served.
	resp, err := http.Get(base + "/index.html")
	if err != nil {
		t.Fatalf("GET /index.html: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for index.html, got %d", resp.StatusCode)
	}

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Errorf("runServe returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down within 5 seconds")
	}
}

func TestServerLifecycle_DevModeCORS(t *testing.T) {
	port := freePort(t)

	origPort := servePort
	origDev := serveDev
	origLog := serveLog
	origFS := GetFrontendFS
	t.Cleanup(func() {
		servePort = origPort
		serveDev = origDev
		serveLog = origLog
		GetFrontendFS = origFS
	})

	servePort = port
	serveDev = true
	serveLog = false

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := *rootCmd
	cmd.SetContext(ctx)

	errCh := make(chan error, 1)
	go func() {
		errCh <- runServe(&cmd, nil)
	}()

	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(base + "/api/health")
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
	}

	// In dev mode, CORS headers should be present.
	resp, err := http.Get(base + "/api/health")
	if err != nil {
		t.Fatalf("GET /api/health: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected CORS origin * in dev mode, got %q", got)
	}

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Errorf("runServe returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down within 5 seconds")
	}
}
