# Maintainability, Testing & Scenario Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all "what to watch" items from the principal engineer codebase review — extract PodManager, replace map[string]any with typed response structs, add context.Context, fix DetailSidebar form sync, add missing tests, raise coverage thresholds, and fill scenario documentation gaps.

**Architecture:** PodManager follows the existing SnapshotManager pattern (struct with state, NOT thread-safe, called under OrgService.mu). Response structs are HTTP-layer types in model.go. context.Context is threaded through all public service methods with actual cancellation checks in ConfirmMapping. Frontend fix replaces string concatenation with useMemo snapshot.

**Tech Stack:** Go 1.22+, React 19, TypeScript 5.7, Vitest, Playwright

---

### Task 1: Add named response structs to model.go

**Files:**
- Modify: `internal/api/model.go`

- [ ] **Step 1: Add response types to model.go**

Add these types after the existing `UploadResponse` struct at the end of the file:

```go
// WorkingResponse is returned by mutations that affect working people and pods
// (move, update, reorder, updatePod, createPod).
type WorkingResponse struct {
	Working []Person `json:"working"`
	Pods    []Pod    `json:"pods"`
}

// AddResponse is returned when a person is added.
type AddResponse struct {
	Created Person   `json:"created"`
	Working []Person `json:"working"`
	Pods    []Pod    `json:"pods"`
}

// MutationResponse is returned by mutations that affect both working and
// recycled slices (delete, restore).
type MutationResponse struct {
	Working  []Person `json:"working"`
	Recycled []Person `json:"recycled"`
	Pods     []Pod    `json:"pods"`
}

// RecycledResponse is returned by empty-bin.
type RecycledResponse struct {
	Recycled []Person `json:"recycled"`
}

// HealthResponse is returned by the health endpoint.
type HealthResponse struct {
	Status string `json:"status"`
}

// ConfigResponse is returned by the config endpoint.
type ConfigResponse struct {
	Logging bool `json:"logging"`
}
```

- [ ] **Step 2: Run tests to verify no breakage**

Run: `cd /home/zach/code/grove && go build ./...`
Expected: compiles without errors (new types are unused so far)

- [ ] **Step 3: Commit**

```bash
jj describe -m "refactor: add named response structs to model.go"
jj new
```

---

### Task 2: Replace map[string]any in handlers.go with named structs

**Files:**
- Modify: `internal/api/handlers.go`

- [ ] **Step 1: Replace health endpoint response**

Change line 15 from:
```go
writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
```
to:
```go
writeJSON(w, http.StatusOK, HealthResponse{Status: "ok"})
```

- [ ] **Step 2: Replace config endpoint response**

Change line 56 from:
```go
writeJSON(w, http.StatusOK, map[string]bool{"logging": logBuf != nil})
```
to:
```go
writeJSON(w, http.StatusOK, ConfigResponse{Logging: logBuf != nil})
```

- [ ] **Step 3: Replace handleRestoreState response**

Change line 142-144 from:
```go
return jsonHandler(func(data AutosaveData) (map[string]string, error) {
	svc.RestoreState(data)
	return map[string]string{"status": "ok"}, nil
})
```
to:
```go
return jsonHandler(func(data AutosaveData) (HealthResponse, error) {
	svc.RestoreState(data)
	return HealthResponse{Status: "ok"}, nil
})
```

- [ ] **Step 4: Replace handleMove response**

Change the jsonHandler in handleMove from:
```go
return jsonHandler(func(r req) (map[string]any, error) {
	result, err := svc.Move(r.PersonId, r.NewManagerId, r.NewTeam, r.NewPod)
	if err != nil {
		return nil, err
	}
	return map[string]any{"working": result.Working, "pods": result.Pods}, nil
})
```
to:
```go
return jsonHandler(func(r req) (*WorkingResponse, error) {
	result, err := svc.Move(r.PersonId, r.NewManagerId, r.NewTeam, r.NewPod)
	if err != nil {
		return nil, err
	}
	return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
})
```

- [ ] **Step 5: Replace handleUpdate response**

Same pattern — change `map[string]any` to `*WorkingResponse`:
```go
return jsonHandler(func(r req) (*WorkingResponse, error) {
	result, err := svc.Update(r.PersonId, r.Fields)
	if err != nil {
		return nil, err
	}
	return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
})
```

- [ ] **Step 6: Replace handleAdd response**

Change from `map[string]any` to `*AddResponse`:
```go
return jsonHandler(func(p Person) (*AddResponse, error) {
	created, working, pods, err := svc.Add(p)
	if err != nil {
		return nil, err
	}
	return &AddResponse{Created: created, Working: working, Pods: pods}, nil
})
```

- [ ] **Step 7: Replace handleDelete response**

Change from `map[string]any` to `*MutationResponse`:
```go
return jsonHandler(func(r req) (*MutationResponse, error) {
	result, err := svc.Delete(r.PersonId)
	if err != nil {
		return nil, err
	}
	return &MutationResponse{Working: result.Working, Recycled: result.Recycled, Pods: result.Pods}, nil
})
```

- [ ] **Step 8: Replace handleRestore response**

Same pattern as delete:
```go
return jsonHandler(func(r req) (*MutationResponse, error) {
	result, err := svc.Restore(r.PersonId)
	if err != nil {
		return nil, err
	}
	return &MutationResponse{Working: result.Working, Recycled: result.Recycled, Pods: result.Pods}, nil
})
```

- [ ] **Step 9: Replace handleEmptyBin response**

Change from `map[string]any` to `RecycledResponse`:
```go
func handleEmptyBin(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		recycled := svc.EmptyBin()
		writeJSON(w, http.StatusOK, RecycledResponse{Recycled: recycled})
	}
}
```

- [ ] **Step 10: Replace handleUpdatePod response**

