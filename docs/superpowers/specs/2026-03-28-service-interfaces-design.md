# OrgService Interface Decomposition

**Issue:** #44
**Scope:** Phase 1-2 only (define interfaces, update handlers). No structural split.

## Problem

`OrgService` is a 27-method god object. Handlers couple to the concrete struct, making it impossible to test a handler without constructing a full service with snapshot stores and uploading CSV data. Adding a feature in one domain (e.g., pods) requires understanding all domains because there are no explicit boundaries.

## Design

### 6 Domain Interfaces

Define in `internal/api/interfaces.go`:

```go
type PersonService interface {
    Move(ctx context.Context, personId, newManagerId, newTeam string, newPod ...string) (*MoveResult, error)
    Update(ctx context.Context, personId string, fields map[string]string) (*MoveResult, error)
    Add(ctx context.Context, p Person) (Person, []Person, []Pod, error)
    Delete(ctx context.Context, personId string) (*MutationResult, error)
    Restore(ctx context.Context, personId string) (*MutationResult, error)
    EmptyBin(ctx context.Context) []Person
    Reorder(ctx context.Context, personIds []string) (*MoveResult, error)
}

type OrgReader interface {
    GetOrg(ctx context.Context) *OrgData
    GetWorking(ctx context.Context) []Person
    GetRecycled(ctx context.Context) []Person
    ResetToOriginal(ctx context.Context) *OrgData
    RestoreState(ctx context.Context, data AutosaveData)
}

type SnapshotService interface {
    SaveSnapshot(ctx context.Context, name string) error
    LoadSnapshot(ctx context.Context, name string) (*OrgData, error)
    DeleteSnapshot(ctx context.Context, name string) error
    ListSnapshots(ctx context.Context) []SnapshotInfo
    ExportSnapshot(ctx context.Context, name string) ([]Person, error)
}

type ImportService interface {
    Upload(ctx context.Context, filename string, data []byte) (*UploadResponse, error)
    ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error)
    UploadZip(ctx context.Context, data []byte) (*UploadResponse, error)
}

type PodService interface {
    ListPods(ctx context.Context) []PodInfo
    UpdatePod(ctx context.Context, podID string, fields map[string]string) (*MoveResult, error)
    CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error)
    GetPodExportData(ctx context.Context) ([]Pod, []Person)
}

type SettingsService interface {
    GetSettings(ctx context.Context) Settings
    UpdateSettings(ctx context.Context, settings Settings) (Settings, error)
}
```

`OrgService` already satisfies all of these except `GetPodExportData`, which is new.

### Services Struct

```go
type Services struct {
    People   PersonService
    Pods     PodService
    Snaps    SnapshotService
    Import   ImportService
    Settings SettingsService
    Org      OrgReader
}
```

### NewRouter Change

```go
// Before:
func NewRouter(svc *OrgService, logBuf *LogBuffer, autoStore AutosaveStore) http.Handler

// After:
func NewRouter(svcs Services, logBuf *LogBuffer, autoStore AutosaveStore) http.Handler
```

Each handler closure captures the specific interface it needs:

```go
mux.HandleFunc("POST /api/move", handleMove(svcs.People))
mux.HandleFunc("GET /api/org", handleGetOrg(svcs.Org))
mux.HandleFunc("GET /api/pods", handleListPods(svcs.Pods))
```

### New Method: GetPodExportData

Replaces direct field access in `handleExportPodsSidecar`:

```go
func (s *OrgService) GetPodExportData(ctx context.Context) ([]Pod, []Person) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    return CopyPods(s.podMgr.GetPods()), deepCopyPeople(s.working)
}
```

### cmd/serve.go Change

```go
svc := api.NewOrgService(api.FileSnapshotStore{})
svcs := api.Services{
    People:   svc,
    Pods:     svc,
    Snaps:    svc,
    Import:   svc,
    Settings: svc,
    Org:      svc,
}
apiRouter := api.NewRouter(svcs, logBuf, autoStore)
```

### Handler Signature Changes

Each handler function changes from `*OrgService` to the minimal interface:

| Handler | Before | After |
|---------|--------|-------|
| handleMove | `*OrgService` | `PersonService` |
| handleUpdate | `*OrgService` | `PersonService` |
| handleAdd | `*OrgService` | `PersonService` |
| handleDelete | `*OrgService` | `PersonService` |
| handleRestore | `*OrgService` | `PersonService` |
| handleEmptyBin | `*OrgService` | `PersonService` |
| handleReorder | `*OrgService` | `PersonService` |
| handleGetOrg | `*OrgService` | `OrgReader` |
| handleGetRecycled | `*OrgService` | `OrgReader` |
| handleReset | `*OrgService` | `OrgReader` |
| handleRestoreState | `*OrgService` | `OrgReader` |
| handleExport | `*OrgService` | `OrgReader` |
| handleUpload | `*OrgService` | `ImportService` |
| handleConfirmMapping | `*OrgService` | `ImportService` |
| handleUploadZip | `*OrgService` | `ImportService` |
| handleListSnapshots | `*OrgService` | `SnapshotService` |
| handleSaveSnapshot | `*OrgService` | `SnapshotService` |
| handleLoadSnapshot | `*OrgService` | `SnapshotService` |
| handleDeleteSnapshot | `*OrgService` | `SnapshotService` |
| handleExportSnapshot | `*OrgService` | `SnapshotService` |
| handleListPods | `*OrgService` | `PodService` |
| handleUpdatePod | `*OrgService` | `PodService` |
| handleCreatePod | `*OrgService` | `PodService` |
| handleExportPodsSidecar | `*OrgService` | `PodService` |
| handleGetSettings | `*OrgService` | `SettingsService` |
| handleUpdateSettings | `*OrgService` | `SettingsService` |
| handleExportSettingsSidecar | `*OrgService` | `SettingsService` |

## Testing

All existing tests continue to pass unchanged — they construct `*OrgService` directly and pass it to `NewRouter` via a `Services` struct where every field is the same `svc`. No new tests required for the refactor itself, but the interfaces now enable future handler tests with focused mocks.

## Files Changed

| File | Change |
|------|--------|
| `internal/api/interfaces.go` | New: 6 interfaces + Services struct |
| `internal/api/handlers.go` | NewRouter accepts Services; handlers accept interfaces |
| `internal/api/service_pods.go` | New: GetPodExportData method |
| `cmd/serve.go` | Construct Services struct from *OrgService |
| `internal/api/*_test.go` | Update NewRouter calls to pass Services struct |
| `integration_test.go` | Update NewRouter call |

## Not In Scope

- Splitting OrgService into separate structs (Phase 3)
- Independent locking per domain
- Typed update request structs (#45)
