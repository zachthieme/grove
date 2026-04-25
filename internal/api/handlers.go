package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/logbuf"
)

func NewRouter(svcs Services, logBuf *logbuf.LogBuffer, autoStore autosave.AutosaveStore) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, HealthResponse{Status: "ok"})
	})

	mux.HandleFunc("POST /api/upload", handleUpload(svcs.Import))
	mux.HandleFunc("POST /api/upload/confirm", handleConfirmMapping(svcs.Import))
	mux.HandleFunc("POST /api/upload/zip", handleUploadZip(svcs.Import))
	mux.HandleFunc("GET /api/org", handleGetOrg(svcs.Org))
	mux.HandleFunc("POST /api/move", handleMove(svcs.People))
	mux.HandleFunc("POST /api/update", handleUpdate(svcs.People))
	mux.HandleFunc("POST /api/add", handleAdd(svcs.People))
	mux.HandleFunc("POST /api/people/add-parent", handleAddParent(svcs.People))
	mux.HandleFunc("POST /api/delete", handleDelete(svcs.People))
	mux.HandleFunc("GET /api/recycled", handleGetRecycled(svcs.Org))
	mux.HandleFunc("POST /api/restore", handleRestore(svcs.People))
	mux.HandleFunc("POST /api/empty-bin", handleEmptyBin(svcs.People))
	mux.HandleFunc("GET /api/export/pods-sidecar", handleExportPodsSidecar(svcs.Pods))
	mux.HandleFunc("GET /api/export/snapshot", handleExportSnapshot(svcs.Snaps))
	mux.HandleFunc("GET /api/export/{format}", handleExport(svcs.Org))

	mux.HandleFunc("GET /api/snapshots", handleListSnapshots(svcs.Snaps))
	mux.HandleFunc("POST /api/snapshots/save", handleSaveSnapshot(svcs.Snaps))
	mux.HandleFunc("POST /api/snapshots/load", handleLoadSnapshot(svcs.Snaps))
	mux.HandleFunc("POST /api/snapshots/delete", handleDeleteSnapshot(svcs.Snaps))

	mux.HandleFunc("GET /api/pods", handleListPods(svcs.Pods))
	mux.HandleFunc("POST /api/pods/update", handleUpdatePod(svcs.Pods))
	mux.HandleFunc("POST /api/pods/create", handleCreatePod(svcs.Pods))

	mux.HandleFunc("POST /api/reset", handleReset(svcs.Org))
	mux.HandleFunc("POST /api/create", handleCreate(svcs.Org))
	mux.HandleFunc("POST /api/reorder", handleReorder(svcs.People))

	mux.HandleFunc("GET /api/settings", handleGetSettings(svcs.Settings))
	mux.HandleFunc("POST /api/settings", handleUpdateSettings(svcs.Settings))
	mux.HandleFunc("GET /api/export/settings-sidecar", handleExportSettingsSidecar(svcs.Settings))

	mux.HandleFunc("POST /api/restore-state", handleRestoreState(svcs.Org))
	mux.HandleFunc("POST /api/autosave", handleWriteAutosave(autoStore))
	mux.HandleFunc("GET /api/autosave", handleReadAutosave(autoStore))
	mux.HandleFunc("DELETE /api/autosave", handleDeleteAutosave(autoStore))

	// Config endpoint — always registered
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, ConfigResponse{Logging: logBuf != nil})
	})

	// Log endpoints — only when logging is enabled
	if logBuf != nil {
		mux.HandleFunc("GET /api/logs", handleGetLogs(logBuf))
		mux.HandleFunc("POST /api/logs", handlePostLog(logBuf))
		mux.HandleFunc("DELETE /api/logs", handleDeleteLogs(logBuf))
	}

	return csrfProtect(mux)
}

