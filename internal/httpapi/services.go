package httpapi

import (
	"context"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/org"
	"github.com/zachthieme/grove/internal/snapshot"
)

// NodeService handles people mutations (move, update, add, delete, restore, reorder).
type NodeService interface {
	Move(ctx context.Context, personId, newManagerId, newTeam, newPod string) (*org.MoveResult, error)
	Update(ctx context.Context, personId string, fields apitypes.OrgNodeUpdate) (*org.MoveResult, error)
	Add(ctx context.Context, p apitypes.OrgNode) (apitypes.OrgNode, []apitypes.OrgNode, []apitypes.Pod, error)
	AddParent(ctx context.Context, childId, name string) (apitypes.OrgNode, []apitypes.OrgNode, []apitypes.Pod, error)
	Delete(ctx context.Context, personId string) (*org.MutationResult, error)
	Restore(ctx context.Context, personId string) (*org.MutationResult, error)
	EmptyBin(ctx context.Context) []apitypes.OrgNode
	Reorder(ctx context.Context, personIds []string) (*org.MoveResult, error)
}

// OrgStateService provides org-level reads and state resets (get, reset, restore).
type OrgStateService interface {
	GetOrg(ctx context.Context) *org.OrgData
	GetWorking(ctx context.Context) []apitypes.OrgNode
	GetRecycled(ctx context.Context) []apitypes.OrgNode
	ResetToOriginal(ctx context.Context) *org.OrgData
	RestoreState(ctx context.Context, data autosave.AutosaveData)
	Create(ctx context.Context, name string) (*org.OrgData, error)
}

// SnapshotOps is the HTTP-facing snapshot interface (handler-named methods).
type SnapshotOps interface {
	SaveSnapshot(ctx context.Context, name string) error
	LoadSnapshot(ctx context.Context, name string) (*org.OrgData, error)
	DeleteSnapshot(ctx context.Context, name string) error
	ListSnapshots(ctx context.Context) []snapshot.Info
	ExportSnapshot(ctx context.Context, name string) ([]apitypes.OrgNode, error)
}

// ImportService handles file uploads and column mapping confirmation.
type ImportService interface {
	Upload(ctx context.Context, filename string, data []byte) (*org.UploadResponse, error)
	ConfirmMapping(ctx context.Context, mapping map[string]string) (*org.OrgData, error)
	UploadZip(ctx context.Context, data []byte) (*org.UploadResponse, error)
}

// PodService manages pods and pod export data.
type PodService interface {
	ListPods(ctx context.Context) []apitypes.PodInfo
	UpdatePod(ctx context.Context, podID string, fields apitypes.PodUpdate) (*org.MoveResult, error)
	CreatePod(ctx context.Context, managerID, name, team string) (*org.MoveResult, error)
	GetPodExportData(ctx context.Context) ([]apitypes.Pod, []apitypes.OrgNode)
}

// SettingsService manages application settings.
type SettingsService interface {
	GetSettings(ctx context.Context) apitypes.Settings
	UpdateSettings(ctx context.Context, settings apitypes.Settings) (apitypes.Settings, error)
}

// Services groups all domain interfaces for the HTTP router.
type Services struct {
	People   NodeService
	Pods     PodService
	Snaps    SnapshotOps // renamed from SnapshotService
	Import   ImportService
	Settings SettingsService
	Org      OrgStateService
}

// NewServices creates a Services from an *org.OrgService (which satisfies all interfaces).
func NewServices(svc *org.OrgService) Services {
	return Services{
		People:   svc,
		Pods:     svc,
		Snaps:    svc,
		Import:   svc,
		Settings: svc,
		Org:      svc,
	}
}

// Compile-time assertions: *org.OrgService satisfies all domain interfaces.
// snapshot.Clearer is satisfied by *snapshot.Service (asserted in the
// snapshot package itself). snapshot.Service has no callback into org —
// OrgService orchestrates Save/Load by passing OrgState by value.
var (
	_ NodeService     = (*org.OrgService)(nil)
	_ OrgStateService = (*org.OrgService)(nil)
	_ SnapshotOps     = (*org.OrgService)(nil)
	_ ImportService   = (*org.OrgService)(nil)
	_ PodService      = (*org.OrgService)(nil)
	_ SettingsService = (*org.OrgService)(nil)
)
