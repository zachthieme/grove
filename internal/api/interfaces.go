package api

import "context"

// NodeService handles people mutations (move, update, add, delete, restore, reorder).
type NodeService interface {
	Move(ctx context.Context, personId, newManagerId, newTeam, newPod string) (*MoveResult, error)
	Update(ctx context.Context, personId string, fields OrgNodeUpdate) (*MoveResult, error)
	Add(ctx context.Context, p OrgNode) (OrgNode, []OrgNode, []Pod, error)
	AddParent(ctx context.Context, childId, name string) (OrgNode, []OrgNode, []Pod, error)
	Delete(ctx context.Context, personId string) (*MutationResult, error)
	Restore(ctx context.Context, personId string) (*MutationResult, error)
	EmptyBin(ctx context.Context) []OrgNode
	Reorder(ctx context.Context, personIds []string) (*MoveResult, error)
}

// OrgStateService provides org-level reads and state resets (get, reset, restore).
type OrgStateService interface {
	GetOrg(ctx context.Context) *OrgData
	GetWorking(ctx context.Context) []OrgNode
	GetRecycled(ctx context.Context) []OrgNode
	ResetToOriginal(ctx context.Context) *OrgData
	RestoreState(ctx context.Context, data AutosaveData)
	Create(ctx context.Context, name string) (*OrgData, error)
}

// SnapshotOps is the HTTP-facing snapshot interface (handler-named methods).
type SnapshotOps interface {
	SaveSnapshot(ctx context.Context, name string) error
	LoadSnapshot(ctx context.Context, name string) (*OrgData, error)
	DeleteSnapshot(ctx context.Context, name string) error
	ListSnapshots(ctx context.Context) []SnapshotInfo
	ExportSnapshot(ctx context.Context, name string) ([]OrgNode, error)
}

// ImportService handles file uploads and column mapping confirmation.
type ImportService interface {
	Upload(ctx context.Context, filename string, data []byte) (*UploadResponse, error)
	ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error)
	UploadZip(ctx context.Context, data []byte) (*UploadResponse, error)
}

// PodService manages pods and pod export data.
type PodService interface {
	ListPods(ctx context.Context) []PodInfo
	UpdatePod(ctx context.Context, podID string, fields PodUpdate) (*MoveResult, error)
	CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error)
	GetPodExportData(ctx context.Context) ([]Pod, []OrgNode)
}

// SettingsService manages application settings.
type SettingsService interface {
	GetSettings(ctx context.Context) Settings
	UpdateSettings(ctx context.Context, settings Settings) (Settings, error)
}

// Services groups all domain interfaces for the HTTP router.
type Services struct {
	People   NodeService
	Pods     PodService
	Snaps    SnapshotOps    // renamed from SnapshotService
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
)
