package api

import (
	"context"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/snapshot"
)

// NodeService handles people mutations (move, update, add, delete, restore, reorder).
type NodeService interface {
	Move(ctx context.Context, personId, newManagerId, newTeam, newPod string) (*MoveResult, error)
	Update(ctx context.Context, personId string, fields apitypes.OrgNodeUpdate) (*MoveResult, error)
	Add(ctx context.Context, p apitypes.OrgNode) (apitypes.OrgNode, []apitypes.OrgNode, []apitypes.Pod, error)
	AddParent(ctx context.Context, childId, name string) (apitypes.OrgNode, []apitypes.OrgNode, []apitypes.Pod, error)
	Delete(ctx context.Context, personId string) (*MutationResult, error)
	Restore(ctx context.Context, personId string) (*MutationResult, error)
	EmptyBin(ctx context.Context) []apitypes.OrgNode
	Reorder(ctx context.Context, personIds []string) (*MoveResult, error)
}

// OrgStateService provides org-level reads and state resets (get, reset, restore).
type OrgStateService interface {
	GetOrg(ctx context.Context) *OrgData
	GetWorking(ctx context.Context) []apitypes.OrgNode
	GetRecycled(ctx context.Context) []apitypes.OrgNode
	ResetToOriginal(ctx context.Context) *OrgData
	RestoreState(ctx context.Context, data autosave.AutosaveData)
	Create(ctx context.Context, name string) (*OrgData, error)
}

// SnapshotOps is the HTTP-facing snapshot interface (handler-named methods).
type SnapshotOps interface {
	SaveSnapshot(ctx context.Context, name string) error
	LoadSnapshot(ctx context.Context, name string) (*OrgData, error)
	DeleteSnapshot(ctx context.Context, name string) error
	ListSnapshots(ctx context.Context) []snapshot.Info
	ExportSnapshot(ctx context.Context, name string) ([]apitypes.OrgNode, error)
}

// ImportService handles file uploads and column mapping confirmation.
type ImportService interface {
	Upload(ctx context.Context, filename string, data []byte) (*UploadResponse, error)
	ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error)
	UploadZip(ctx context.Context, data []byte) (*UploadResponse, error)
}

// PodService manages pods and pod export data.
type PodService interface {
	ListPods(ctx context.Context) []apitypes.PodInfo
	UpdatePod(ctx context.Context, podID string, fields apitypes.PodUpdate) (*MoveResult, error)
	CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error)
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

// NewServices creates a Services from an *OrgService (which satisfies all interfaces).
func NewServices(svc *OrgService) Services {
	return Services{
		People:   svc,
		Pods:     svc,
		Snaps:    svc,
		Import:   svc,
		Settings: svc,
		Org:      svc,
	}
}

// Compile-time assertions: *OrgService satisfies all domain interfaces.
var (
	_ NodeService     = (*OrgService)(nil)
	_ OrgStateService = (*OrgService)(nil)
	_ SnapshotOps     = (*OrgService)(nil) // was SnapshotService
	_ ImportService   = (*OrgService)(nil)
	_ PodService      = (*OrgService)(nil)
	_ SettingsService = (*OrgService)(nil)

	// Bridge interface consumed by the snapshot package: *OrgService is the
	// concrete OrgStateProvider implementation. snapshot.Clearer is satisfied
	// by *snapshot.Service (asserted in the snapshot package itself).
	_ snapshot.OrgStateProvider = (*OrgService)(nil)
)