// csrfProtect guards POST and DELETE with a layered defence:
//  1. X-Requested-With must be present. Browsers don't add custom headers on
//     cross-origin form/img/script submissions, so simple-request CSRF is blocked.
//  2. If Origin or Referer is present, its host must equal r.Host. Modern
//     browsers always send Origin on POST, so a fetch-from-evil.com attack is
//     rejected even if it sets the XHR header.
//
// Non-browser clients (curl, tests) typically omit Origin/Referer and pass
// step 1 alone — acceptable because they aren't subject to CSRF.
func csrfProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost || r.Method == http.MethodDelete {
			if r.Header.Get("X-Requested-With") == "" {
				writeError(w, http.StatusForbidden, "missing X-Requested-With header")
				return
			}
			if !sameOriginOrAbsent(r) {
				writeError(w, http.StatusForbidden, "origin mismatch")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// sameOriginOrAbsent returns true if the request's Origin/Referer host matches
// r.Host, or if neither header is present. An unparseable Origin/Referer is
// treated as a mismatch.
func sameOriginOrAbsent(r *http.Request) bool {
	for _, h := range []string{"Origin", "Referer"} {
		raw := r.Header.Get(h)
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return false
		}
		return u.Host == r.Host
	}
	return true
}

// readUploadedFile pulls the "file" form field from a multipart request,
// applying the upload size limit. Returns the file bytes and original filename,
// or writes an error response and returns ok=false.
func readUploadedFile(w http.ResponseWriter, r *http.Request) (data []byte, filename string, ok bool) {
	r.Body = http.MaxBytesReader(w, r.Body, MaxUploadSize)
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

func handleUpload(svc ImportService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, filename, ok := readUploadedFile(w, r)
		if !ok {
			return
		}
		resp, err := svc.Upload(r.Context(), filename, data)
		if err != nil {
			serviceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func handleUploadZip(svc ImportService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, _, ok := readUploadedFile(w, r)
		if !ok {
			return
		}
		resp, err := svc.UploadZip(r.Context(), data)
		if err != nil {
			serviceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func handleConfirmMapping(svc ImportService) http.HandlerFunc {
	type req struct {
		Mapping map[string]string `json:"mapping"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*OrgData, error) {
		return svc.ConfirmMapping(ctx, r.Mapping)
	})
}

func handleGetOrg(svc OrgStateService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := svc.GetOrg(r.Context())
		if data == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, http.StatusOK, data)
	}
}

func handleRestoreState(svc OrgStateService) http.HandlerFunc {
	return jsonHandlerCtx(func(ctx context.Context, data autosave.AutosaveData) (HealthResponse, error) {
		svc.RestoreState(ctx, data)
		return HealthResponse{Status: "ok"}, nil
	})
}

func handleMove(svc NodeService) http.HandlerFunc {
	type req struct {
		PersonId     string `json:"personId"`
		NewManagerId string `json:"newManagerId"`
		NewTeam      string `json:"newTeam"`
		NewPod       string `json:"newPod"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.Move(ctx, r.PersonId, r.NewManagerId, r.NewTeam, r.NewPod)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}

func handleUpdate(svc NodeService) http.HandlerFunc {
	type req struct {
		PersonId string                 `json:"personId"`
		Fields   apitypes.OrgNodeUpdate `json:"fields"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.Update(ctx, r.PersonId, r.Fields)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}

func handleAdd(svc NodeService) http.HandlerFunc {
	return jsonHandlerCtx(func(ctx context.Context, p apitypes.OrgNode) (*AddResponse, error) {
		created, working, pods, err := svc.Add(ctx, p)
		if err != nil {
			return nil, err
		}
		return &AddResponse{Created: created, Working: working, Pods: pods}, nil
	})
}

func handleAddParent(svc NodeService) http.HandlerFunc {
	type req struct {
		ChildId string `json:"childId"`
		Name    string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*AddResponse, error) {
		created, working, pods, err := svc.AddParent(ctx, r.ChildId, r.Name)
		if err != nil {
			return nil, err
		}
		return &AddResponse{Created: created, Working: working, Pods: pods}, nil
	})
}

func handleDelete(svc NodeService) http.HandlerFunc {
	type req struct {
		PersonId string `json:"personId"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*MutationResponse, error) {
		result, err := svc.Delete(ctx, r.PersonId)
		if err != nil {
			return nil, err
		}
		return &MutationResponse{Working: result.Working, Recycled: result.Recycled, Pods: result.Pods}, nil
	})
}

func handleGetRecycled(svc OrgStateService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.GetRecycled(r.Context()))
	}
}

func handleRestore(svc NodeService) http.HandlerFunc {
	type req struct {
		PersonId string `json:"personId"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*MutationResponse, error) {
		result, err := svc.Restore(ctx, r.PersonId)
		if err != nil {
			return nil, err
		}
		return &MutationResponse{Working: result.Working, Recycled: result.Recycled, Pods: result.Pods}, nil
	})
}

func handleEmptyBin(svc NodeService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		recycled := svc.EmptyBin(r.Context())
		writeJSON(w, http.StatusOK, RecycledResponse{Recycled: recycled})
	}
}

func handleExportPodsSidecar(svc PodService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pods, people := svc.GetPodExportData(r.Context())
		if len(pods) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := ExportPodsSidecarCSV(pods, people)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeFileResponse(w, data, "text/csv", "pods.csv")
	}
}

func handleExport(svc OrgStateService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		format := r.PathValue("format")
		working := svc.GetWorking(r.Context())
		if len(working) == 0 {
			writeError(w, http.StatusBadRequest, "no data loaded")
			return
		}

		data, contentType, filename, err := exportByFormat(format, working, "org")
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if data == nil {
			writeError(w, http.StatusBadRequest, "unsupported export format")
			return
		}

		writeFileResponse(w, data, contentType, filename)
	}
}

func handleExportSnapshot(svc SnapshotOps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		format := r.URL.Query().Get("format")

		people, err := svc.ExportSnapshot(r.Context(), name)
		if err != nil {
			serviceError(w, err)
			return
		}

		data, contentType, filename, err := exportByFormat(format, people, "snapshot")
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if data == nil {
			writeError(w, http.StatusBadRequest, "unsupported export format")
			return
		}

		writeFileResponse(w, data, contentType, filename)
	}
}

func handleListSnapshots(svc SnapshotOps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.ListSnapshots(r.Context()))
	}
}

func handleSaveSnapshot(svc SnapshotOps) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) ([]SnapshotInfo, error) {
		if err := svc.SaveSnapshot(ctx, r.Name); err != nil {
			return nil, err
		}
		return svc.ListSnapshots(ctx), nil
	})
}

func handleLoadSnapshot(svc SnapshotOps) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*OrgData, error) {
		return svc.LoadSnapshot(ctx, r.Name)
	})
}

func handleDeleteSnapshot(svc SnapshotOps) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) ([]SnapshotInfo, error) {
		if err := svc.DeleteSnapshot(ctx, r.Name); err != nil {
			return nil, err
		}
		return svc.ListSnapshots(ctx), nil
	})
}

func handleListPods(svc PodService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.ListPods(r.Context()))
	}
}

func handleUpdatePod(svc PodService) http.HandlerFunc {
	type req struct {
		PodId  string             `json:"podId"`
		Fields apitypes.PodUpdate `json:"fields"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.UpdatePod(ctx, r.PodId, r.Fields)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}

func handleCreatePod(svc PodService) http.HandlerFunc {
	type req struct {
		ManagerId string `json:"managerId"`
		Name      string `json:"name"`
		Team      string `json:"team"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.CreatePod(ctx, r.ManagerId, r.Name, r.Team)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}

func handleReset(svc OrgStateService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		orgData := svc.ResetToOriginal(r.Context())
		writeJSON(w, http.StatusOK, orgData)
	}
}

func handleCreate(svc OrgStateService) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*OrgData, error) {
		return svc.Create(ctx, r.Name)
	})
}

func handleReorder(svc NodeService) http.HandlerFunc {
	type req struct {
		PersonIds []string `json:"personIds"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.Reorder(ctx, r.PersonIds)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}

func handleGetSettings(svc SettingsService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.GetSettings(r.Context()))
	}
}

func handleUpdateSettings(svc SettingsService) http.HandlerFunc {
	return jsonHandlerCtx(func(ctx context.Context, settings apitypes.Settings) (apitypes.Settings, error) {
		return svc.UpdateSettings(ctx, settings)
	})
}

func handleExportSettingsSidecar(svc SettingsService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settings := svc.GetSettings(r.Context())
		if len(settings.DisciplineOrder) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := ExportSettingsSidecarCSV(settings)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeFileResponse(w, data, "text/csv", "settings.csv")
	}
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
			serviceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		logbuf.Logger().Error("writeJSON encode failed", "source", "api", "status", int64(status), "err", err.Error())
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
	case FormatCSV:
		data, err := ExportCSV(people)
		return data, "text/csv", baseName + ".csv", err
	case FormatXLSX:
		data, err := ExportXLSX(people)
		return data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", baseName + ".xlsx", err
	default:
		return nil, "", "", nil
	}
}

// limitBody wraps r.Body with a MaxBodySize limit.
func limitBody(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodySize)
}