Change from `map[string]any` to `*WorkingResponse`:
```go
return jsonHandler(func(r req) (*WorkingResponse, error) {
	result, err := svc.UpdatePod(r.PodId, r.Fields)
	if err != nil {
		return nil, err
	}
	return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
})
```

- [ ] **Step 11: Replace handleCreatePod response**

Same as updatePod:
```go
return jsonHandler(func(r req) (*WorkingResponse, error) {
	result, err := svc.CreatePod(r.ManagerId, r.Name, r.Team)
	if err != nil {
		return nil, err
	}
	return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
})
```

- [ ] **Step 12: Replace handleReorder response**

Same pattern:
```go
return jsonHandler(func(r req) (*WorkingResponse, error) {
	result, err := svc.Reorder(r.PersonIds)
	if err != nil {
		return nil, err
	}
	return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
})
```

- [ ] **Step 13: Run all tests**

Run: `cd /home/zach/code/grove && go test ./... -count=1`
Expected: all tests pass (JSON keys are identical, so handler tests should pass unchanged)

- [ ] **Step 14: Commit**

```bash
jj describe -m "refactor: replace map[string]any with named response structs in handlers"
jj new
```

---

### Task 3: Extract PodManager struct

**Files:**
- Create: `internal/api/pod_manager.go`
- Modify: `internal/api/service.go`
- Modify: `internal/api/service_pods.go`
- Modify: `internal/api/service_people.go`
- Modify: `internal/api/service_import.go`
- Modify: `internal/api/snapshots.go`

- [ ] **Step 1: Create pod_manager.go**

```go
package api

import "github.com/google/uuid"

// PodManager owns pod state. It is NOT thread-safe — callers must hold an
// external lock (typically OrgService.mu) around all method calls.
type PodManager struct {
	pods         []Pod
	originalPods []Pod
}

// NewPodManager creates a PodManager with empty state.
func NewPodManager() *PodManager {
	return &PodManager{}
}

// SetState replaces the current pod state (used during import and autosave restore).
func (pm *PodManager) SetState(pods, originalPods []Pod) {
	pm.pods = pods
	pm.originalPods = originalPods
}

// GetPods returns the current pods slice.
func (pm *PodManager) GetPods() []Pod { return pm.pods }

// GetOriginalPods returns the original pods slice.
func (pm *PodManager) GetOriginalPods() []Pod { return pm.originalPods }

// SetPods replaces the current pods slice.
func (pm *PodManager) SetPods(pods []Pod) { pm.pods = pods }

// Reset restores pods to the original state.
func (pm *PodManager) Reset() {
	pm.pods = CopyPods(pm.originalPods)
}

// Seed creates pods from the Pod field on people and stores as both current and original.
func (pm *PodManager) Seed(working []Person) {
	pm.pods = SeedPods(working)
	pm.originalPods = CopyPods(pm.pods)
}

// ListPods returns pod info with member counts computed from the working slice.
func (pm *PodManager) ListPods(working []Person) []PodInfo {
	counts := map[string]int{}
	for _, p := range working {
		if p.Pod != "" && p.ManagerId != "" {
			counts[p.ManagerId+":"+p.Pod]++
		}
	}
	result := make([]PodInfo, len(pm.pods))
	for i, pod := range pm.pods {
		result[i] = PodInfo{Pod: pod, MemberCount: counts[pod.ManagerId+":"+pod.Name]}
	}
	return result
}

// UpdatePod updates fields on a pod by ID.
func (pm *PodManager) UpdatePod(podID string, fields map[string]string, working []Person) error {
	pod := findPodByID(pm.pods, podID)
	if pod == nil {
		return errNotFound("pod %s not found", podID)
	}
	for k, v := range fields {
		switch k {
		case "name":
			if err := RenamePod(pm.pods, working, podID, v); err != nil {
				return err
			}
		case "publicNote":
			if err := validateNoteLen(v); err != nil {
				return err
			}
			pod.PublicNote = v
		case "privateNote":
			if err := validateNoteLen(v); err != nil {
				return err
			}
			pod.PrivateNote = v
		default:
			return errValidation("unknown pod field: %s", k)
		}
	}
	return nil
}

// CreatePod creates a new pod, checking for duplicates.
func (pm *PodManager) CreatePod(managerID, name, team string) error {
	for _, p := range pm.pods {
		if p.ManagerId == managerID && p.Team == team {
			return errConflict("pod already exists for this manager and team")
		}
	}
	pod := Pod{Id: uuid.NewString(), Name: name, Team: team, ManagerId: managerID}
	pm.pods = append(pm.pods, pod)
	return nil
}

// Cleanup removes empty pods.
func (pm *PodManager) Cleanup(working []Person) {
	pm.pods = CleanupEmptyPods(pm.pods, working)
}

// Reassign validates a person's pod assignment after a move.
func (pm *PodManager) Reassign(person *Person) {
	pm.pods = ReassignPersonPod(pm.pods, person)
}

// ApplyNotes applies pod sidecar notes using a name-to-ID map.
func (pm *PodManager) ApplyNotes(sidecar []podSidecarEntry, idToName map[string]string) {
	applyPodSidecarNotes(pm.pods, sidecar, idToName)
	applyPodSidecarNotes(pm.originalPods, sidecar, idToName)
}
```

- [ ] **Step 2: Update OrgService struct in service.go**

Replace `pods` and `originalPods` fields:

```go
type OrgService struct {
	mu       sync.RWMutex
	original []Person
	working  []Person
	recycled []Person
	settings Settings
	pending  *PendingUpload
	snaps    *SnapshotManager
	podMgr   *PodManager
	idIndex  map[string]int
}
```

Update `NewOrgService`:
```go
func NewOrgService(snapStore SnapshotStore) *OrgService {
	return &OrgService{snaps: NewSnapshotManager(snapStore), podMgr: NewPodManager()}
}
```

