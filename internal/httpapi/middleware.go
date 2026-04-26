package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zachthieme/grove/internal/logbuf"
)

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

func handleGetLogs(buf *logbuf.LogBuffer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		f := logbuf.LogFilter{
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
		writeJSON(w, map[string]any{
			"entries":    entries,
			"count":      len(entries),
			"bufferSize": buf.Size(),
		})
	}
}

func handlePostLog(buf *logbuf.LogBuffer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var entry logbuf.LogEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		buf.Add(entry)
		w.WriteHeader(http.StatusCreated)
	}
}

func handleDeleteLogs(buf *logbuf.LogBuffer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		buf.Clear()
		w.WriteHeader(http.StatusNoContent)
	}
}

func LoggingMiddleware(buf *logbuf.LogBuffer) func(http.Handler) http.Handler {
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

			entry := logbuf.LogEntry{
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
