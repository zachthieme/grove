package logbuf

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

type LogEntry struct {
	ID             string          `json:"id"`
	Timestamp      time.Time       `json:"timestamp"`
	Level          string          `json:"level,omitempty"`
	Message        string          `json:"message,omitempty"`
	CorrelationID  string          `json:"correlationId,omitempty"`
	Source         string          `json:"source"`
	Method         string          `json:"method,omitempty"`
	Path           string          `json:"path,omitempty"`
	RequestBody    json.RawMessage `json:"requestBody,omitempty"`
	ResponseStatus int             `json:"responseStatus,omitempty"`
	ResponseBody   json.RawMessage `json:"responseBody,omitempty"`
	DurationMs     int64           `json:"durationMs,omitempty"`
	Error          string          `json:"error,omitempty"`
	Attrs          json.RawMessage `json:"attrs,omitempty"`
}

type LogFilter struct {
	CorrelationID string
	Source        string
	Since         time.Time
	Limit         int
}

type LogBuffer struct {
	mu      sync.RWMutex
	entries []LogEntry
	cap     int
	head    int
	count   int
}

func New(capacity int) *LogBuffer {
	return &LogBuffer{
		entries: make([]LogEntry, capacity),
		cap:     capacity,
	}
}

func (b *LogBuffer) Add(entry LogEntry) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if entry.ID == "" {
		entry.ID = fmt.Sprintf("%d-%04x", time.Now().UnixMicro(), rand.Intn(0xFFFF))
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	b.entries[b.head] = entry
	b.head = (b.head + 1) % b.cap
	if b.count < b.cap {
		b.count++
	}
}

func (b *LogBuffer) Entries(f LogFilter) []LogEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()
	result := make([]LogEntry, 0, b.count)
	for i := 0; i < b.count; i++ {
		idx := (b.head - 1 - i + b.cap) % b.cap
		e := b.entries[idx]
		if f.CorrelationID != "" && e.CorrelationID != f.CorrelationID {
			continue
		}
		if f.Source != "" && e.Source != f.Source {
			continue
		}
		if !f.Since.IsZero() && !e.Timestamp.After(f.Since) {
			continue
		}
		result = append(result, e)
		if f.Limit > 0 && len(result) >= f.Limit {
			break
		}
	}
	return result
}

func (b *LogBuffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.head = 0
	b.count = 0
}

func (b *LogBuffer) Count() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.count
}

func (b *LogBuffer) Size() int {
	return b.cap
}
