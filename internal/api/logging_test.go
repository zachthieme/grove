package api

import (
	"testing"
	"time"
)

func TestLogBuffer_Add_and_Entries(t *testing.T) {
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
	buf := NewLogBuffer(10)
	for i := 0; i < 5; i++ {
		buf.Add(LogEntry{Path: "/x"})
	}

	entries := buf.Entries(LogFilter{Limit: 2})
	if len(entries) != 2 {
		t.Fatalf("expected 2, got %d", len(entries))
	}
}

func TestLogBuffer_Size(t *testing.T) {
	buf := NewLogBuffer(100)
	if buf.Size() != 100 {
		t.Errorf("expected size 100, got %d", buf.Size())
	}
}
