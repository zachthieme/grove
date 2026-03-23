package api

import (
	"encoding/json"
	"net/http"
)

func handleWriteAutosave() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var data AutosaveData
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := WriteAutosave(data); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleReadAutosave() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := ReadAutosave()
		if err != nil {
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

func handleDeleteAutosave() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := DeleteAutosave(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
