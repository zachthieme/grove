package httpapi

import (
	"context"
	"net/http"

	"github.com/zachthieme/grove/internal/org"
)

func handleUpload(svc ImportService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, filename, ok := readUploadedFile(w, r)
		if !ok {
			return
		}
		resp, err := svc.Upload(r.Context(), filename, data)
		if err != nil {
			org.ServiceError(w, err)
			return
		}
		writeJSON(w, resp)
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
			org.ServiceError(w, err)
			return
		}
		writeJSON(w, resp)
	}
}

func handleConfirmMapping(svc ImportService) http.HandlerFunc {
	type req struct {
		Mapping map[string]string `json:"mapping"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*org.OrgData, error) {
		return svc.ConfirmMapping(ctx, r.Mapping)
	})
}
