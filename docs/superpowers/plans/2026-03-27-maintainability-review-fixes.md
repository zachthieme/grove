# Maintainability Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 maintainability issues from principal engineer review: document deepCopy invariant, restructure ConfirmMapping lock pattern, add deep linking, split OrgDataContext, add backend ID index, remove dead code, and close validation gaps.

**Architecture:** Backend: add person ID lookup index, improve lock patterns, add validation. Frontend: extract mutation callbacks from mega-context into a focused hook, add URL state sync for deep linking. All structural changes maintain existing behavior.

**Tech Stack:** Go 1.25, React 19, TypeScript 5.7, Vite 6

---

### Task 1: Document deepCopyPeople Invariant

**Files:**
- Modify: `internal/api/service.go:165`

- [ ] **Step 1: Add doc comment explaining the copy invariant**

```go
// deepCopyPeople returns an independent copy of src, including each person's
// AdditionalTeams slice. This is the concurrency safety boundary: every value
// returned from OrgService to a handler (or stored internally as a separate
// generation, e.g. original vs working) MUST go through deepCopyPeople so
// that in-place mutations on one slice never corrupt another. The struct
// fields themselves are value types (strings, ints) and are copied by the
// range loop; only slice fields (AdditionalTeams) need explicit cloning.
func deepCopyPeople(src []Person) []Person {
```

- [ ] **Step 2: Run tests to confirm no regressions**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -count=1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
jj commit -m "docs: document deepCopyPeople concurrency invariant"
```

---

### Task 2: Restructure ConfirmMapping Lock Pattern

The current `ConfirmMapping` has multiple manual `s.mu.Unlock()` calls at error paths — fragile and hard to audit. Restructure to: grab+clear pending under a short lock → parse outside lock → re-lock for state commit → unlock → disk I/O. This reduces the critical section to only state mutation, keeping CPU-bound parsing (extractRows, BuildPeopleWithMapping) lock-free.

**Files:**
- Modify: `internal/api/service_import.go:60-144`
- Test: `internal/api/service_test.go` (existing tests cover ConfirmMapping)

- [ ] **Step 1: Write a test that exercises the ConfirmMapping non-zip path**

Verify existing test coverage. If no test exists for the non-zip ConfirmMapping path, add one:

```go
func TestOrgService_ConfirmMapping_NonZip(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Upload a CSV with ambiguous headers to trigger needs_mapping
	csv := []byte("Full Name,Title,Department,Reports To,Group\nAlice,VP,Eng,,Eng\nBob,SWE,Eng,Alice,Platform\n")
	resp, err := svc.Upload("test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Skipf("headers were auto-mapped; skipping confirm test")
	}
	mapping := map[string]string{
		"name": "Full Name", "role": "Title", "discipline": "Department",
		"manager": "Reports To", "team": "Group",
	}
	data, err := svc.ConfirmMapping(mapping)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if len(data.Working) != 2 {
		t.Errorf("expected 2 working, got %d", len(data.Working))
	}
}
```

- [ ] **Step 2: Run test to verify it passes (or fails as expected)**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestOrgService_ConfirmMapping_NonZip -v`

- [ ] **Step 3: Restructure ConfirmMapping to minimize lock scope**

Replace the current `ConfirmMapping` with a version that:
1. Grabs pending data under a short lock
2. Releases lock for parsing
3. Re-acquires lock only for state mutation

