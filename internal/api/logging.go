package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LogEntry struct {
	ID             string          `json:"id"`
	Timestamp      time.Time       `json:"timestamp"`
	CorrelationID  string          `json:"correlationId,omitempty"`
	Source         string          `json:"source"`
	Method         string          `json:"method"`
	Path           string          `json:"path"`
	RequestBody    json.RawMessage `json:"requestBody,omitempty"`
	ResponseStatus int             `json:"responseStatus,omitempty"`
	ResponseBody   json.RawMessage `json:"responseBody,omitempty"`
	DurationMs     int64           `json:"durationMs,omitempty"`
	Error          string          `json:"error,omitempty"`
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

func NewLogBuffer(capacity int) *LogBuffer {
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

type responseCapture struct {
	http.ResponseWriter
	statusCode  int
	body        bytes.Buffer
	captureBody bool
	wroteHeader bool
}

func (rc *responseCapture) WriteHeader(code int) {
	if !rc.wroteHeader {
		rc.statusCode = code
		rc.wroteHeader = true
	}
	rc.ResponseWriter.WriteHeader(code)
}

func (rc *responseCapture) Write(b []byte) (int, error) {
	if rc.captureBody {
		rc.body.Write(b)
	}
	if !rc.wroteHeader {
		rc.statusCode = http.StatusOK
		rc.wroteHeader = true
	}
	return rc.ResponseWriter.Write(b)
}

func handleGetLogs(buf *LogBuffer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		f := LogFilter{
			CorrelationID: q.Get("correlationId"),
			Source:        q.Get("source"),
		}
		if since := q.Get("since"); since != "" {
			if t, err := time.Parse(time.RFC3339Nano, since); err == nil {
				f.Since = t
			}
		}
		if limit := q.Get("limit"); limit != "" {
			if n, err := strconv.Atoi(limit); err == nil && n > 0 {
				f.Limit = n
			}
		}
		entries := buf.Entries(f)
		writeJSON(w, http.StatusOK, map[string]any{
			"entries":    entries,
			"count":      len(entries),
			"bufferSize": buf.Size(),
		})
	}
}

func handlePostLog(buf *LogBuffer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var entry LogEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		buf.Add(entry)
		w.WriteHeader(http.StatusCreated)
	}
}

func handleDeleteLogs(buf *LogBuffer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		buf.Clear()
		w.WriteHeader(http.StatusNoContent)
	}
}

func LoggingMiddleware(buf *LogBuffer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path

			if strings.HasPrefix(path, "/api/logs") || strings.HasPrefix(path, "/api/config") {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()
			correlationID := r.Header.Get("X-Correlation-ID")

			isUpload := path == "/api/upload" || path == "/api/upload/zip"
			var reqBody json.RawMessage
			if !isUpload && r.Body != nil {
				bodyBytes, err := io.ReadAll(r.Body)
				if err == nil && len(bodyBytes) > 0 {
					if json.Valid(bodyBytes) {
						reqBody = bodyBytes
					}
					r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
				}
			}

			isExport := strings.HasPrefix(path, "/api/export")
			rc := &responseCapture{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
				captureBody:    !isExport,
			}

			next.ServeHTTP(rc, r)

			entry := LogEntry{
				Source:         "api",
				Method:         r.Method,
				Path:           path,
				CorrelationID:  correlationID,
				RequestBody:    reqBody,
				ResponseStatus: rc.statusCode,
				DurationMs:     time.Since(start).Milliseconds(),
			}
			if rc.captureBody && rc.body.Len() > 0 {
				if respBytes := rc.body.Bytes(); json.Valid(respBytes) {
					entry.ResponseBody = make(json.RawMessage, len(respBytes))
					copy(entry.ResponseBody, respBytes)
				}
			}

			buf.Add(entry)
		})
	}
}
