# Maintainability, Testing & Scenario Fixes — Design Spec

## Overview

Address all "what to watch" items from a principal engineer review of the Grove codebase. Three categories: maintainability improvements, new tests, and scenario documentation gaps.

---

## 1. PodManager Extraction

**Goal:** Reduce OrgService scope by extracting pod state into a dedicated struct, following the existing SnapshotManager pattern.

**New struct** in `internal/api/pod_manager.go`:

```go
type PodManager struct {
    pods         []Pod
    originalPods []Pod
}
```

NOT thread-safe — called under OrgService.mu, same as SnapshotManager.

**Methods:**
- `NewPodManager() *PodManager`
- `SetState(pods, originalPods []Pod)` — used during import/restore
- `GetPods() []Pod` / `GetOriginalPods() []Pod`
- `Reset()` — resets pods to originalPods
- `ListPods(working []Person) []PodInfo` — needs working people for member count
- `UpdatePod(podID string, fields map[string]string) ([]Pod, error)`
- `CreatePod(managerID, name, team string) ([]Pod, error)`
- `ApplyMoveEffects(person *Person, newManagerID, newTeam string, newPod ...string) []Pod` — handles pod reassignment during moves

**OrgService changes:**
- Remove `pods []Pod` and `originalPods []Pod` fields
- Add `podMgr *PodManager` field
- `service_pods.go` methods become thin wrappers: lock, delegate to podMgr, build result, unlock
- All other methods that touch pods (Move, Update, Delete, Restore, etc.) access via `s.podMgr`

**Existing free functions** (`SeedPods`, `CleanupEmptyPods`, `ReassignPersonPod`, `FindPod`, `FindPodByID`, `RenamePod`, `CopyPods`) stay in `pods.go` as utilities — PodManager calls them internally.

---

## 2. Named Response Structs

**Goal:** Replace all `map[string]any` in handlers.go with typed structs.

**New types in `model.go`:**

```go
type WorkingResponse struct {
    Working []Person `json:"working"`
    Pods    []Pod    `json:"pods"`
}

type AddResponse struct {
    Created Person   `json:"created"`
    Working []Person `json:"working"`
    Pods    []Pod    `json:"pods"`
}

type MutationResponse struct {
    Working  []Person `json:"working"`
    Recycled []Person `json:"recycled"`
    Pods     []Pod    `json:"pods"`
}

type RecycledResponse struct {
    Recycled []Person `json:"recycled"`
}

type HealthResponse struct {
    Status string `json:"status"`
}

type ConfigResponse struct {
    Logging bool `json:"logging"`
}
```

**Handler changes:** Each handler constructs the named struct. JSON keys identical — no API contract change.

---

## 3. context.Context Propagation

**Goal:** Thread context through all public OrgService methods for future cancellation support.

**Changes:**
- All public OrgService methods gain `ctx context.Context` as first parameter
- Handlers pass `r.Context()`
- `ConfirmMapping` checks `ctx.Done()` between Phase 1 (grab pending) and Phase 2 (parse), and between Phase 2 and Phase 3 (commit state)
- All test call sites pass `context.Background()`

---

## 4. DetailSidebar Form Sync Fix

**Goal:** Replace fragile `personDataKey` string concatenation with typed `useMemo` snapshot.

**Replace:**
```typescript
const personDataKey = person
  ? `${person.id}\0${person.name}\0...`
  : ''
```

**With:**
```typescript
const personSnapshot = useMemo(() => {
  if (!person) return null
  return {
    id: person.id, name: person.name, role: person.role,
    discipline: person.discipline, team: person.team,
    managerId: person.managerId, status: person.status,
    employmentType: person.employmentType, level: person.level,
    pod: person.pod, publicNote: person.publicNote,
    privateNote: person.privateNote, private: person.private,
    additionalTeams: person.additionalTeams?.join(','),
  }
}, [person?.id, person?.name, person?.role, person?.discipline,
    person?.team, person?.managerId, person?.status,
    person?.employmentType, person?.level, person?.pod,
    person?.publicNote, person?.privateNote, person?.private,
    person?.additionalTeams?.join(',')])
```

useEffect depends on `personSnapshot` instead of `personDataKey`.

---

## 5. Corrupted Snapshot Recovery Tests

**Goal:** Verify FileSnapshotStore handles bad data gracefully.

**New test file:** `internal/api/snapshot_recovery_test.go`

**Test cases:**
- Malformed JSON → Read() returns error, service starts with empty snapshots
- Truncated/partial JSON → same
- Empty file → treated as no snapshots
- Valid JSON with unexpected schema → graceful degradation

All tests write bad data to a temp file, point FileSnapshotStore at it, call Read(), verify error and no panic.

---

## 6. Context Cancellation Tests

**Goal:** Validate context plumbing works end-to-end.

**New tests in `service_test.go`:**
- `ConfirmMapping` with already-cancelled context → returns context.Canceled, state unchanged
- `ConfirmMapping` with short deadline → returns context.DeadlineExceeded, state unchanged
- `Upload` with cancelled context → returns error before committing state

---

## 7. Frontend Coverage Thresholds

**Goal:** Raise the bar from 70/65/60/72 to 75/70/65/77 (statements/branches/functions/lines).

**File:** `web/vite.config.ts` — update `coverage.thresholds` object.

---

## 8. Scenario Documentation

### 8a. UPLOAD-012 & UPLOAD-013

Add to `docs/scenarios/upload.md`:
- **UPLOAD-012: Header-only CSV** — CSV with headers but zero data rows returns error
- **UPLOAD-013: Duplicate headers** — Duplicate column names resolved by last-column-wins

### 8b. `docs/scenarios/model-validation.md`

New file with 19 scenarios (ORG-001 through ORG-019):
- ORG-001: Move operations
- ORG-002: Cycle detection
- ORG-003: Manager not found
- ORG-004: Pod assignment during move
- ORG-005: Update operations
- ORG-006: Invalid status validation
- ORG-007: Unknown field rejection
- ORG-008: Person not found on update
- ORG-009: Field length validation
- ORG-010: Additional teams management
- ORG-011: Add person
- ORG-012: Delete and restore
- ORG-013: Nonexistent person errors
- ORG-014: Empty recycle bin
- ORG-015: Reorder
- ORG-016: Reset to original
- ORG-017: Team cascade for front-line managers
- ORG-018: Pod operations
- ORG-019: Pod auto-creation on move

### 8c. `docs/scenarios/ui-state.md`

New file with 3 scenarios:
- UI-011: Deep link URL state sync
- UI-012: Unsaved changes warning
- UI-013: Batch edit operations

---

## Files Touched

**Go (service layer):** service.go, service_people.go, service_pods.go, service_import.go, service_settings.go, snapshots.go, handlers.go, model.go, pod_manager.go (new)
**Go (tests):** service_test.go, handlers_test.go, pods_test.go, concurrent_test.go, stress_test.go, adversarial_test.go, snapshot_recovery_test.go (new), + all other test files for ctx param
**Frontend:** DetailSidebar.tsx, vite.config.ts
**Docs:** upload.md, model-validation.md (new), ui-state.md (new)

## Non-Goals

- No API contract changes (JSON keys stay identical)
- No new HTTP endpoints
- No frontend state architecture changes beyond DetailSidebar fix
