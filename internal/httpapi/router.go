package httpapi

import (
	"net/http"

	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/logbuf"
)

func NewRouter(svcs Services, logBuf *logbuf.LogBuffer, autoStore autosave.AutosaveStore) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, HealthResponse{Status: "ok"})
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
		writeJSON(w, ConfigResponse{Logging: logBuf != nil})
	})

	// Log endpoints — only when logging is enabled
	if logBuf != nil {
		mux.HandleFunc("GET /api/logs", handleGetLogs(logBuf))
		mux.HandleFunc("POST /api/logs", handlePostLog(logBuf))
		mux.HandleFunc("DELETE /api/logs", handleDeleteLogs(logBuf))
	}

	return csrfProtect(mux)
}