Update `RestoreState` — replace `s.pods` and `s.originalPods` references:
```go
func (s *OrgService) RestoreState(data AutosaveData) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.original = deepCopyPeople(data.Original)
	s.working = deepCopyPeople(data.Working)
	s.rebuildIndex()
	s.recycled = deepCopyPeople(data.Recycled)
	s.podMgr.SetState(CopyPods(data.Pods), CopyPods(data.OriginalPods))
	if data.Settings != nil {
		s.settings = *data.Settings
	} else {
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.original)}
	}
}
```

Update `GetOrg`:
```go
func (s *OrgService) GetOrg() *OrgData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.original == nil {
		return nil
	}
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
}
```

Update `ResetToOriginal`:
```go
func (s *OrgService) ResetToOriginal() *OrgData {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.working = deepCopyPeople(s.original)
	s.rebuildIndex()
	s.recycled = nil
	s.podMgr.Reset()
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.original)}
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
}
```

Update `resetState`:
```go
func (s *OrgService) resetState(original, working []Person, snaps map[string]snapshotData) {
	s.original = original
	s.working = deepCopyPeople(working)
	s.rebuildIndex()
	s.recycled = nil
	s.snaps.ReplaceAll(snaps)
	s.podMgr.Seed(s.working)
	_ = SeedPods(s.original)
}
```

- [ ] **Step 3: Update service_pods.go to delegate to PodManager**

Replace the entire file:

```go
package api

func (s *OrgService) ListPods() []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.podMgr.ListPods(s.working)
}

func (s *OrgService) UpdatePod(podID string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.UpdatePod(podID, fields, s.working); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}

func (s *OrgService) CreatePod(managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.CreatePod(managerID, name, team); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}
```

- [ ] **Step 4: Update service_people.go to use s.podMgr**

Replace all `s.pods` references with `s.podMgr` calls. The key changes:

In `Move`: replace `s.pods = ReassignPersonPod(s.pods, p)` with `s.podMgr.Reassign(p)`, replace `s.pods = CleanupEmptyPods(s.pods, s.working)` with `s.podMgr.Cleanup(s.working)`, replace `CopyPods(s.pods)` with `CopyPods(s.podMgr.GetPods())`.

