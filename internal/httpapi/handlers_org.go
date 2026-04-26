package httpapi

import (
	"context"
	"net/http"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/org"
)

func handleGetOrg(svc OrgStateService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := svc.GetOrg(r.Context())
		if data == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, data)
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
		writeJSON(w, svc.GetRecycled(r.Context()))
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
		writeJSON(w, RecycledResponse{Recycled: recycled})
	}
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

func handleReset(svc OrgStateService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		orgData := svc.ResetToOriginal(r.Context())
		writeJSON(w, orgData)
	}
}

func handleCreate(svc OrgStateService) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*org.OrgData, error) {
		return svc.Create(ctx, r.Name)
	})
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
