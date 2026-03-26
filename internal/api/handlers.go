package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
)

func NewRouter(svc *OrgService, logBuf *LogBuffer, autoStore AutosaveStore) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("POST /api/upload", handleUpload(svc))
	mux.HandleFunc("POST /api/upload/confirm", handleConfirmMapping(svc))
	mux.HandleFunc("POST /api/upload/zip", handleUploadZip(svc))
	mux.HandleFunc("GET /api/org", handleGetOrg(svc))
	mux.HandleFunc("POST /api/move", handleMove(svc))
	mux.HandleFunc("POST /api/update", handleUpdate(svc))
	mux.HandleFunc("POST /api/add", handleAdd(svc))
	mux.HandleFunc("POST /api/delete", handleDelete(svc))
	mux.HandleFunc("GET /api/recycled", handleGetRecycled(svc))
	mux.HandleFunc("POST /api/restore", handleRestore(svc))
	mux.HandleFunc("POST /api/empty-bin", handleEmptyBin(svc))
	mux.HandleFunc("GET /api/export/pods-sidecar", handleExportPodsSidecar(svc))
	mux.HandleFunc("GET /api/export/snapshot", handleExportSnapshot(svc))
	mux.HandleFunc("GET /api/export/{format}", handleExport(svc))

	mux.HandleFunc("GET /api/snapshots", handleListSnapshots(svc))
	mux.HandleFunc("POST /api/snapshots/save", handleSaveSnapshot(svc))
	mux.HandleFunc("POST /api/snapshots/load", handleLoadSnapshot(svc))
	mux.HandleFunc("POST /api/snapshots/delete", handleDeleteSnapshot(svc))

	mux.HandleFunc("GET /api/pods", handleListPods(svc))
	mux.HandleFunc("POST /api/pods/update", handleUpdatePod(svc))
	mux.HandleFunc("POST /api/pods/create", handleCreatePod(svc))

	mux.HandleFunc("POST /api/reset", handleReset(svc))
	mux.HandleFunc("POST /api/reorder", handleReorder(svc))

	mux.HandleFunc("GET /api/settings", handleGetSettings(svc))
	mux.HandleFunc("POST /api/settings", handleUpdateSettings(svc))
	mux.HandleFunc("GET /api/export/settings-sidecar", handleExportSettingsSidecar(svc))

	mux.HandleFunc("POST /api/restore-state", handleRestoreState(svc))
	mux.HandleFunc("POST /api/autosave", handleWriteAutosave(autoStore))
	mux.HandleFunc("GET /api/autosave", handleReadAutosave(autoStore))
	mux.HandleFunc("DELETE /api/autosave", handleDeleteAutosave(autoStore))

	// Config endpoint — always registered
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"logging": logBuf != nil})
	})

	// Log endpoints — only when logging is enabled
	if logBuf != nil {
		mux.HandleFunc("GET /api/logs", handleGetLogs(logBuf))
		mux.HandleFunc("POST /api/logs", handlePostLog(logBuf))
		mux.HandleFunc("DELETE /api/logs", handleDeleteLogs(logBuf))
	}

	return mux
}

func handleUpload(svc *OrgService) http.HandlerFunc {
	const maxUploadSize = 50 << 20 // 50 MB
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "missing file field or file too large (max 50MB)")
			return
		}
		defer func() { _ = file.Close() }()

		data, err := io.ReadAll(file)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "reading file")
			return
		}

		resp, err := svc.Upload(header.Filename, data)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func handleUploadZip(svc *OrgService) http.HandlerFunc {
	const maxUploadSize = 50 << 20
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		file, _, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "missing file field or file too large (max 50MB)")
			return
		}
		defer func() { _ = file.Close() }()

		data, err := io.ReadAll(file)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "reading file")
			return
		}

		resp, err := svc.UploadZip(data)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func handleConfirmMapping(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			Mapping map[string]string `json:"mapping"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		orgData, err := svc.ConfirmMapping(req.Mapping)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, orgData)
	}
}

func handleGetOrg(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := svc.GetOrg()
		if data == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, http.StatusOK, data)
	}
}

func handleRestoreState(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var data AutosaveData
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		svc.RestoreState(data)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleMove(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PersonId     string `json:"personId"`
			NewManagerId string `json:"newManagerId"`
			NewTeam      string `json:"newTeam"`
			NewPod       string `json:"newPod"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.Move(req.PersonId, req.NewManagerId, req.NewTeam, req.NewPod)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"working": result.Working, "pods": result.Pods})
	}
}