In `Update`: same pattern for `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `Reorder`: replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `Add`: replace `s.pods = ReassignPersonPod(s.pods, &s.working[...])` with `s.podMgr.Reassign(...)`, replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `Delete`: replace `s.pods = CleanupEmptyPods(s.pods, s.working)` with `s.podMgr.Cleanup(s.working)`, replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `Restore`: replace `s.pods = ReassignPersonPod(s.pods, &s.working[...])` with `s.podMgr.Reassign(...)`, replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `applyTeamChange`: replace `s.pods = ReassignPersonPod(s.pods, p)` with `s.podMgr.Reassign(p)`, `s.pods = ReassignPersonPod(s.pods, &s.working[i])` with `s.podMgr.Reassign(&s.working[i])`, `s.pods = CleanupEmptyPods(s.pods, s.working)` with `s.podMgr.Cleanup(s.working)`.

In `applyManagerChange`: same pattern for Reassign/Cleanup.

In `applyPodChange`: replace `findPod(s.pods, ...)` with `findPod(s.podMgr.GetPods(), ...)`, replace `s.pods = append(s.pods, Pod{...})` with `s.podMgr.SetPods(append(s.podMgr.GetPods(), Pod{...}))`, replace `s.pods = CleanupEmptyPods(s.pods, s.working)` with `s.podMgr.Cleanup(s.working)`.

- [ ] **Step 5: Update service_import.go to use s.podMgr**

In `Upload`: replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `confirmMappingCSV`: replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `confirmMappingZip`: replace direct `s.pods` and `s.originalPods` references:
- `applyPodSidecarNotes(s.pods, ...)` and `applyPodSidecarNotes(s.originalPods, ...)` → `s.podMgr.ApplyNotes(sidecarEntries, idToName)`
- `buildIDToName(s.working)` stays as-is
- `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`

In `UploadZip`: same pattern. Replace `s.pods`/`s.originalPods` with `s.podMgr` equivalents.

- [ ] **Step 6: Update snapshots.go to use s.podMgr**

In `LoadSnapshot`: replace `s.pods = CopyPods(snap.Pods)` with `s.podMgr.SetPods(CopyPods(snap.Pods))`, replace `s.pods = SeedPods(s.working)` with `s.podMgr.SetPods(SeedPods(s.working))`, replace `CopyPods(s.pods)` → `CopyPods(s.podMgr.GetPods())`.

In `SaveSnapshot`: replace `s.working, s.pods, s.settings` → `s.working, s.podMgr.GetPods(), s.settings`.

In `ExportSnapshot`: no changes needed (doesn't touch pods).

- [ ] **Step 7: Update handleExportPodsSidecar in handlers.go**

Replace direct field access:
```go
func handleExportPodsSidecar(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		svc.mu.RLock()
		pods := CopyPods(svc.podMgr.GetPods())
		people := deepCopyPeople(svc.working)
		svc.mu.RUnlock()
```

- [ ] **Step 8: Run all tests**

Run: `cd /home/zach/code/grove && go test ./... -count=1`
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
jj describe -m "refactor: extract PodManager from OrgService"
jj new
```

---

### Task 4: Add context.Context to service methods

**Files:**
- Modify: `internal/api/service.go`
- Modify: `internal/api/service_people.go`
- Modify: `internal/api/service_pods.go`
- Modify: `internal/api/service_import.go`
- Modify: `internal/api/service_settings.go`
- Modify: `internal/api/snapshots.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/service_test.go`
- Modify: `internal/api/handlers_test.go`
- Modify: `internal/api/pods_test.go`
- Modify: `internal/api/concurrent_test.go`
- Modify: `internal/api/stress_test.go`
- Modify: `internal/api/adversarial_test.go`
- Modify: `internal/api/snapshots_test.go`
- Modify: `internal/api/zipimport_test.go`
- Modify: `internal/api/autosave_test.go`
- Modify: `internal/api/stores_test.go`
- Modify: `internal/api/bench_test.go`
- Modify: `internal/api/bench_index_test.go`
- Modify: `internal/api/fuzz_test.go`
- Modify: `integration_test.go`

- [ ] **Step 1: Add context.Context to service.go methods**

Add `"context"` to imports. Update method signatures:

```go
func (s *OrgService) RestoreState(ctx context.Context, data AutosaveData) {
func (s *OrgService) GetOrg(ctx context.Context) *OrgData {
func (s *OrgService) GetWorking(ctx context.Context) []Person {
func (s *OrgService) GetRecycled(ctx context.Context) []Person {
func (s *OrgService) ResetToOriginal(ctx context.Context) *OrgData {
```

Method bodies don't change — ctx is just threaded for now.

- [ ] **Step 2: Add context.Context to service_people.go methods**

```go
func (s *OrgService) Move(ctx context.Context, personId, newManagerId, newTeam string, newPod ...string) (*MoveResult, error) {
func (s *OrgService) Update(ctx context.Context, personId string, fields map[string]string) (*MoveResult, error) {
func (s *OrgService) Reorder(ctx context.Context, personIds []string) (*MoveResult, error) {
func (s *OrgService) Add(ctx context.Context, p Person) (Person, []Person, []Pod, error) {
func (s *OrgService) Delete(ctx context.Context, personId string) (*MutationResult, error) {
func (s *OrgService) Restore(ctx context.Context, personId string) (*MutationResult, error) {
func (s *OrgService) EmptyBin(ctx context.Context) []Person {
```

- [ ] **Step 3: Add context.Context to service_pods.go methods**

```go
func (s *OrgService) ListPods(ctx context.Context) []PodInfo {
func (s *OrgService) UpdatePod(ctx context.Context, podID string, fields map[string]string) (*MoveResult, error) {
func (s *OrgService) CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error) {
```

- [ ] **Step 4: Add context.Context to service_import.go methods**

```go
func (s *OrgService) Upload(ctx context.Context, filename string, data []byte) (*UploadResponse, error) {
func (s *OrgService) ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error) {
```

Add cancellation check in `ConfirmMapping` between Phase 1 and Phase 2:
```go
func (s *OrgService) ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error) {
	// Phase 1: grab and clear pending data under lock.
	s.mu.Lock()
	pending := s.pending
	s.pending = nil
	s.mu.Unlock()

	if pending == nil {
		return nil, errValidation("no pending file to confirm")
	}

	// Check for cancellation before expensive parsing
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// Phase 2: parse entirely outside the lock (CPU work, no state mutation)
	if pending.IsZip {
		return s.confirmMappingZip(pending, mapping)
	}
	return s.confirmMappingCSV(pending, mapping)
}
```

Also update `UploadZip`:
```go
func (s *OrgService) UploadZip(ctx context.Context, data []byte) (*UploadResponse, error) {
```

- [ ] **Step 5: Add context.Context to service_settings.go methods**

```go
func (s *OrgService) GetSettings(ctx context.Context) Settings {
func (s *OrgService) UpdateSettings(ctx context.Context, settings Settings) (Settings, error) {
```

- [ ] **Step 6: Add context.Context to snapshots.go methods**

```go
func (s *OrgService) SaveSnapshot(ctx context.Context, name string) error {
func (s *OrgService) ExportSnapshot(ctx context.Context, name string) ([]Person, error) {
func (s *OrgService) LoadSnapshot(ctx context.Context, name string) (*OrgData, error) {
func (s *OrgService) DeleteSnapshot(ctx context.Context, name string) error {
func (s *OrgService) ListSnapshots(ctx context.Context) []SnapshotInfo {
```

`ListSnapshotsUnlocked` stays unchanged (internal, no ctx needed).

- [ ] **Step 7: Update handlers.go to pass r.Context()**

For every handler that calls a service method, pass `r.Context()`. The `jsonHandler` generic doesn't have access to the request, so update handlers that use it to capture context. Change `jsonHandler` to accept a function that takes the request context:

```go
func jsonHandlerCtx[Req any, Resp any](fn func(context.Context, Req) (Resp, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		resp, err := fn(r.Context(), req)
		if err != nil {
			serviceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}
```

Keep the old `jsonHandler` temporarily (or replace all call sites). Update all handler functions to use `jsonHandlerCtx` and pass ctx to service calls. Example for handleMove:

```go
func handleMove(svc *OrgService) http.HandlerFunc {
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
```

Apply the same pattern to all handlers: handleConfirmMapping, handleUpdate, handleAdd, handleDelete, handleRestore, handleSaveSnapshot, handleLoadSnapshot, handleDeleteSnapshot, handleUpdatePod, handleCreatePod, handleReorder, handleUpdateSettings, handleRestoreState.

For handlers that don't use jsonHandler (handleUpload, handleUploadZip, handleGetOrg, handleReset, handleEmptyBin, handleExport, handleExportSnapshot, handleListSnapshots, handleGetSettings, handleListPods, handleGetRecycled, handleExportPodsSidecar, handleExportSettingsSidecar), pass `r.Context()` directly to the service call.

Remove the old `jsonHandler` function once all call sites are migrated.

- [ ] **Step 8: Update newTestService helper**

In `service_test.go`, update `newTestService` to pass `context.Background()`:
```go
func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}
```

- [ ] **Step 9: Update all test call sites**

Add `context.Background()` as the first argument to every service method call in all test files. This is mechanical: find every `svc.Move(`, `svc.Update(`, `svc.Upload(`, etc. and add `context.Background(),` as the first argument.

Do this for all test files: service_test.go, handlers_test.go, pods_test.go, concurrent_test.go, stress_test.go, adversarial_test.go, snapshots_test.go, zipimport_test.go, autosave_test.go, stores_test.go, bench_test.go, bench_index_test.go, fuzz_test.go, and integration_test.go.

- [ ] **Step 10: Run all tests**

Run: `cd /home/zach/code/grove && go test ./... -count=1 -race`
Expected: all tests pass

- [ ] **Step 11: Commit**

```bash
jj describe -m "refactor: add context.Context to all OrgService public methods"
jj new
```

---

### Task 5: Fix DetailSidebar form sync

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Replace personDataKey with useMemo snapshot**

Replace lines 109-120 in DetailSidebar.tsx:

```typescript
  // Sync form when selection changes
  const personDataKey = person
    ? `${person.id}\0${person.name}\0${person.role}\0${person.discipline}\0${person.team}\0${person.managerId}\0${person.status}\0${person.employmentType ?? ''}\0${(person.additionalTeams ?? []).join(',')}\0${person.pod ?? ''}\0${person.publicNote ?? ''}\0${person.privateNote ?? ''}\0${person.level ?? 0}\0${person.private ?? false}`
    : ''

  useEffect(() => {
    if (isBatch) {
      setForm(formFromBatch(selectedPeople))
      setBatchDirty(new Set())
    } else if (person) {
      setForm(formFromPerson(person))
    }
  }, [isBatch ? selectedIds.size : personDataKey])
```

With:

```typescript
  // Sync form when selection or person data changes.
  // useMemo with explicit deps replaces the fragile personDataKey string concatenation.
  // If a new Person field is added, add it here to trigger re-sync.
  const personSnapshot = useMemo(() => {
    if (!person) return null
    return {
      id: person.id, name: person.name, role: person.role,
      discipline: person.discipline, team: person.team,
      managerId: person.managerId, status: person.status,
      employmentType: person.employmentType, level: person.level,
      pod: person.pod, publicNote: person.publicNote,
      privateNote: person.privateNote, private: person.private,
      additionalTeams: (person.additionalTeams ?? []).join(','),
    }
  }, [person?.id, person?.name, person?.role, person?.discipline,
      person?.team, person?.managerId, person?.status,
      person?.employmentType, person?.level, person?.pod,
      person?.publicNote, person?.privateNote, person?.private,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      (person?.additionalTeams ?? []).join(',')])

  useEffect(() => {
    if (isBatch) {
      setForm(formFromBatch(selectedPeople))
      setBatchDirty(new Set())
    } else if (person) {
      setForm(formFromPerson(person))
    }
  }, [isBatch ? selectedIds.size : personSnapshot])
```

- [ ] **Step 2: Run frontend tests**

Run: `cd /home/zach/code/grove/web && npm test -- --run`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
jj describe -m "fix: replace personDataKey string with useMemo snapshot in DetailSidebar"
jj new
```

---

### Task 6: Add corrupted snapshot recovery tests

**Files:**
- Create: `internal/api/snapshot_recovery_test.go`

- [ ] **Step 1: Write the test file**

```go
package api

import (
	"os"
	"path/filepath"
	"testing"
)

// Scenarios: CONTRACT-008

func TestSnapshotRecovery_MalformedJSON(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte("{not valid json!!!"), 0644); err != nil {
		t.Fatal(err)
	}
	old := snapshotStoreDir
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = old }()

	result, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_TruncatedJSON(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	// Valid JSON start but truncated mid-object
	if err := os.WriteFile(path, []byte(`{"snap1":{"people":[{"id":"a","name":"Al`), 0644); err != nil {
		t.Fatal(err)
	}
	old := snapshotStoreDir
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = old }()

	result, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error for truncated JSON, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_EmptyFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte(""), 0644); err != nil {
		t.Fatal(err)
	}
	old := snapshotStoreDir
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = old }()

	result, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error for empty file, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_FileNotExist(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	old := snapshotStoreDir
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = old }()

	// No file created — should return nil, nil (graceful "no snapshots")
	result, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("expected nil error for missing file, got %v", err)
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_ValidJSON(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	data := `{"snap1":{"people":[{"id":"a","name":"Alice"}],"timestamp":"2026-01-01T00:00:00Z"}}`
	if err := os.WriteFile(path, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}
	old := snapshotStoreDir
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = old }()

	result, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(result))
	}
	snap := result["snap1"]
	if len(snap.People) != 1 || snap.People[0].Name != "Alice" {
		t.Errorf("unexpected snapshot content: %+v", snap)
	}
}

