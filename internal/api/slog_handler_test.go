package api

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestBufferHandler_RoutesSlogIntoLogBuffer(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	logger := slog.New(NewBufferHandler(buf, slog.LevelInfo))

	logger.Info("snapshot saved", "source", "snap", "name", "weekly", "people", 42)
	logger.Error("autosave write failed", "source", "autosave", "err", "disk full")

	entries := buf.Entries(LogFilter{})
	if len(entries) != 2 {
		t.Fatalf("want 2 entries, got %d", len(entries))
	}

	// Newest first.
	if entries[0].Level != "ERROR" || entries[0].Source != "autosave" || entries[0].Error != "disk full" {
		t.Errorf("error entry malformed: %+v", entries[0])
	}
	if entries[1].Level != "INFO" || entries[1].Source != "snap" || entries[1].Message != "snapshot saved" {
		t.Errorf("info entry malformed: %+v", entries[1])
	}
	if len(entries[1].Attrs) == 0 {
		t.Fatal("expected non-source/non-reserved attrs in Attrs blob")
	}
	var attrs map[string]any
	if err := json.Unmarshal(entries[1].Attrs, &attrs); err != nil {
		t.Fatalf("attrs unmarshal: %v", err)
	}
	if attrs["name"] != "weekly" {
		t.Errorf("want attrs.name=weekly, got %v", attrs["name"])
	}
}

func TestBufferHandler_RespectsLevel(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	logger := slog.New(NewBufferHandler(buf, slog.LevelWarn))
	logger.Info("filtered out")
	logger.Warn("included")

	entries := buf.Entries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("want 1 entry, got %d", len(entries))
	}
	if entries[0].Message != "included" {
		t.Errorf("want included, got %s", entries[0].Message)
	}
}

func TestMultiHandler_FansOut(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	var stderr bytes.Buffer
	textH := slog.NewTextHandler(&stderr, &slog.HandlerOptions{Level: slog.LevelDebug})
	bufH := NewBufferHandler(buf, slog.LevelDebug)
	logger := slog.New(NewMultiHandler(textH, bufH))

	logger.Info("hello", "k", "v")

	if !strings.Contains(stderr.String(), "hello") {
		t.Errorf("expected text handler to receive record, got %q", stderr.String())
	}
	if buf.Count() != 1 {
		t.Errorf("expected buffer to receive record, got count=%d", buf.Count())
	}
}

func TestSlogWriter_RoutesStdlibLogToSlog(t *testing.T) {
	t.Parallel()
	buf := NewLogBuffer(10)
	logger := slog.New(NewBufferHandler(buf, slog.LevelDebug))
	w := SlogWriter{Logger: logger, Level: slog.LevelWarn}

	if _, err := w.Write([]byte("legacy stdlib message\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	entries := buf.Entries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("want 1, got %d", len(entries))
	}
	if entries[0].Message != "legacy stdlib message" {
		t.Errorf("want trimmed message, got %q", entries[0].Message)
	}
	if entries[0].Level != "WARN" {
		t.Errorf("want WARN, got %s", entries[0].Level)
	}
	if entries[0].Source != "stdlib" {
		t.Errorf("want source=stdlib, got %s", entries[0].Source)
	}
}

func TestSetLogger_NilNoop(t *testing.T) {
	t.Parallel()
	prev := Logger()
	SetLogger(nil)
	if Logger() != prev {
		t.Error("SetLogger(nil) should be a no-op")
	}
}

// Compile-time check that BufferHandler satisfies slog.Handler.
var _ slog.Handler = (*BufferHandler)(nil)

// Sanity: ensure default logger is non-nil at init.
func TestLogger_DefaultPresent(t *testing.T) {
	t.Parallel()
	if Logger() == nil {
		t.Fatal("Logger() returned nil — init() should install a default")
	}
	// Sanity check that calling Log doesn't panic with the default.
	Logger().Log(context.Background(), slog.LevelDebug, "init smoke")
}