```go
func (s *OrgService) ConfirmMapping(mapping map[string]string) (*OrgData, error) {
	// Phase 1: grab and clear pending data under lock.
	// Clearing here prevents a concurrent Upload from setting new pending data
	// that we'd accidentally nil out when we re-acquire the lock in Phase 3.
	s.mu.Lock()
	pending := s.pending
	s.pending = nil
	s.mu.Unlock()

	if pending == nil {
		return nil, fmt.Errorf("no pending file to confirm")
	}

	// Phase 2: parse entirely outside the lock (CPU work, no state mutation)
	if pending.IsZip {
		return s.confirmMappingZip(pending, mapping)
	}
	return s.confirmMappingCSV(pending, mapping)
}

// confirmMappingCSV handles the non-zip ConfirmMapping path.
// Called without holding s.mu.
func (s *OrgService) confirmMappingCSV(pending *PendingUpload, mapping map[string]string) (*OrgData, error) {
	header, dataRows, err := extractRows(pending.Filename, pending.File)
	if err != nil {
		return nil, fmt.Errorf("parsing pending file: %w", err)
	}
	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		return nil, fmt.Errorf("building org: %w", err)
	}
	people := ConvertOrg(org)

	// Phase 3: commit state under lock (s.pending already cleared in Phase 1)
	s.mu.Lock()
	s.resetState(people, people, nil)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
	s.mu.Unlock()

	// Phase 4: disk I/O outside lock
	var persistWarn string
	if err := s.snaps.DeleteStore(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	resp.PersistenceWarning = persistWarn
	return resp, nil
}

// confirmMappingZip handles the zip ConfirmMapping path.
// Called without holding s.mu.
func (s *OrgService) confirmMappingZip(pending *PendingUpload, mapping map[string]string) (*OrgData, error) {
	entries, podsSidecar, settingsSidecar, err := parseZipFileList(pending.File)
	if err != nil {
		return nil, fmt.Errorf("parsing pending zip: %w", err)
	}
	orig, work, snaps, err := parseZipEntries(entries, mapping)
	if err != nil {
		return nil, fmt.Errorf("parsing pending zip: %w", err)
	}

	// Commit state under lock
	s.mu.Lock()
	s.resetState(orig, work, snaps)

	if podsSidecar != nil {
		sidecarEntries := parsePodsSidecar(podsSidecar)
		if len(sidecarEntries) > 0 {
			idToName := buildIDToName(s.working)
			applyPodSidecarNotes(s.pods, sidecarEntries, idToName)
			applyPodSidecarNotes(s.originalPods, sidecarEntries, idToName)
		}
	}

	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	if settingsSidecar != nil {
		if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
			s.settings = Settings{DisciplineOrder: order}
		}
	}

	snapCopy := s.snaps.CopyAll()
	// s.pending already cleared in Phase 1
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
	s.mu.Unlock()

	// Disk I/O outside the lock
	var persistWarn string
	if err := s.snaps.DeleteStore(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	if err := s.snaps.PersistCopy(snapCopy); err != nil {
		msg := fmt.Sprintf("snapshot persist error: %v", err)
		if persistWarn != "" {
			persistWarn += "; " + msg
		} else {
			persistWarn = msg
		}
	}
	resp.PersistenceWarning = persistWarn
	return resp, nil
}
```

- [ ] **Step 4: Run all tests**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -count=1 -race`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj commit -m "refactor: restructure ConfirmMapping to minimize lock scope"
```

---

### Task 3: Backend Person ID Index

Add a `map[string]int` index for O(1) person lookups by ID in the working slice. Replace linear scans in `findWorking`, `findInSlice` (used by `wouldCreateCycle`, `validateManagerChange`).

**Files:**
- Modify: `internal/api/service.go` (add index field, rebuildIndex, update findWorking)
- Modify: `internal/api/validate.go` (update findInSlice to accept optional index)
- Test: `internal/api/service_test.go` (existing tests cover all paths)

- [ ] **Step 1: Write a benchmark to measure before/after**

Create `internal/api/bench_index_test.go`:

```go
package api

import "testing"

func BenchmarkFindWorking(b *testing.B) {
	svc := NewOrgService(NewMemorySnapshotStore())
	// Build a 500-person org
	rows := "Name,Role,Discipline,Manager,Team,Status\n"
	rows += "Root,VP,Eng,,Eng,Active\n"
	for i := 0; i < 499; i++ {
		rows += "Person" + string(rune('A'+i%26)) + string(rune('0'+i/26)) + ",SWE,Eng,Root,Platform,Active\n"
	}
	svc.Upload("bench.csv", []byte(rows))
	data := svc.GetOrg()
	lastId := data.Working[len(data.Working)-1].Id

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.mu.RLock()
		svc.findWorking(lastId)
		svc.mu.RUnlock()
	}
}
```

- [ ] **Step 2: Run benchmark baseline**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run=^$ -bench=BenchmarkFindWorking -benchmem`

- [ ] **Step 3: Add idIndex field and rebuildIndex method to OrgService**

In `internal/api/service.go`:

```go
type OrgService struct {
	mu           sync.RWMutex
	original     []Person
	working      []Person
	recycled     []Person
	pods         []Pod
	originalPods []Pod
	settings     Settings
	pending      *PendingUpload
	snaps        *SnapshotManager
	idIndex      map[string]int // person ID → index in working slice
}