func TestSnapshotRecovery_ManagerStartsClean(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte("corrupted!"), 0644); err != nil {
		t.Fatal(err)
	}
	old := snapshotStoreDir
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = old }()

	// SnapshotManager should start with empty snapshots when store is corrupt
	store := FileSnapshotStore{}
	sm := NewSnapshotManager(store)
	list := sm.List()
	if len(list) != 0 {
		t.Errorf("expected empty snapshot list after corrupt store, got %d", len(list))
	}
}
```

- [ ] **Step 2: Run the tests**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestSnapshotRecovery -v`
Expected: all 6 tests pass

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add corrupted snapshot recovery tests"
jj new
```

---

### Task 7: Add context cancellation tests

**Files:**
- Modify: `internal/api/service_test.go`

- [ ] **Step 1: Add cancellation tests**

Add these tests to service_test.go:

```go
// Scenarios: CONTRACT-008
func TestConfirmMapping_CancelledContext(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Upload a file that needs mapping (non-standard headers)
	csv := []byte("Nombre,Cargo,Departamento\nAlice,VP,Eng\nBob,Engineer,Eng\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Cancel context before calling ConfirmMapping
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled

	_, err = svc.ConfirmMapping(ctx, map[string]string{"name": "Nombre"})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if err != context.Canceled {
		t.Errorf("expected context.Canceled, got %v", err)
	}

	// Verify no state was committed
	org := svc.GetOrg(context.Background())
	if org != nil {
		t.Error("expected nil org data (no state committed)")
	}
}

func TestConfirmMapping_DeadlineExceeded(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Nombre,Cargo,Departamento\nAlice,VP,Eng\nBob,Engineer,Eng\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Create an already-expired deadline
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	_, err = svc.ConfirmMapping(ctx, map[string]string{"name": "Nombre"})
	if err == nil {
		t.Fatal("expected error from expired deadline")
	}
	if err != context.DeadlineExceeded {
		t.Errorf("expected context.DeadlineExceeded, got %v", err)
	}
}
```

Add `"time"` to the imports if not already present.

- [ ] **Step 2: Run the tests**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run "TestConfirmMapping_Cancelled|TestConfirmMapping_Deadline" -v`
Expected: both tests pass

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add context cancellation tests for ConfirmMapping"
jj new
```

---

### Task 8: Raise frontend coverage thresholds

**Files:**
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Update thresholds**

Change the thresholds in `web/vite.config.ts`:

```typescript
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 65,
        lines: 77,
      },
