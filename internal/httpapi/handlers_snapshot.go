package httpapi

import (
	"context"
	"net/http"

	"github.com/zachthieme/grove/internal/org"
	"github.com/zachthieme/grove/internal/snapshot"
)

func handleListSnapshots(svc SnapshotOps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, svc.ListSnapshots(r.Context()))
	}
}

func handleSaveSnapshot(svc SnapshotOps) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) ([]snapshot.Info, error) {
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
	return jsonHandlerCtx(func(ctx context.Context, r req) (*org.OrgData, error) {
		return svc.LoadSnapshot(ctx, r.Name)
	})
}

func handleDeleteSnapshot(svc SnapshotOps) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) ([]snapshot.Info, error) {
		if err := svc.DeleteSnapshot(ctx, r.Name); err != nil {
			return nil, err
		}
		return svc.ListSnapshots(ctx), nil
	})
}

func handleExportSnapshot(svc SnapshotOps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		format := r.URL.Query().Get("format")

		people, err := svc.ExportSnapshot(r.Context(), name)
		if err != nil {
			org.ServiceError(w, err)
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
