# OrgService Interface Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the OrgService god object into 6 domain interfaces so handlers depend on minimal contracts, not the full 27-method concrete struct.

**Architecture:** Define 6 interfaces (PersonService, OrgReader, SnapshotService, ImportService, PodService, SettingsService) in a new `interfaces.go` file. Group them into a `Services` struct. Change `NewRouter` to accept `Services` instead of `*OrgService`. Each handler closure captures only the interface it needs. Add a `NewServices` constructor that takes `*OrgService` and returns a `Services` where every field points to it. Add one new method (`GetPodExportData`) so `handleExportPodsSidecar` stops reaching into internal fields.

**Tech Stack:** Go 1.22, standard library only

---

### Task 1: Add GetPodExportData method

The handler `handleExportPodsSidecar` currently reaches into `svc.mu` and `svc.podMgr` directly. Add a proper method so it can go through an interface.

**Files:**
- Modify: `internal/api/service_pods.go`
- Test: `internal/api/handlers_test.go` (existing tests cover the endpoint)

- [ ] **Step 1: Add GetPodExportData to service_pods.go**

Add after the `CreatePod` method at the end of the file:

```go
// GetPodExportData returns a copy of pods and working people for export.
func (s *OrgService) GetPodExportData(ctx context.Context) ([]Pod, []Person) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return CopyPods(s.podMgr.GetPods()), deepCopyPeople(s.working)
}
```

- [ ] **Step 2: Update handleExportPodsSidecar to use the new method**

In `internal/api/handlers.go`, replace the current `handleExportPodsSidecar` (lines 228-245):

```go
func handleExportPodsSidecar(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pods, people := svc.GetPodExportData(r.Context())
		if len(pods) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := ExportPodsSidecarCSV(pods, people)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeFileResponse(w, data, "text/csv", "pods.csv")
	}
}
```

- [ ] **Step 3: Run tests to verify no breakage**

Run: `go test ./internal/api/ -run TestExportPodsSidecar -v`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `go test ./...`
Expected: All PASS

- [ ] **Step 5: Commit**

```
feat: add GetPodExportData method to encapsulate pod export access
```

---

### Task 2: Create interfaces.go with 6 domain interfaces and Services struct

**Files:**
- Create: `internal/api/interfaces.go`

- [ ] **Step 1: Create interfaces.go**

```go
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

// OrgReader provides read access to org state and state-level mutations (reset, restore).
type OrgReader interface {
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
	Org      OrgReader
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
```

- [ ] **Step 2: Verify it compiles**

Run: `go build ./internal/api/`
Expected: Success (OrgService implicitly satisfies all 6 interfaces)

- [ ] **Step 3: Commit**

```
refactor: define 6 domain interfaces and Services struct for OrgService
```

---

### Task 3: Update NewRouter to accept Services struct

Change `NewRouter` signature and update each handler call to use the appropriate interface field. Update all handler function signatures from `*OrgService` to the specific interface.

**Files:**
- Modify: `internal/api/handlers.go`

- [ ] **Step 1: Change NewRouter signature and route registrations**

Replace the current `NewRouter` function signature and the route registration block (lines 13-69). The handler signatures change from `*OrgService` to the specific interface:

```go
func NewRouter(svcs Services, logBuf *LogBuffer, autoStore AutosaveStore) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, HealthResponse{Status: "ok"})
	})

	mux.HandleFunc("POST /api/upload", handleUpload(svcs.Import))
	mux.HandleFunc("POST /api/upload/confirm", handleConfirmMapping(svcs.Import))
	mux.HandleFunc("POST /api/upload/zip", handleUploadZip(svcs.Import))
	mux.HandleFunc("GET /api/org", handleGetOrg(svcs.Org))
	mux.HandleFunc("POST /api/move", handleMove(svcs.People))
	mux.HandleFunc("POST /api/update", handleUpdate(svcs.People))
	mux.HandleFunc("POST /api/add", handleAdd(svcs.People))
	mux.HandleFunc("POST /api/delete", handleDelete(svcs.People))
	mux.HandleFunc("GET /api/recycled", handleGetRecycled(svcs.Org))
	mux.HandleFunc("POST /api/restore", handleRestore(svcs.People))
	mux.HandleFunc("POST /api/empty-bin", handleEmptyBin(svcs.People))
	mux.HandleFunc("GET /api/export/pods-sidecar", handleExportPodsSidecar(svcs.Pods))
	mux.HandleFunc("GET /api/export/snapshot", handleExportSnapshot(svcs.Snaps))
	mux.HandleFunc("GET /api/export/{format}", handleExport(svcs.Org))

	mux.HandleFunc("GET /api/snapshots", handleListSnapshots(svcs.Snaps))
	mux.HandleFunc("POST /api/snapshots/save", handleSaveSnapshot(svcs.Snaps))
	mux.HandleFunc("POST /api/snapshots/load", handleLoadSnapshot(svcs.Snaps))
	mux.HandleFunc("POST /api/snapshots/delete", handleDeleteSnapshot(svcs.Snaps))

	mux.HandleFunc("GET /api/pods", handleListPods(svcs.Pods))
	mux.HandleFunc("POST /api/pods/update", handleUpdatePod(svcs.Pods))
	mux.HandleFunc("POST /api/pods/create", handleCreatePod(svcs.Pods))

	mux.HandleFunc("POST /api/reset", handleReset(svcs.Org))
	mux.HandleFunc("POST /api/reorder", handleReorder(svcs.People))

	mux.HandleFunc("GET /api/settings", handleGetSettings(svcs.Settings))
	mux.HandleFunc("POST /api/settings", handleUpdateSettings(svcs.Settings))
	mux.HandleFunc("GET /api/export/settings-sidecar", handleExportSettingsSidecar(svcs.Settings))

	mux.HandleFunc("POST /api/restore-state", handleRestoreState(svcs.Org))
	mux.HandleFunc("POST /api/autosave", handleWriteAutosave(autoStore))
	mux.HandleFunc("GET /api/autosave", handleReadAutosave(autoStore))
	mux.HandleFunc("DELETE /api/autosave", handleDeleteAutosave(autoStore))

	// Config endpoint — always registered
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, ConfigResponse{Logging: logBuf != nil})
	})

	// Log endpoints — only when logging is enabled
	if logBuf != nil {
		mux.HandleFunc("GET /api/logs", handleGetLogs(logBuf))
		mux.HandleFunc("POST /api/logs", handlePostLog(logBuf))
		mux.HandleFunc("DELETE /api/logs", handleDeleteLogs(logBuf))
	}

	return mux
}
```

- [ ] **Step 2: Update handler signatures — ImportService handlers**

Change the three import handlers:

```go
func handleUpload(svc ImportService) http.HandlerFunc {
```

```go
func handleUploadZip(svc ImportService) http.HandlerFunc {
```

```go
func handleConfirmMapping(svc ImportService) http.HandlerFunc {
```

- [ ] **Step 3: Update handler signatures — OrgReader handlers**

```go
func handleGetOrg(svc OrgReader) http.HandlerFunc {
```

```go
func handleRestoreState(svc OrgReader) http.HandlerFunc {
```

```go
func handleGetRecycled(svc OrgReader) http.HandlerFunc {
```

```go
func handleExport(svc OrgReader) http.HandlerFunc {
```

```go
func handleReset(svc OrgReader) http.HandlerFunc {
```

- [ ] **Step 4: Update handler signatures — PersonService handlers**

```go
func handleMove(svc PersonService) http.HandlerFunc {
```

```go
func handleUpdate(svc PersonService) http.HandlerFunc {
```

```go
func handleAdd(svc PersonService) http.HandlerFunc {
```

```go
func handleDelete(svc PersonService) http.HandlerFunc {
```

```go
func handleRestore(svc PersonService) http.HandlerFunc {
```

```go
func handleEmptyBin(svc PersonService) http.HandlerFunc {
```

```go
func handleReorder(svc PersonService) http.HandlerFunc {
```

- [ ] **Step 5: Update handler signatures — SnapshotService handlers**

```go
func handleExportSnapshot(svc SnapshotService) http.HandlerFunc {
```

```go
func handleListSnapshots(svc SnapshotService) http.HandlerFunc {
```

```go
func handleSaveSnapshot(svc SnapshotService) http.HandlerFunc {
```

```go
func handleLoadSnapshot(svc SnapshotService) http.HandlerFunc {
```

```go
func handleDeleteSnapshot(svc SnapshotService) http.HandlerFunc {
```

- [ ] **Step 6: Update handler signatures — PodService handlers**

```go
func handleExportPodsSidecar(svc PodService) http.HandlerFunc {
```

```go
func handleListPods(svc PodService) http.HandlerFunc {
```

```go
func handleUpdatePod(svc PodService) http.HandlerFunc {
```

```go
func handleCreatePod(svc PodService) http.HandlerFunc {
```

- [ ] **Step 7: Update handler signatures — SettingsService handlers**

```go
func handleGetSettings(svc SettingsService) http.HandlerFunc {
```

```go
func handleUpdateSettings(svc SettingsService) http.HandlerFunc {
```

```go
func handleExportSettingsSidecar(svc SettingsService) http.HandlerFunc {
```

- [ ] **Step 8: Verify it compiles**

Run: `go build ./internal/api/`
Expected: Success

- [ ] **Step 9: Commit**

```
refactor: update NewRouter and handlers to accept domain interfaces
```

---

### Task 4: Update all test files to use NewServices

Every call to `NewRouter(svc, ...)` in test files must change to `NewRouter(NewServices(svc), ...)`.