```

- [ ] **Step 2: Run coverage to verify thresholds are met**

Run: `cd /home/zach/code/grove/web && npx vitest run --coverage`
Expected: all thresholds met (if not, the current coverage is below the new thresholds and we need to lower them to match)

- [ ] **Step 3: Commit**

```bash
jj describe -m "chore: raise frontend coverage thresholds to 75/70/65/77"
jj new
```

---

### Task 9: Add UPLOAD-012 and UPLOAD-013 scenario entries

**Files:**
- Modify: `docs/scenarios/upload.md`

- [ ] **Step 1: Add UPLOAD-012 and UPLOAD-013 entries**

Add these before the `---` after UPLOAD-011 (before UPLOAD-015):

```markdown
---

# Scenario: Header-only CSV

**ID**: UPLOAD-012
**Area**: upload
**Tests**:
- `internal/api/adversarial_test.go` → "TestAdversarial_HeaderOnlyCSV"

## Behavior
User uploads a CSV that has headers but zero data rows. The system returns an error without mutating state.

## Invariants
- extractRowsCSV returns error: "must have a header and at least one data row"
- No state mutation occurs
- Error message is clear and actionable

## Edge cases
- None

---

# Scenario: Duplicate CSV headers

**ID**: UPLOAD-013
**Area**: upload
**Tests**:
- `internal/api/adversarial_test.go` → "TestAdversarial_DuplicateHeaders"

## Behavior
User uploads a CSV with duplicate column names (e.g., two "Name" columns). The inference engine processes all headers. When mapped to a Go map, the last column with a given key wins.

## Invariants
- No crash or panic
- Inference proceeds with all header values
- Map key semantics resolve duplicates (last value wins)
- Upload completes successfully

## Edge cases
- None
```

- [ ] **Step 2: Run check-scenarios**

Run: `cd /home/zach/code/grove && make check-scenarios`
Expected: "All scenarios covered."

- [ ] **Step 3: Commit**

```bash
jj describe -m "docs: add UPLOAD-012 and UPLOAD-013 scenario entries"
jj new
```

---

### Task 10: Create model-validation.md scenarios

**Files:**
- Create: `docs/scenarios/model-validation.md`

- [ ] **Step 1: Write model-validation.md**

```markdown
# Model Validation Scenarios

---

# Scenario: Move person to new manager

**ID**: ORG-001
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move"
- `internal/api/service_test.go` → "TestOrgService_Move_NoTeamChange"
- `internal/api/handlers_test.go` → "TestMoveHandler"
- `web/e2e/features.spec.ts` → "drag-and-drop reparent"

## Behavior
A person is moved to a new manager, optionally with a new team and pod assignment.

## Invariants
- Person's managerId updated to new manager
- Team updated if newTeam is non-empty
- Pod reassigned if newPod is provided
- Empty pods cleaned up after move
- Original slice is unchanged

## Edge cases
- Move to same manager (no-op on managerId)
- Move with empty team (team unchanged)

---

# Scenario: Cycle detection in manager hierarchy

**ID**: ORG-002
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_CycleDetection"
- `internal/api/service_test.go` → "TestOrgService_Update_CycleDetection"
- `internal/api/service_test.go` → "TestOrgService_Move_SelfAsManager"
- `internal/api/adversarial_test.go` → "TestAdversarial_CircularManagerChain"

## Behavior
The system detects and rejects moves or updates that would create a cycle in the manager hierarchy.

## Invariants
- Self-as-manager is rejected
- A→B→C→A cycle is rejected
- ValidationError returned with descriptive message
- No state mutation on rejection

## Edge cases
- Deep chain cycles (>3 levels)

---

# Scenario: Manager not found on move

**ID**: ORG-003
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_ManagerNotFound"
- `internal/api/adversarial_test.go` → "TestAdversarial_MoveToNonexistentManager"
- `internal/api/handlers_test.go` → "TestMoveHandler_PersonNotFound"

## Behavior
Moving a person to a non-existent manager returns a NotFoundError.

## Invariants
- HTTP 404 returned
- No state mutation

## Edge cases
- None

---

# Scenario: Pod assignment during move

**ID**: ORG-004
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_SetsPod"
- `internal/api/service_test.go` → "TestOrgService_Move_EmptyPodIgnored"

## Behavior
A move can optionally include a pod assignment. Empty pod string is ignored.

## Invariants
- Non-empty newPod sets person's Pod field
- Empty string newPod is ignored (existing pod unchanged)

## Edge cases
- None

---

# Scenario: Update person fields

**ID**: ORG-005
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update"
- `internal/api/service_test.go` → "TestOrgService_Update_AllFields"
- `internal/api/service_test.go` → "TestOrgService_Update_Private"
- `internal/api/handlers_test.go` → "TestUpdateHandler"

## Behavior
Person fields are updated via a key-value map. Warning field is cleared on any edit.

