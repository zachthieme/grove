// Package httpapi is the HTTP transport layer. Handlers are split by
// resource (handlers_org.go, handlers_pod.go, handlers_snapshot.go,
// handlers_import.go, handlers_settings.go); this file holds shared
// helpers used by all of them.
package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/logbuf"
	"github.com/zachthieme/grove/internal/org"
)

// readUploadedFile pulls the "file" form field from a multipart request,
// applying the upload size limit. Returns the file bytes and original filename,
// or writes an error response and returns ok=false.
func readUploadedFile(w http.ResponseWriter, r *http.Request) (data []byte, filename string, ok bool) {
	r.Body = http.MaxBytesReader(w, r.Body, org.MaxUploadSize)
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file field or file too large (max 50MB)")
		return nil, "", false
	}
	defer func() { _ = file.Close() }()

	data, err = io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reading file")
		return nil, "", false
	}
	return data, header.Filename, true
}

// jsonHandlerCtx creates a context-aware handler that decodes JSON, calls fn
// with the request context and decoded body, and writes the result.
func jsonHandlerCtx[Req any, Resp any](fn func(context.Context, Req) (Resp, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "application/json") {
			writeError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
			return
		}
		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		resp, err := fn(r.Context(), req)
		if err != nil {
			org.ServiceError(w, err)
			return
		}
		writeJSON(w, resp)
	}
}

// writeJSON writes a 200 OK JSON response. Non-OK responses go through
// writeError, which always sets the appropriate status.
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		logbuf.Logger().Error("writeJSON encode failed", "source", "api", "err", err.Error())
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]string{"error": msg}); err != nil {
		logbuf.Logger().Error("writeError encode failed", "source", "api", "status", int64(status), "err", err.Error())
	}
}

// sanitizeFilename strips control characters and quotes from a filename
// to prevent header injection in Content-Disposition.
func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		if r < 0x20 || r == 0x7f || r == '"' || r == '\\' {
			continue // strip control chars, quotes, backslashes
		}
		b.WriteRune(r)
	}
	result := b.String()
	if result == "" {
		return "download"
	}
	return result
}

// writeFileResponse writes binary data as an attachment download response.
func writeFileResponse(w http.ResponseWriter, data []byte, contentType, filename string) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", `attachment; filename="`+sanitizeFilename(filename)+`"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	if _, err := w.Write(data); err != nil {
		logbuf.Logger().Error("file response write failed", "source", "api", "filename", filename, "contentType", contentType, "err", err.Error())
	}
}

// exportByFormat serializes people to the given format ("csv" or "xlsx").
// Returns (nil, "", "", nil) for unsupported formats so callers can return 400.
func exportByFormat(format string, people []apitypes.OrgNode, baseName string) ([]byte, string, string, error) {
	switch strings.ToLower(format) {
	case org.FormatCSV:
		data, err := org.ExportCSV(people)
		return data, "text/csv", baseName + ".csv", err
	case org.FormatXLSX:
		data, err := org.ExportXLSX(people)
		return data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", baseName + ".xlsx", err
	default:
		return nil, "", "", nil
	}
}

// limitBody wraps r.Body with a org.MaxBodySize limit.
func limitBody(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, org.MaxBodySize)
}