**Files:**
- Modify: `internal/api/handlers_test.go` (~49 call sites)
- Modify: `internal/api/bench_test.go` (1 call site)
- Modify: `internal/api/logging_test.go` (6 call sites)
- Modify: `internal/api/stores_test.go` (5 call sites)
- Modify: `integration_test.go` (2 call sites)

- [ ] **Step 1: Update handlers_test.go**

Replace all occurrences of `NewRouter(svc, ` with `NewRouter(NewServices(svc), ` in `internal/api/handlers_test.go`. There are ~49 call sites. All follow the pattern:

```go
// Before:
handler := NewRouter(svc, nil, NewMemoryAutosaveStore())

// After:
handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
```

Also update the two inline calls at lines 1426 and 1439:

```go
// Before:
NewRouter(svc, nil, NewMemoryAutosaveStore()).ServeHTTP(w, req)

// After:
NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore()).ServeHTTP(w, req)
```

- [ ] **Step 2: Update bench_test.go**

At line 168:

```go
// Before:
router := NewRouter(svc, nil, NewMemoryAutosaveStore())

// After:
router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
```

- [ ] **Step 3: Update logging_test.go**

6 call sites. All follow the same pattern. For the inline constructor calls:

```go
// Before:
router := NewRouter(NewOrgService(NewMemorySnapshotStore()), buf, NewMemoryAutosaveStore())

// After:
router := NewRouter(NewServices(NewOrgService(NewMemorySnapshotStore())), buf, NewMemoryAutosaveStore())
```

Same for the `nil` log buffer variants:

```go
// Before:
router := NewRouter(NewOrgService(NewMemorySnapshotStore()), nil, NewMemoryAutosaveStore())

// After:
router := NewRouter(NewServices(NewOrgService(NewMemorySnapshotStore())), nil, NewMemoryAutosaveStore())
```

- [ ] **Step 4: Update stores_test.go**

5 call sites, same pattern:

```go
// Before:
handler := NewRouter(svc, nil, store)

// After:
handler := NewRouter(NewServices(svc), nil, store)
```

And the 2 sites using `NewMemoryAutosaveStore()`:

```go
// Before:
handler := NewRouter(svc, nil, NewMemoryAutosaveStore())

// After:
handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
```

- [ ] **Step 5: Update integration_test.go**

2 call sites. These use the `api.` package prefix:

```go
// Before:
handler = api.NewRouter(svc, nil, api.NewMemoryAutosaveStore())

// After:
handler = api.NewRouter(api.NewServices(svc), nil, api.NewMemoryAutosaveStore())
```

```go
// Before:
freshHandler := api.NewRouter(freshSvc, nil, api.NewMemoryAutosaveStore())

// After:
freshHandler := api.NewRouter(api.NewServices(freshSvc), nil, api.NewMemoryAutosaveStore())
```

- [ ] **Step 6: Run full test suite**

Run: `go test ./...`
Expected: All PASS

- [ ] **Step 7: Commit**

```
refactor: update all test NewRouter calls to use NewServices
```

---

### Task 5: Update cmd/serve.go

**Files:**
- Modify: `cmd/serve.go`

- [ ] **Step 1: Update runServe to use NewServices**

In `cmd/serve.go`, change the router construction (line 37):

```go
// Before:
apiRouter := api.NewRouter(svc, logBuf, autoStore)

// After:
apiRouter := api.NewRouter(api.NewServices(svc), logBuf, autoStore)
```

- [ ] **Step 2: Build the binary**

Run: `make build`
Expected: Success, produces `./grove` binary

- [ ] **Step 3: Commit**

```
refactor: update serve command to use NewServices
```

---

### Task 6: Add compile-time interface satisfaction checks

Add explicit compile-time assertions that `*OrgService` satisfies all 6 interfaces. This catches drift if someone adds a method to an interface but forgets to implement it.

**Files:**
- Modify: `internal/api/interfaces.go`

- [ ] **Step 1: Add interface compliance assertions**

Add at the bottom of `interfaces.go`, after the `NewServices` function:

```go
// Compile-time assertions: *OrgService satisfies all domain interfaces.
var (
	_ PersonService   = (*OrgService)(nil)
	_ OrgReader       = (*OrgService)(nil)
	_ SnapshotService = (*OrgService)(nil)
	_ ImportService   = (*OrgService)(nil)
	_ PodService      = (*OrgService)(nil)
	_ SettingsService = (*OrgService)(nil)
)
```

- [ ] **Step 2: Verify it compiles**

Run: `go build ./internal/api/`
Expected: Success

- [ ] **Step 3: Run full test suite one final time**

Run: `go test ./... -count=1`
Expected: All PASS

- [ ] **Step 4: Commit**

```
refactor: add compile-time interface satisfaction checks for OrgService
```