## Invariants
- Supported fields: name, role, discipline, team, status, managerId, employmentType, additionalTeams, newRole, newTeam, publicNote, privateNote, level, private, pod
- Warning cleared on edit
- Original slice unchanged

## Edge cases
- Empty string values are valid

---

# Scenario: Invalid status rejected

**ID**: ORG-006
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_InvalidStatus"
- `internal/api/adversarial_test.go` → "TestAdversarial_InvalidStatus"

## Behavior
Setting a status to a value not in the valid statuses set returns a ValidationError.

## Invariants
- HTTP 422 returned
- Valid statuses: Active, Open, Transfer In, Transfer Out, Backfill, Planned

## Edge cases
- None

---

# Scenario: Unknown field rejected

**ID**: ORG-007
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_UnknownField"

## Behavior
Updating with an unrecognized field name returns a ValidationError.

## Invariants
- HTTP 422 returned
- Error message includes the unknown field name

## Edge cases
- None

---

# Scenario: Person not found on update

**ID**: ORG-008
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_PersonNotFound"
- `internal/api/handlers_test.go` → "TestUpdateHandler_PersonNotFound"

## Behavior
Updating a non-existent person ID returns a NotFoundError.

## Invariants
- HTTP 404 returned
- No state mutation

## Edge cases
- None

---

# Scenario: Field length validation

**ID**: ORG-009
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_FieldLengthValidation"
- `internal/api/adversarial_test.go` → "TestAdversarial_OversizedFields"
- `internal/api/adversarial_test.go` → "TestAdversarial_OversizedNote"
- `internal/api/service_test.go` → "TestValidateNoteLen"

## Behavior
Field values have maximum lengths. Standard fields: 500 chars. Notes: 2000 chars.

## Invariants
- 501-char name rejected, 500-char name accepted
- 2001-char note rejected, 2000-char note accepted
- ValidationError with descriptive message

## Edge cases
- None

---

# Scenario: Additional teams management

**ID**: ORG-010
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_AdditionalTeamsEmpty"
- `internal/api/service_test.go` → "TestOrgService_Update_AllFields"

## Behavior
The additionalTeams field accepts a comma-separated string. Empty string clears additional teams.

## Invariants
- Comma-separated values parsed and trimmed
- Empty string sets additionalTeams to nil
- Whitespace-only entries filtered out

## Edge cases
- None

---

# Scenario: Add person

**ID**: ORG-011
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Add"
- `internal/api/service_test.go` → "TestOrgService_Add_RejectsInvalidStatus"
- `internal/api/service_test.go` → "TestOrgService_Add_RejectsInvalidManager"
- `internal/api/handlers_test.go` → "TestAddHandler"

## Behavior
A new person is added with a generated UUID. Status and manager are validated.

## Invariants
- New UUID assigned
- Invalid status rejected
- Non-existent manager rejected
- Person appended to working slice
- Index rebuilt after add

## Edge cases
- None

---

# Scenario: Delete and restore (soft delete)

**ID**: ORG-012
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Delete"
- `internal/api/service_test.go` → "TestOrgService_SoftDelete"
- `internal/api/service_test.go` → "TestOrgService_Restore"
- `internal/api/service_test.go` → "TestOrgService_Restore_ManagerGone"
- `internal/api/service_test.go` → "TestOrgService_Delete_ReturnsBothArrays"
- `internal/api/service_test.go` → "TestOrgService_Restore_ReturnsBothArrays"
- `internal/api/handlers_test.go` → "TestDeleteHandler"
- `internal/api/handlers_test.go` → "TestRestoreHandler"
- `web/e2e/smoke.spec.ts` → "delete and restore"

## Behavior
Delete moves a person to the recycled list. Restore moves them back. Reports of the deleted person have their managerId cleared.

## Invariants
- Deleted person removed from working, added to recycled
- Direct reports re-parented to empty managerId
- Restored person appended to working
- If manager was deleted during absence, managerId cleared on restore
- Index rebuilt after both operations

## Edge cases
- Restore when manager was deleted (managerId cleared)

---

# Scenario: Nonexistent person errors

**ID**: ORG-013
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Delete_PersonNotFound"
- `internal/api/service_test.go` → "TestOrgService_Restore_PersonNotFound"
- `internal/api/adversarial_test.go` → "TestAdversarial_DeleteNonexistentPerson"
- `internal/api/adversarial_test.go` → "TestAdversarial_RestoreFromEmptyBin"
- `internal/api/handlers_test.go` → "TestDeleteHandler_PersonNotFound"
- `internal/api/handlers_test.go` → "TestRestoreHandler_PersonNotFound"

## Behavior
Deleting or restoring a non-existent person ID returns a NotFoundError.

## Invariants
- HTTP 404 returned
- No state mutation

## Edge cases
- None

---

# Scenario: Empty recycle bin

**ID**: ORG-014
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_EmptyBin"
- `internal/api/handlers_test.go` → "TestEmptyBinHandler"

## Behavior
Emptying the bin permanently removes all recycled people.

## Invariants
- Recycled list set to nil
- Working list unchanged

## Edge cases
- Empty bin when already empty (no-op)

---

# Scenario: Reorder working people

**ID**: ORG-015
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Reorder"
- `internal/api/service_test.go` → "TestOrgService_Reorder_PartialIds"
- `internal/api/handlers_test.go` → "TestReorderHandler"

## Behavior
Sets SortIndex for each person in the provided order. Partial ID lists leave unmentioned people's indices unchanged.

## Invariants
- SortIndex matches position in the provided list
- Unmentioned people retain existing SortIndex
- Working slice not reordered (only indices change)

## Edge cases
- Partial ID list (subset of working people)

---

# Scenario: Reset to original

**ID**: ORG-016
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_ResetToOriginal"
- `internal/api/handlers_test.go` → "TestResetHandler"

## Behavior
Discards all working changes and restores from the original import.