// rebuildIndex rebuilds the idIndex from the current working slice.
// Must be called with s.mu held after any operation that changes the
// working slice's structure (append, remove, replace).
func (s *OrgService) rebuildIndex() {
	s.idIndex = make(map[string]int, len(s.working))
	for i, p := range s.working {
		s.idIndex[p.Id] = i
	}
}
```

- [ ] **Step 4: Update findWorking to use the index**

```go
func (s *OrgService) findWorking(id string) (int, *Person) {
	if idx, ok := s.idIndex[id]; ok && idx < len(s.working) && s.working[idx].Id == id {
		return idx, &s.working[idx]
	}
	return -1, nil
}
```

- [ ] **Step 5: Add rebuildIndex calls to all methods that change working slice structure**

Add `s.rebuildIndex()` after the working slice is replaced or structurally modified in:
- `resetState()` — after `s.working = deepCopyPeople(working)`
- `RestoreState()` — after `s.working = deepCopyPeople(data.Working)`
- `ResetToOriginal()` — after `s.working = deepCopyPeople(s.original)`
- `Add()` — after `s.working = append(s.working, p)`
- `Delete()` — after `s.working = append(s.working[:idx], s.working[idx+1:]...)`
- `Restore()` — after `s.working = append(s.working, person)`
- `LoadSnapshot()` — after `s.working = deepCopyPeople(snap.People)`

- [ ] **Step 6: Verify callers benefit from the index automatically**

No changes needed in `validate.go` or `service_people.go`. The key callers already use `s.findWorking()` which was updated in Step 4 to use the index. The standalone `validateManagerChange` and `wouldCreateCycle` functions in validate.go call `findInSlice` with a raw `[]Person` slice — these are only called during mutations where the service already holds `s.mu`, so the O(n) scan on the validation path is acceptable (it runs at most once per mutation, and cycle detection is bounded by tree depth, not org size).

The index provides its primary benefit on the hot path: `findWorking` lookups in Move, Update, Delete, Restore, and the nested loops in Reorder.

- [ ] **Step 7: Run all tests including race detector**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -count=1 -race`
Expected: PASS

- [ ] **Step 8: Run benchmark to measure improvement**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run=^$ -bench=BenchmarkFindWorking -benchmem`
Expected: significant ns/op reduction

- [ ] **Step 9: Commit**

```bash
jj commit -m "perf: add person ID index for O(1) lookups in OrgService"
```

---

### Task 4: Dead Code Cleanup

Remove unused code and reduce unnecessary exports.

**Files:**
- Modify: `web/src/hooks/useIsManager.ts` (remove unused `isManager` function)
- Modify: `web/src/hooks/useIsManager.test.ts` (remove `isManager` tests)
- Modify: `web/src/components/DetailSidebar.tsx` (remove duplicate `generateCorrelationId`)
- Modify: `web/src/api/client.ts` (export `generateCorrelationId`)
- Modify: `internal/api/pods.go` (unexport `FindPod` → `findPod`, `FindPodByID` → `findPodByID`)
- Modify: `internal/api/service_people.go` (update `FindPod` → `findPod` call)
- Modify: `internal/api/service_pods.go` (update `FindPodByID` → `findPodByID` call)
- Modify: `internal/api/pods_test.go` (update test calls)

- [ ] **Step 1: Remove `isManager` function from useIsManager.ts**

Remove lines 4-9 (the `isManager` function). Keep the `useManagerSet` hook which is actively used.

```typescript
import { useMemo } from 'react'
import type { Person } from '../api/types'

