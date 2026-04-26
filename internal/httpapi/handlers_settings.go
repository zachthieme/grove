package httpapi

import (
	"context"
	"net/http"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/org"
)

func handleGetSettings(svc SettingsService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, svc.GetSettings(r.Context()))
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
		data, err := org.ExportSettingsSidecarCSV(settings)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeFileResponse(w, data, "text/csv", "settings.csv")
	}
}