## Invariants
- Working reset to deep copy of original
- Recycled cleared
- Pods reset to original pods
- Settings re-derived from original
- Index rebuilt

## Edge cases
- None

---

# Scenario: Team cascade for front-line managers

**ID**: ORG-017
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_IsFrontlineManager"
- `internal/api/service_test.go` → "TestOrgService_Update_TeamCascadeFrontlineManager"
- `internal/api/service_test.go` → "TestOrgService_Update_TeamNoCascadeNonFrontlineManager"
- `web/e2e/features.spec.ts` → "team cascade for front-line manager"

## Behavior
When a front-line manager's team changes, the team change cascades to all their direct reports. Non-front-line managers don't cascade.

## Invariants
- Front-line = manager with only IC direct reports (no sub-managers)
- Direct reports' team updated to match
- Pod assignments reassigned after cascade
- Non-front-line managers only update their own team

## Edge cases
- None

---

# Scenario: Pod operations

**ID**: ORG-018
**Area**: model-validation
**Tests**:
- `internal/api/pods_test.go` → "TestSeedPods_*"
- `internal/api/pods_test.go` → "TestCleanupEmptyPods"
- `internal/api/pods_test.go` → "TestFindPod"
- `internal/api/pods_test.go` → "TestFindPodByID"
- `internal/api/pods_test.go` → "TestRenamePod"
- `internal/api/pods_test.go` → "TestReassignPersonPod_*"
- `internal/api/pods_test.go` → "TestCopyPods"
- `internal/api/service_test.go` → "TestOrgService_Update_PodAutoCreate"
- `internal/api/service_test.go` → "TestOrgService_Update_PodReusesExisting"
- `internal/api/service_test.go` → "TestOrgService_Update_PodClearRemovesAssignment"
- `web/e2e/features.spec.ts` → "pod creation via edit"
- `web/e2e/features.spec.ts` → "pod sidebar via info button"

## Behavior
Pods are created from the Pod field during upload (seeding). They can be created, renamed, and cleaned up. Empty pods are removed automatically.

## Invariants
- Pods seeded only from explicit Pod field values
- Root nodes (no manager) don't get pods
- Cleanup removes pods with no members
- Rename updates all member references
- Deep copy produces independent slice

## Edge cases
- Nil input to CopyPods returns nil

---

# Scenario: Pod auto-creation on move

**ID**: ORG-019
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_PodAutoCreate"
- `internal/api/service_test.go` → "TestOrgService_Update_PodReusesExisting"
- `internal/api/service_test.go` → "TestOrgService_Update_PodClearRemovesAssignment"

## Behavior
Setting a person's pod field to a name that doesn't exist under their manager auto-creates the pod. Setting to empty clears the assignment. Setting to an existing pod name reuses it.

## Invariants
- Non-existent pod name creates new Pod with UUID
- Empty string clears person's pod and triggers cleanup
- Existing pod name matched by (name, managerId) pair

## Edge cases
- None
```

- [ ] **Step 2: Run check-scenarios**

Run: `cd /home/zach/code/grove && make check-scenarios`
Expected: "All scenarios covered."

- [ ] **Step 3: Commit**

```bash
jj describe -m "docs: add model-validation.md with 19 ORG scenarios"
jj new
```

---

### Task 11: Create ui-state.md scenarios

**Files:**
- Create: `docs/scenarios/ui-state.md`

- [ ] **Step 1: Write ui-state.md**

```markdown
# UI State Scenarios

---

# Scenario: Deep link URL state sync

**ID**: UI-011
**Area**: ui-state
**Tests**:
- `web/src/hooks/useDeepLink.test.ts` → "useDeepLink"

## Behavior
URL query parameters reflect current UI state (selected person, view mode). Navigating to a URL with query params restores the selection and view.

## Invariants
- Selection changes update URL without page reload
- URL params parsed on mount to restore state
- Invalid IDs in URL params are ignored

## Edge cases
- None

---

# Scenario: Unsaved changes warning

**ID**: UI-012
**Area**: ui-state
**Tests**:
- `web/src/store/useDirtyTracking.test.ts` → "useDirtyTracking"

## Behavior
The beforeunload event fires a warning when the working state differs from the original. When clean (no changes), no warning is shown.

## Invariants
- Dirty state detected by reference inequality (working !== original)
- beforeunload handler registered when dirty
- Handler removed when clean
- Loaded flag must be true for tracking to activate

## Edge cases
- None

---

# Scenario: Batch edit operations

**ID**: UI-013
**Area**: ui-state
**Tests**:
- `web/src/components/DetailSidebar.test.tsx` → "batch edit"

## Behavior
Multi-selecting people opens the sidebar in batch mode. Only dirty fields are submitted. Manager changes are applied separately via reparent.

## Invariants
- Batch form shows mixed values for differing fields
- Only fields marked dirty are submitted
- Manager change triggers reparent for each selected person
- Save status reflects aggregate success/failure

## Edge cases
- All selected people have same value (no mixed indicator)
- Private checkbox in batch mode
```

- [ ] **Step 2: Run check-scenarios**

Run: `cd /home/zach/code/grove && make check-scenarios`
Expected: "All scenarios covered."

- [ ] **Step 3: Commit**

```bash
jj describe -m "docs: add ui-state.md with deep link, dirty tracking, and batch edit scenarios"
jj new
```

---

### Task 12: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full Go test suite with race detection**

Run: `cd /home/zach/code/grove && go test -race -count=1 ./...`
Expected: all tests pass

- [ ] **Step 2: Run frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Run scenario check**

Run: `cd /home/zach/code/grove && make check-scenarios`
Expected: "All scenarios covered."

- [ ] **Step 4: Build the project**

Run: `cd /home/zach/code/grove && make build`
Expected: successful build

- [ ] **Step 5: Commit final state if needed**

If any fixups were required during verification, commit them:
```bash
jj describe -m "fix: address issues found during final verification"
jj new
```
