package httpapi

import (
	"context"
	"net/http"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/org"
)

func handleListPods(svc PodService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, svc.ListPods(r.Context()))
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

func handleExportPodsSidecar(svc PodService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pods, people := svc.GetPodExportData(r.Context())
		if len(pods) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := org.ExportPodsSidecarCSV(pods, people)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeFileResponse(w, data, "text/csv", "pods.csv")
	}
}
