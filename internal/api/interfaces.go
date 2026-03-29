package api

import "context"

// PersonService handles people mutations (move, update, add, delete, restore, reorder).
type PersonService interface {
	Move(ctx context.Context, personId, newManagerId, newTeam string, newPod ...string) (*MoveResult, error)
	Update(ctx context.Context, personId string, fields map[string]string) (*MoveResult, error)
	Add(ctx context.Context, p Person) (Person, []Person, []Pod, error)
	Delete(ctx context.Context, personId string) (*MutationResult, error)
	Restore(ctx context.Context, personId string) (*MutationResult, error)
	EmptyBin(ctx context.Context) []Person
	Reorder(ctx context.Context, personIds []string) (*MoveResult, error)
}

// OrgStateService provides org-level reads and state resets (get, reset, restore).
type OrgStateService interface {
	GetOrg(ctx context.Context) *OrgData
	GetWorking(ctx context.Context) []Person
	GetRecycled(ctx context.Context) []Person
	ResetToOriginal(ctx context.Context) *OrgData
	RestoreState(ctx context.Context, data AutosaveData)
}

// SnapshotService manages named save points.
type SnapshotService interface {
	SaveSnapshot(ctx context.Context, name string) error
	LoadSnapshot(ctx context.Context, name string) (*OrgData, error)
	DeleteSnapshot(ctx context.Context, name string) error
	ListSnapshots(ctx context.Context) []SnapshotInfo
	ExportSnapshot(ctx context.Context, name string) ([]Person, error)
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
	UpdatePod(ctx context.Context, podID string, fields map[string]string) (*MoveResult, error)
	CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error)
	GetPodExportData(ctx context.Context) ([]Pod, []Person)
}

// SettingsService manages application settings.
type SettingsService interface {
	GetSettings(ctx context.Context) Settings
	UpdateSettings(ctx context.Context, settings Settings) (Settings, error)
}

// Services groups all domain interfaces for the HTTP router.
type Services struct {
	People   PersonService
	Pods     PodService
	Snaps    SnapshotService
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
	_ PersonService   = (*OrgService)(nil)
	_ OrgStateService       = (*OrgService)(nil)
	_ SnapshotService = (*OrgService)(nil)
	_ ImportService   = (*OrgService)(nil)
	_ PodService      = (*OrgService)(nil)
	_ SettingsService = (*OrgService)(nil)
)