func handleUpdate(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PersonId string            `json:"personId"`
			Fields   map[string]string `json:"fields"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.Update(req.PersonId, req.Fields)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"working": result.Working, "pods": result.Pods})
	}
}

func handleAdd(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var p Person
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		created, working, pods, err := svc.Add(p)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"created": created,
			"working": working,
			"pods":    pods,
		})
	}
}

func handleDelete(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PersonId string `json:"personId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.Delete(req.PersonId)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"working":  result.Working,
			"recycled": result.Recycled,
			"pods":     result.Pods,
		})
	}
}

func handleGetRecycled(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.GetRecycled())
	}
}

func handleRestore(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PersonId string `json:"personId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.Restore(req.PersonId)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"working":  result.Working,
			"recycled": result.Recycled,
			"pods":     result.Pods,
		})
	}
}

func handleEmptyBin(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		recycled := svc.EmptyBin()
		writeJSON(w, http.StatusOK, map[string]any{
			"recycled": recycled,
		})
	}
}

func handleExportPodsSidecar(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		svc.mu.RLock()
		pods := CopyPods(svc.pods)
		people := deepCopyPeople(svc.working)
		svc.mu.RUnlock()
		if len(pods) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := ExportPodsSidecarCSV(pods, people)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=pods.csv")
		w.Write(data)
	}
}

func handleExport(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		format := r.PathValue("format")
		working := svc.GetWorking()
		if len(working) == 0 {
			writeError(w, http.StatusBadRequest, "no data loaded")
			return
		}

		var (
			data        []byte
			err         error
			contentType string
			filename    string
		)

		switch format {
		case "csv":
			data, err = ExportCSV(working)
			contentType = "text/csv"
			filename = "org.csv"
		case "xlsx":
			data, err = ExportXLSX(working)
			contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
			filename = "org.xlsx"
		default:
			writeError(w, http.StatusBadRequest, "unsupported export format")
			return
		}

		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", "attachment; filename="+filename)
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		if _, err := w.Write(data); err != nil {
			log.Printf("export write error (client disconnect?): %v", err)
		}
	}
}

func handleExportSnapshot(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		format := r.URL.Query().Get("format")

		people, err := svc.ExportSnapshot(name)
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}

		var (
			data        []byte
			contentType string
			filename    string
		)

		switch format {
		case "csv":
			data, err = ExportCSV(people)
			contentType = "text/csv"
			filename = "snapshot.csv"
		case "xlsx":
			data, err = ExportXLSX(people)
			contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
			filename = "snapshot.xlsx"
		default:
			writeError(w, http.StatusBadRequest, "unsupported export format")
			return
		}

		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", "attachment; filename="+filename)
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		if _, err := w.Write(data); err != nil {
			log.Printf("snapshot export write error: %v", err)
		}
	}
}

func handleListSnapshots(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.ListSnapshots())
	}
}

func handleSaveSnapshot(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := svc.SaveSnapshot(req.Name); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, svc.ListSnapshots())
	}
}

func handleLoadSnapshot(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		orgData, err := svc.LoadSnapshot(req.Name)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, orgData)
	}
}

func handleDeleteSnapshot(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := svc.DeleteSnapshot(req.Name); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, svc.ListSnapshots())
	}
}

func handleListPods(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.ListPods())
	}
}

func handleUpdatePod(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PodId  string            `json:"podId"`
			Fields map[string]string `json:"fields"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.UpdatePod(req.PodId, req.Fields)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"working": result.Working, "pods": result.Pods})
	}
}

func handleCreatePod(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			ManagerId string `json:"managerId"`
			Name      string `json:"name"`
			Team      string `json:"team"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.CreatePod(req.ManagerId, req.Name, req.Team)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"working": result.Working, "pods": result.Pods})
	}
}

func handleReset(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		orgData := svc.ResetToOriginal()
		writeJSON(w, http.StatusOK, orgData)
	}
}

func handleReorder(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PersonIds []string `json:"personIds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.Reorder(req.PersonIds)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"working": result.Working, "pods": result.Pods})
	}
}

func handleGetSettings(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.GetSettings())
	}
}

func handleUpdateSettings(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var settings Settings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result := svc.UpdateSettings(settings)
		writeJSON(w, http.StatusOK, result)
	}
}

func handleExportSettingsSidecar(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settings := svc.GetSettings()
		if len(settings.DisciplineOrder) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := ExportSettingsSidecarCSV(settings)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=settings.csv")
		w.Write(data)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON encode error: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]string{"error": msg}); err != nil {
		log.Printf("writeError encode error: %v", err)
	}
}

// limitBody wraps r.Body with a 1 MB size limit.
func limitBody(w http.ResponseWriter, r *http.Request) {
	const maxBodySize = 1 << 20 // 1 MB
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
}
