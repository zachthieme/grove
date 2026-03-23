package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
)

func NewRouter(svc *OrgService) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("POST /api/upload", handleUpload(svc))
	mux.HandleFunc("POST /api/upload/confirm", handleConfirmMapping(svc))
	mux.HandleFunc("GET /api/org", handleGetOrg(svc))
	mux.HandleFunc("POST /api/move", handleMove(svc))
	mux.HandleFunc("POST /api/update", handleUpdate(svc))
	mux.HandleFunc("POST /api/add", handleAdd(svc))
	mux.HandleFunc("POST /api/delete", handleDelete(svc))
	mux.HandleFunc("GET /api/recycled", handleGetRecycled(svc))
	mux.HandleFunc("POST /api/restore", handleRestore(svc))
	mux.HandleFunc("POST /api/empty-bin", handleEmptyBin(svc))
	mux.HandleFunc("GET /api/export/snapshot", handleExportSnapshot(svc))
	mux.HandleFunc("GET /api/export/{format}", handleExport(svc))

	mux.HandleFunc("GET /api/snapshots", handleListSnapshots(svc))
	mux.HandleFunc("POST /api/snapshots/save", handleSaveSnapshot(svc))
	mux.HandleFunc("POST /api/snapshots/load", handleLoadSnapshot(svc))
	mux.HandleFunc("POST /api/snapshots/delete", handleDeleteSnapshot(svc))

	mux.HandleFunc("POST /api/reset", handleReset(svc))
	mux.HandleFunc("POST /api/reorder", handleReorder(svc))

	mux.HandleFunc("POST /api/autosave", handleWriteAutosave())
	mux.HandleFunc("GET /api/autosave", handleReadAutosave())
	mux.HandleFunc("DELETE /api/autosave", handleDeleteAutosave())

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

func handleConfirmMapping(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

func handleMove(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonId     string `json:"personId"`
			NewManagerId string `json:"newManagerId"`
			NewTeam      string `json:"newTeam"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		working, err := svc.Move(req.PersonId, req.NewManagerId, req.NewTeam)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, working)
	}
}

func handleUpdate(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonId string            `json:"personId"`
			Fields   map[string]string `json:"fields"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		working, err := svc.Update(req.PersonId, req.Fields)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, working)
	}
}

func handleAdd(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p Person
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		_, working, err := svc.Add(p)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, working)
	}
}

func handleDelete(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonId string `json:"personId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := svc.Delete(req.PersonId); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"working":  svc.GetWorking(),
			"recycled": svc.GetRecycled(),
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
		var req struct {
			PersonId string `json:"personId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := svc.Restore(req.PersonId); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"working":  svc.GetWorking(),
			"recycled": svc.GetRecycled(),
		})
	}
}

func handleEmptyBin(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		svc.EmptyBin()
		writeJSON(w, http.StatusOK, map[string]any{
			"recycled": svc.GetRecycled(),
		})
	}
}

func handleExport(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		format := r.PathValue("format")
		working := svc.GetWorking()
		if working == nil {
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
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		svc.DeleteSnapshot(req.Name)
		writeJSON(w, http.StatusOK, svc.ListSnapshots())
	}
}

func handleReset(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orgData := svc.ResetToOriginal()
		writeJSON(w, http.StatusOK, orgData)
	}
}

func handleReorder(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonIds []string `json:"personIds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		working, err := svc.Reorder(req.PersonIds)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, working)
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