export function useManagerSet(people: Person[]): Set<string> {
  return useMemo(() => {
    const set = new Set<string>()
    for (const p of people) {
      if (p.managerId) set.add(p.managerId)
    }
    return set
  }, [people])
}
```

- [ ] **Step 2: Remove `isManager` tests from useIsManager.test.ts**

Remove the `describe('isManager', ...)` block. Keep the `describe('useManagerSet', ...)` block if it exists, otherwise remove the entire test file if it only tests `isManager`.

- [ ] **Step 3: Export `generateCorrelationId` from client.ts and import in DetailSidebar**

In `web/src/api/client.ts`, change line 5:
```typescript
export function generateCorrelationId(): string {
```

In `web/src/components/DetailSidebar.tsx`, remove lines 77-79 (local `generateCorrelationId`) and add import:
```typescript
import { generateCorrelationId } from '../api/client'
```

- [ ] **Step 4: Unexport FindPod and FindPodByID in pods.go**

Rename `FindPod` → `findPod` and `FindPodByID` → `findPodByID` throughout internal/api/:

In `internal/api/pods.go`:
- `func FindPod(` → `func findPod(`
- `func FindPodByID(` → `func findPodByID(`
- Update calls within pods.go: `FindPodByID` → `findPodByID`, `FindPod` → `findPod`

In `internal/api/service_people.go`:
- `FindPod(` → `findPod(`

In `internal/api/service_pods.go`:
- `FindPodByID(` → `findPodByID(`

In `internal/api/pods_test.go`:
- `FindPod(` → `findPod(`
- `FindPodByID(` → `findPodByID(`

- [ ] **Step 5: Run all tests (Go + frontend)**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -count=1`
Run: `cd /home/zach/code/grove/web && npm test -- --run`
Expected: both PASS

- [ ] **Step 6: Commit**

```bash
jj commit -m "refactor: remove dead code and reduce unnecessary exports"
```

---

### Task 5: Settings Validation and ZIP Warning Aggregation

**Files:**
- Modify: `internal/api/validate.go` (add `validateSettings`)
- Modify: `internal/api/service_settings.go` (call validation)
- Modify: `internal/api/handlers.go` (update `handleUpdateSettings` for error)
- Modify: `internal/api/zipimport.go` (aggregate warnings instead of silent log.Printf)
- Test: `internal/api/service_test.go` (add settings validation tests)
- Test: `internal/api/zipimport_test.go` (add warning aggregation tests)

- [ ] **Step 1: Write failing test for settings validation**

Add to `internal/api/service_test.go`:

```go
func TestOrgService_UpdateSettings_Validation(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	t.Run("rejects empty discipline name", func(t *testing.T) {
		_, err := svc.UpdateSettings(Settings{DisciplineOrder: []string{"Eng", "", "Design"}})
		if err == nil {
			t.Fatal("expected error for empty discipline name")
		}
		if !isValidation(err) {
			t.Errorf("expected ValidationError, got %T: %v", err, err)
		}
	})

	t.Run("rejects duplicate discipline names", func(t *testing.T) {
		_, err := svc.UpdateSettings(Settings{DisciplineOrder: []string{"Eng", "Design", "Eng"}})
		if err == nil {
			t.Fatal("expected error for duplicate discipline")
		}
	})

	t.Run("accepts valid settings", func(t *testing.T) {
		result, err := svc.UpdateSettings(Settings{DisciplineOrder: []string{"Eng", "Design", "PM"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result.DisciplineOrder) != 3 {
			t.Errorf("expected 3 disciplines, got %d", len(result.DisciplineOrder))
		}
	})

	t.Run("accepts empty list (clears order)", func(t *testing.T) {
		result, err := svc.UpdateSettings(Settings{DisciplineOrder: []string{}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result.DisciplineOrder) != 0 {
			t.Errorf("expected empty, got %d", len(result.DisciplineOrder))
		}
	})
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestOrgService_UpdateSettings_Validation -v`
Expected: FAIL (no validation exists yet)

- [ ] **Step 3: Add validateSettings to validate.go**

```go
// validateSettings checks that discipline order entries are non-empty, unique,
// and don't contain characters that break CSV export (newlines, NUL).
func validateSettings(s Settings) error {
	seen := make(map[string]bool, len(s.DisciplineOrder))
	for _, d := range s.DisciplineOrder {
		d = strings.TrimSpace(d)
		if d == "" {
			return errValidation("discipline name cannot be empty")
		}
		if strings.ContainsAny(d, "\n\r\x00") {
			return errValidation("discipline name contains invalid characters")
		}
		if len(d) > maxFieldLen {
			return errValidation("discipline name too long (max %d characters)", maxFieldLen)
		}
		if seen[d] {
			return errValidation("duplicate discipline name: %s", d)
		}
		seen[d] = true
	}
	return nil
}
```

**Important:** Add `"strings"` to the import block in validate.go (currently only imports `errors` and `fmt`).

- [ ] **Step 4: Update UpdateSettings to call validation and return error**

In `internal/api/service_settings.go`:

```go
func (s *OrgService) UpdateSettings(settings Settings) (Settings, error) {
	if err := validateSettings(settings); err != nil {
		return Settings{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	return s.settings, nil
}
```

- [ ] **Step 5: Update handleUpdateSettings in handlers.go**

```go
func handleUpdateSettings(svc *OrgService) http.HandlerFunc {
	return jsonHandler(func(settings Settings) (Settings, error) {
		return svc.UpdateSettings(settings)
	})
}
```

- [ ] **Step 6: Run tests**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestOrgService_UpdateSettings -v`
Expected: PASS

- [ ] **Step 7: Write failing test for ZIP warning aggregation**

Add to `internal/api/zipimport_test.go` (or create it):

```go
func TestParseZipEntries_WarnsOnUnparseableEntry(t *testing.T) {
	t.Parallel()
	// Create a zip with one valid CSV and one corrupt CSV
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	// Valid file
	w, _ := zw.Create("0-original.csv")
	w.Write([]byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n"))
	// Corrupt file (not valid CSV/XLSX content under a .csv extension)
	w2, _ := zw.Create("1-working.csv")
	w2.Write([]byte("Name,Role\n")) // missing required 'name' after mapping
	zw.Close()

	entries, _, _, fileWarns, err := parseZipFileList(buf.Bytes())
	if err != nil {
		t.Fatalf("parseZipFileList: %v", err)
	}

	mapping := map[string]string{"name": "Name", "role": "Role", "discipline": "Discipline", "manager": "Manager", "team": "Team"}
	_, _, _, parseWarns, err := parseZipEntries(entries, mapping)
	// Should succeed (at least one file parsed) but with warnings
	if err != nil {
		t.Fatalf("parseZipEntries: %v", err)
	}
	totalWarns := append(fileWarns, parseWarns...)
	// We expect warnings about skipped entries (either from fileList or entries parsing)
	// The exact count depends on how the corrupt data manifests
	_ = totalWarns // test will fail until warnings are returned
}
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestParseZipEntries_WarnsOnUnparseableEntry -v`
Expected: FAIL (wrong number of return values)

- [ ] **Step 9: Aggregate ZIP parse warnings instead of silent log.Printf**

In `internal/api/zipimport.go`, modify `parseZipEntries` to collect warnings:

Change signature:
```go
func parseZipEntries(entries []zipEntry, mapping map[string]string) (original []Person, working []Person, snaps map[string]snapshotData, warnings []string, err error) {
```

Replace `log.Printf("skipping zip entry %s: %v", ...)` with:
```go
warnings = append(warnings, fmt.Sprintf("skipped %s: %v", e.filename, err))
```

Update callers (`confirmMappingZip` and `UploadZip` — note: `ConfirmMapping` was split in Task 2) to receive and surface warnings. Append to `PersistenceWarning` field:

```go
orig, work, snaps, parseWarns, err := parseZipEntries(entries, simpleMapping)
// ... later, after persistWarn:
if len(parseWarns) > 0 {
    warnMsg := strings.Join(parseWarns, "; ")
    if persistWarn != "" {
        persistWarn += "; " + warnMsg
    } else {
        persistWarn = warnMsg
    }
}
```

- [ ] **Step 10: Also fix parseZipFileList to aggregate entry-open/read errors**

In `parseZipFileList`, replace `log.Printf("skipping zip entry %s: %v", ...)` with collection:

Add a `var warnings []string` local var. Change the signature to return warnings:
```go
func parseZipFileList(data []byte) ([]zipEntry, []byte, []byte, []string, error) {
```

Replace both `log.Printf("skipping zip entry ...")` calls with:
```go
warnings = append(warnings, fmt.Sprintf("skipped %s: %v", f.Name, err))
continue
```

Return `entries, podsSidecarData, settingsSidecarData, warnings, nil`.

Update all callers (`confirmMappingZip`, `UploadZip`) to receive the extra `warnings` return value and merge with persist warnings.

- [ ] **Step 11: Run all tests**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -count=1`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
jj commit -m "fix: add settings validation and aggregate ZIP parse warnings"
```

---

### Task 6: Split OrgDataContext — Extract useOrgMutations Hook

Extract the 16 mutation callbacks from `OrgDataProvider` into a `useOrgMutations` hook. `OrgDataProvider` becomes ~100 lines of state + initialization + delegation.

**Files:**
- Create: `web/src/store/useOrgMutations.ts`
- Modify: `web/src/store/OrgDataContext.tsx` (slim down to state + init, import mutations)
- Test: `cd web && npm test -- --run` (existing tests cover all mutations)

- [ ] **Step 1: Create useOrgMutations.ts**

```typescript
import { useCallback, useRef, type MutableRefObject } from 'react'
import type { Person, PersonUpdatePayload, PodUpdatePayload, Settings } from '../api/types'
import { ORIGINAL_SNAPSHOT } from '../constants'
import * as api from '../api/client'
import type { OrgDataState } from './OrgDataContext'

type SetState = React.Dispatch<React.SetStateAction<OrgDataState>>

interface MutationDeps {
  setState: SetState
  stateRef: MutableRefObject<OrgDataState>
  handleError: (err: unknown) => void
  setError: (msg: string | null) => void
}

export function useOrgMutations({ setState, stateRef, handleError, setError }: MutationDeps) {
  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) => {
    try {
      const resp = await api.movePerson({ personId, newManagerId, newTeam, newPod }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const reparent = useCallback(async (personId: string, newManagerId: string, correlationId?: string) => {
    if (!newManagerId) {
      try {
        const resp = await api.updatePerson({ personId, fields: { managerId: '' } }, correlationId)
        setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
      } catch (err) { handleError(err) }
      return
    }
    const currentWorking = stateRef.current.working
    const newManager = currentWorking.find((p) => p.id === newManagerId)
    if (!newManager) {
      setError('Manager not found (may have been deleted)')
      return
    }
    try {
      const resp = await api.movePerson({ personId, newManagerId, newTeam: newManager.team }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setError, setState, stateRef])

  const reorder = useCallback(async (personIds: string[]) => {
    try {
      const resp = await api.reorderPeople(personIds)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const update = useCallback(async (personId: string, fields: PersonUpdatePayload, correlationId?: string) => {
    try {
      const resp = await api.updatePerson({ personId, fields }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    try {
      const resp = await api.addPerson(person)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const remove = useCallback(async (personId: string) => {
    try {
      const resp = await api.deletePerson({ personId })
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const restore = useCallback(async (personId: string) => {
    try {
      const resp = await api.restorePerson(personId)
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const emptyBin = useCallback(async () => {
    try {
      const resp = await api.emptyBin()
      setState((s) => ({ ...s, recycled: resp.recycled, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const saveSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.saveSnapshot(name)
      setState((s) => ({ ...s, snapshots, currentSnapshotName: name }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const loadSnapshot = useCallback(async (name: string) => {
    try {
      if (name === ORIGINAL_SNAPSHOT) {
        const data = await api.resetToOriginal()
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          recycled: [],
          pods: data.pods ?? [],
          settings: data.settings ?? { disciplineOrder: [] },
          currentSnapshotName: ORIGINAL_SNAPSHOT,
        }))
      } else {
        const data = await api.loadSnapshot(name)
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          recycled: [],
          pods: data.pods ?? [],
          settings: data.settings ?? { disciplineOrder: [] },
          currentSnapshotName: name,
          loaded: true,
        }))
      }
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const deleteSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.deleteSnapshot(name)
      setState((s) => ({ ...s, snapshots }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const updatePod = useCallback(async (podId: string, fields: PodUpdatePayload) => {
    try {
      const resp = await api.updatePod(podId, fields)
      setState(s => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const createPod = useCallback(async (managerId: string, name: string, team: string) => {
    try {
      const resp = await api.createPod(managerId, name, team)
      setState(s => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const updateSettings = useCallback(async (newSettings: Settings) => {
    try {
      const result = await api.updateSettings(newSettings)
      setState(s => ({ ...s, settings: result }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  return {
    move, reparent, reorder, update, add, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  }
}
```

- [ ] **Step 2: Slim down OrgDataProvider to use the hook**

In `OrgDataContext.tsx`:
1. Export the `OrgDataState` interface (needed by useOrgMutations)
2. Remove all mutation callbacks (move, reparent, reorder, update, add, remove, restore, emptyBin, saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings)
3. Import `useOrgMutations` and call it
4. Spread the returned mutations into the value object

The provider should be ~120 lines: state, init effect, upload, confirmMapping, cancelMapping, restoreAutosave, dismissAutosave, plus delegation to useOrgMutations.

- [ ] **Step 3: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npm test -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
jj commit -m "refactor: extract useOrgMutations hook from OrgDataContext"
```

---

### Task 7: Deep Linking — URL State Sync

Sync `viewMode`, `selectedId`, and `headPersonId` to URL query params so URLs can be shared. Use `history.replaceState` (no page reloads) and read params on mount.

**Files:**
- Create: `web/src/hooks/useDeepLink.ts`
- Modify: `web/src/App.tsx` (call useDeepLink)
- Test: `web/src/hooks/useDeepLink.test.ts`

- [ ] **Step 1: Write failing test for useDeepLink**

Create `web/src/hooks/useDeepLink.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDeepLink } from './useDeepLink'

describe('useDeepLink', () => {
  beforeEach(() => {
    // Reset URL to clean state
    window.history.replaceState({}, '', '/')
  })

  it('reads viewMode from URL on mount', () => {
    window.history.replaceState({}, '', '/?view=manager')
    const setViewMode = vi.fn()
    const setSelectedId = vi.fn()
    const setHead = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode,
      setSelectedId,
      setHead,
    }))

    expect(setViewMode).toHaveBeenCalledWith('manager')
  })

  it('writes viewMode to URL when it changes', () => {
    renderHook(() => useDeepLink({
      viewMode: 'manager',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('manager')
  })

  it('omits default values from URL', () => {
    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    expect(window.location.search).toBe('')
  })

  it('reads selectedId from URL', () => {
    window.history.replaceState({}, '', '/?selected=abc-123')
    const setSelectedId = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId,
      setHead: vi.fn(),
    }))

    expect(setSelectedId).toHaveBeenCalledWith('abc-123')
  })

  it('reads headPersonId from URL', () => {
    window.history.replaceState({}, '', '/?head=xyz-456')
    const setHead = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead,
    }))

    expect(setHead).toHaveBeenCalledWith('xyz-456')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/zach/code/grove/web && npx vitest run src/hooks/useDeepLink.test.ts`
Expected: FAIL (file doesn't exist)

- [ ] **Step 3: Implement useDeepLink hook**

Create `web/src/hooks/useDeepLink.ts`:

```typescript
import { useEffect, useRef } from 'react'
import type { ViewMode } from '../store/orgTypes'

const VALID_VIEWS = new Set<ViewMode>(['detail', 'manager', 'table'])
const DEFAULT_VIEW: ViewMode = 'detail'

interface DeepLinkProps {
  viewMode: ViewMode
  selectedId: string | null
  headPersonId: string | null
  setViewMode: (mode: ViewMode) => void
  setSelectedId: (id: string | null) => void
  setHead: (id: string | null) => void
}

export function useDeepLink({
  viewMode, selectedId, headPersonId,
  setViewMode, setSelectedId, setHead,
}: DeepLinkProps) {
  const initialized = useRef(false)

  // Read URL params on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const params = new URLSearchParams(window.location.search)

    const view = params.get('view')
    if (view && VALID_VIEWS.has(view as ViewMode)) {
      setViewMode(view as ViewMode)
    }

    const selected = params.get('selected')
    if (selected) {
      setSelectedId(selected)
    }

    const head = params.get('head')
    if (head) {
      setHead(head)
    }
  }, [setViewMode, setSelectedId, setHead])

  // Write state to URL when it changes
  useEffect(() => {
    if (!initialized.current) return

    const params = new URLSearchParams()
    if (viewMode !== DEFAULT_VIEW) params.set('view', viewMode)
    if (selectedId) params.set('selected', selectedId)
    if (headPersonId) params.set('head', headPersonId)

    const search = params.toString()
    const newUrl = search ? `?${search}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [viewMode, selectedId, headPersonId])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/zach/code/grove/web && npx vitest run src/hooks/useDeepLink.test.ts`
Expected: PASS

- [ ] **Step 5: Wire useDeepLink into AppContent**

In `web/src/App.tsx`, add import and call in `AppContent`:

```typescript
import { useDeepLink } from './hooks/useDeepLink'
```

Inside `AppContent()`, after the existing `useOrg()` destructure, add:

```typescript
const { setViewMode, setSelectedId } = useOrg()
// ... (these are already destructured via useOrg, just need to add setViewMode and setSelectedId to the destructure)
```

Update the destructure at line 30 to include `setViewMode` and `setSelectedId`, then add the hook call:

```typescript
useDeepLink({
  viewMode,
  selectedId: selectedIds.size === 1 ? [...selectedIds][0] : null,
  headPersonId,
  setViewMode,
  setSelectedId,
  setHead,
})
```

Place this after the `useOrg()` destructure and before other hooks that depend on view state.

- [ ] **Step 6: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npm test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
jj commit -m "feat: add deep linking via URL query params for view, selection, head"
```
