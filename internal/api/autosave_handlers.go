package api

import (
	"encoding/json"
	"net/http"
)

func handleWriteAutosave(store AutosaveStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var data AutosaveData
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := store.Write(data); err != nil {
			Logger().Error("autosave write failed", "source", "autosave", "op", "write", "err", err.Error())
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		Logger().Debug("autosave written", "source", "autosave", "people", len(data.Working), "pods", len(data.Pods))
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleReadAutosave(store AutosaveStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := store.Read()
		if err != nil {
			Logger().Error("autosave read failed", "source", "autosave", "op", "read", "err", err.Error())
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if data == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, http.StatusOK, data)
	}
}

func handleDeleteAutosave(store AutosaveStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := store.Delete(); err != nil {
			Logger().Error("autosave delete failed", "source", "autosave", "op", "delete", "err", err.Error())
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
