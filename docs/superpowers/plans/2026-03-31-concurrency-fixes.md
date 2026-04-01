# Concurrency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two silent-data-loss concurrency bugs in the Go backend (#107 Upload/ConfirmMapping race, #108 snapshot persistence race).

**Architecture:** Add an epoch counter to detect stale ConfirmMapping calls after a concurrent Upload. Move snapshot persistence inside the OrgService mutex so concurrent saves can't overwrite each other on disk.

**Tech Stack:** Go, sync.RWMutex

---

### Task 1: Add scenario entries for CONC-004 and CONC-005

**Files:**
- Modify: `docs/scenarios/concurrency.md`

- [ ] **Step 1: Add CONC-004 scenario**

Append after the CONC-003 section in `docs/scenarios/concurrency.md`:

```markdown
---

# Scenario: Upload/ConfirmMapping race returns conflict

**ID**: CONC-004
**Area**: concurrency
**Tests**:
- `internal/api/service_test.go` → "TestConfirmMapping_RejectsStaleEpoch"
- `internal/api/service_test.go` → "TestConfirmMapping_AcceptsCurrentEpoch"

## Behavior
When a user uploads File A (needs mapping), then uploads File B before confirming A, the ConfirmMapping for A's mapping returns a 409 conflict error. The user must re-confirm with B's mapping.

## Invariants
- ConfirmMapping with a stale epoch returns a conflict error
- ConfirmMapping with the current epoch succeeds normally
- No data is silently lost

## Edge cases
- None

---

# Scenario: Concurrent snapshot saves persist all snapshots

**ID**: CONC-005
**Area**: concurrency
**Tests**:
- `internal/api/concurrent_test.go` → "TestConcurrentSnapshotSaves_BothPersist"

## Behavior
Two concurrent SaveSnapshot calls both persist their data. Neither overwrites the other on disk.

## Invariants
- Both snapshots appear in ListSnapshots after concurrent saves
- Both snapshots are present in the persisted store
- Existing TestConcurrentSnapshotOperations still passes

## Edge cases
- None
```

- [ ] **Step 2: Commit**

```bash
jj describe -m "docs: add CONC-004 and CONC-005 scenarios for #107 and #108"
jj new
```

---

### Task 2: Write failing tests for #107 (epoch counter)

**Files:**
- Modify: `internal/api/service_test.go`

- [ ] **Step 1: Write the failing tests**

Add these tests to `internal/api/service_test.go`:

```go
// Scenarios: CONC-004
func TestConfirmMapping_RejectsStaleEpoch(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())

	// Upload A — needs mapping (non-standard headers)
	csvA := []byte("Full Name,Title\nAlice,VP\n")
	respA, err := svc.Upload(context.Background(), "a.csv", csvA)
	if err != nil {
		t.Fatalf("upload A: %v", err)
	}
	if respA.Status != UploadNeedsMapping {
		t.Skipf("headers auto-mapped; cannot test epoch race")
	}

	// Upload B — supersedes A
	csvB := []byte("Full Name,Title\nBob,SWE\n")
	respB, err := svc.Upload(context.Background(), "b.csv", csvB)
	if err != nil {
		t.Fatalf("upload B: %v", err)
	}
	if respB.Status != UploadNeedsMapping {
		t.Skipf("headers auto-mapped; cannot test epoch race")
	}

	// Confirm with A's mapping — should fail because B superseded it
	_, err = svc.ConfirmMapping(context.Background(), map[string]string{"name": "Full Name", "role": "Title"})
	if err == nil {
		t.Fatal("expected conflict error when confirming stale upload, got nil")
	}
	if !isConflict(err) {
		t.Errorf("expected conflict error, got: %v", err)
	}
}

// Scenarios: CONC-004
func TestConfirmMapping_AcceptsCurrentEpoch(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())

	csv := []byte("Full Name,Title\nAlice,VP\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Skipf("headers auto-mapped; cannot test epoch")
	}

	data, err := svc.ConfirmMapping(context.Background(), map[string]string{"name": "Full Name", "role": "Title"})
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if len(data.Working) != 1 {
		t.Errorf("expected 1 working person, got %d", len(data.Working))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/api/ -run "TestConfirmMapping_(RejectsStaleEpoch|AcceptsCurrentEpoch)" -v`

Expected: `TestConfirmMapping_RejectsStaleEpoch` FAILS (currently ConfirmMapping succeeds for stale uploads). `TestConfirmMapping_AcceptsCurrentEpoch` should PASS (current behavior already works for the happy path).

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add failing tests for Upload/ConfirmMapping epoch race (#107)"
jj new
```

---

### Task 3: Implement epoch counter for #107

**Files:**
- Modify: `internal/api/service.go:17-27` — add `pendingEpoch` field
- Modify: `internal/api/service_import.go:10-58` — increment epoch in Upload
- Modify: `internal/api/service_import.go:88-113` — check epoch in confirmMappingCSV
- Modify: `internal/api/service_import.go:117-161` — check epoch in confirmMappingZip

- [ ] **Step 1: Add pendingEpoch field to OrgService**

In `internal/api/service.go`, add `pendingEpoch` to the struct:

```go
type OrgService struct {
	mu           sync.RWMutex
	original     []Person
	working      []Person
	recycled     []Person
	settings     Settings
	pending      *PendingUpload
	pendingEpoch uint64
	snaps        *SnapshotManager
	podMgr       *PodManager
	idIndex      map[string]int
}
```

- [ ] **Step 2: Increment epoch in Upload when setting pending**

In `internal/api/service_import.go`, in the `Upload` function, increment the epoch when setting `s.pending` (around line 45):

```go
	// Required field (name) not matched with high confidence — hold as pending.
	s.pendingEpoch++
	s.pending = &PendingUpload{File: data, Filename: filename}
```

- [ ] **Step 3: Capture and pass epoch from ConfirmMapping Phase 1**

In `internal/api/service_import.go`, modify `ConfirmMapping` to capture the epoch in Phase 1 and pass it to the helper functions:

```go
func (s *OrgService) ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error) {
	// Phase 1: grab and clear pending data under lock.
	s.mu.Lock()
	pending := s.pending
	epoch := s.pendingEpoch
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
		return s.confirmMappingZip(pending, mapping, epoch)
	}
	return s.confirmMappingCSV(pending, mapping, epoch)
}
```

- [ ] **Step 4: Check epoch in confirmMappingCSV**

Update `confirmMappingCSV` signature to accept epoch and check it in Phase 3:

```go
func (s *OrgService) confirmMappingCSV(pending *PendingUpload, mapping map[string]string, epoch uint64) (*OrgData, error) {
	header, dataRows, err := extractRows(pending.Filename, pending.File)
	if err != nil {
		return nil, errValidation("parsing pending file: %v", err)
	}
	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		return nil, errValidation("building org: %v", err)
	}
	people := ConvertOrg(org)

	// Phase 3: commit state under lock — check epoch hasn't changed
	s.mu.Lock()
	if s.pendingEpoch != epoch {
		s.mu.Unlock()
		return nil, errConflict("upload superseded by a newer upload")
	}
	s.resetState(people, people, nil)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
	s.mu.Unlock()

	// Phase 4: disk I/O outside lock
	var persistWarn string
	if err := s.snaps.DeleteStore(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	resp.PersistenceWarning = persistWarn
	return resp, nil
}
```

- [ ] **Step 5: Check epoch in confirmMappingZip**

Update `confirmMappingZip` signature to accept epoch and check it before committing:

```go
func (s *OrgService) confirmMappingZip(pending *PendingUpload, mapping map[string]string, epoch uint64) (*OrgData, error) {
	entries, podsSidecar, settingsSidecar, fileWarns, err := parseZipFileList(pending.File)
	if err != nil {
		return nil, errValidation("parsing pending zip: %v", err)
	}
	orig, work, snaps, parseWarns, err := parseZipEntries(entries, mapping)
	if err != nil {
		return nil, errValidation("parsing pending zip: %v", err)
	}

	// Commit state under lock — check epoch hasn't changed
	s.mu.Lock()
	if s.pendingEpoch != epoch {
		s.mu.Unlock()
		return nil, errConflict("upload superseded by a newer upload")
	}
	s.resetState(orig, work, snaps)

	if podsSidecar != nil {
		sidecarEntries := parsePodsSidecar(podsSidecar)
		if len(sidecarEntries) > 0 {
			idToName := buildIDToName(s.working)
			s.podMgr.ApplyNotes(sidecarEntries, idToName)
		}
	}

	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	if settingsSidecar != nil {
		if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
			s.settings = Settings{DisciplineOrder: order}
		}
	}

	snapCopy := s.snaps.CopyAll()
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
	s.mu.Unlock()

	// Disk I/O outside the lock
	var diskWarns []string
	if err := s.snaps.DeleteStore(); err != nil {
		diskWarns = append(diskWarns, fmt.Sprintf("snapshot cleanup failed: %v", err))
	}
	if err := s.snaps.PersistCopy(snapCopy); err != nil {
		diskWarns = append(diskWarns, fmt.Sprintf("snapshot persist error: %v", err))
	}
	resp.PersistenceWarning = mergeWarnings("", diskWarns, fileWarns, parseWarns)
	return resp, nil
}
```

Note: `confirmMappingZip` still uses `CopyAll`/`PersistCopy` here. Task 5 will replace these when fixing #108.

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./internal/api/ -run "TestConfirmMapping_(RejectsStaleEpoch|AcceptsCurrentEpoch)" -v`

Expected: Both PASS.

- [ ] **Step 7: Run full test suite**

Run: `go test ./internal/api/ -v -count=1`

Expected: All tests PASS. No regressions.

- [ ] **Step 8: Commit**

```bash
jj describe -m "fix: add epoch counter to prevent Upload/ConfirmMapping race (#107)"
jj new
```

---

### Task 4: Write failing test for #108 (snapshot persistence race)

**Files:**
- Modify: `internal/api/concurrent_test.go`

- [ ] **Step 1: Write the failing test**

Add this test to `internal/api/concurrent_test.go`:

```go
// Scenarios: CONC-005
func TestConcurrentSnapshotSaves_BothPersist(t *testing.T) {
	store := newSafeMemorySnapshotStore()
	svc := NewOrgService(store)
	csv := []byte("Name,Role,Manager,Team,Status\nAlice,VP,,Eng,Active\n")
	if _, err := svc.Upload(context.Background(), "test.csv", csv); err != nil {
		t.Fatalf("upload: %v", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_ = svc.SaveSnapshot(context.Background(), "snap-a")
	}()
	go func() {
		defer wg.Done()
		_ = svc.SaveSnapshot(context.Background(), "snap-b")
	}()
	wg.Wait()

	// Both snapshots must be in memory
	snaps := svc.ListSnapshots(context.Background())
	names := make(map[string]bool, len(snaps))
	for _, s := range snaps {
		names[s.Name] = true
	}
	if !names["snap-a"] || !names["snap-b"] {
		t.Errorf("expected both snap-a and snap-b in list, got %v", snaps)
	}

	// Both snapshots must be persisted to the store
	persisted, err := store.inner.Read()
	if err != nil {
		t.Fatalf("reading store: %v", err)
	}
	if _, ok := persisted["snap-a"]; !ok {
		t.Error("snap-a not persisted to store")
	}
	if _, ok := persisted["snap-b"]; !ok {
		t.Error("snap-b not persisted to store")
	}
}
```

Note: This test still uses `safeMemorySnapshotStore` and `store.inner` for now. Task 6 will simplify this.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run "TestConcurrentSnapshotSaves_BothPersist" -v -race`

Expected: May pass intermittently (race is timing-dependent), but with `-race` flag may detect the data race. The test verifies correctness — if both writes happen to serialize correctly by luck, it passes. The real fix ensures it always passes.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add concurrent snapshot persistence test (#108)"
jj new
```

---

### Task 5: Implement persist-under-lock for #108

**Files:**
- Modify: `internal/api/snapshot_manager.go` — add `PersistAll`, remove `CopyAll` and `PersistCopy`, remove `maps` import
- Modify: `internal/api/snapshots.go` — use `defer s.mu.Unlock()` and `s.snaps.PersistAll()`
- Modify: `internal/api/service_import.go:117-161` — replace CopyAll/PersistCopy in confirmMappingZip

- [ ] **Step 1: Add PersistAll, remove CopyAll and PersistCopy**

In `internal/api/snapshot_manager.go`, remove the `"maps"` import, replace the `CopyAll` and `PersistCopy` methods with `PersistAll`:

Remove these two methods (lines 110-124):
```go
// CopyAll returns a shallow copy of the snapshot map, safe for use outside the lock.
func (sm *SnapshotManager) CopyAll() map[string]snapshotData {
	if sm.snapshots == nil {
		return nil
	}
	cp := make(map[string]snapshotData, len(sm.snapshots))
	maps.Copy(cp, sm.snapshots)
	return cp
}

// PersistCopy writes a pre-copied snapshot map to the store. Use this to persist
// outside the lock: copy under lock with CopyAll, then call PersistCopy without lock.
func (sm *SnapshotManager) PersistCopy(snapshots map[string]snapshotData) error {
	return sm.store.Write(snapshots)
}
```

Replace with:
```go
// PersistAll writes the current snapshot map to the store.
// Must be called with the external lock held.
func (sm *SnapshotManager) PersistAll() error {
	return sm.store.Write(sm.snapshots)
}
```

And update the imports to remove `"maps"`:
```go
import (
	"sort"
	"time"
)
```

- [ ] **Step 2: Update SaveSnapshot to persist under lock**

Replace `SaveSnapshot` in `internal/api/snapshots.go`:

```go
func (s *OrgService) SaveSnapshot(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.snaps.Save(name, s.working, s.podMgr.GetPods(), s.settings); err != nil {
		return err
	}
	if err := s.snaps.PersistAll(); err != nil {
		return fmt.Errorf("persisting snapshot: %w", err)
	}
	return nil
}
```

- [ ] **Step 3: Update DeleteSnapshot to persist under lock**

Replace `DeleteSnapshot` in `internal/api/snapshots.go`:

```go
func (s *OrgService) DeleteSnapshot(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snaps.Delete(name)
	if err := s.snaps.PersistAll(); err != nil {
		return fmt.Errorf("persisting snapshot deletion: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Update confirmMappingZip to persist under lock**

In `internal/api/service_import.go`, update `confirmMappingZip` to call `PersistAll` inside the lock and move disk I/O (DeleteStore) inside too. Replace the entire function:

```go
func (s *OrgService) confirmMappingZip(pending *PendingUpload, mapping map[string]string, epoch uint64) (*OrgData, error) {
	entries, podsSidecar, settingsSidecar, fileWarns, err := parseZipFileList(pending.File)
	if err != nil {
		return nil, errValidation("parsing pending zip: %v", err)
	}
	orig, work, snaps, parseWarns, err := parseZipEntries(entries, mapping)
	if err != nil {
		return nil, errValidation("parsing pending zip: %v", err)
	}

	// Commit state and persist under lock
	s.mu.Lock()
	if s.pendingEpoch != epoch {
		s.mu.Unlock()
		return nil, errConflict("upload superseded by a newer upload")
	}
	s.resetState(orig, work, snaps)

	if podsSidecar != nil {
		sidecarEntries := parsePodsSidecar(podsSidecar)
		if len(sidecarEntries) > 0 {
			idToName := buildIDToName(s.working)
			s.podMgr.ApplyNotes(sidecarEntries, idToName)
		}
	}

	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	if settingsSidecar != nil {
		if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
			s.settings = Settings{DisciplineOrder: order}
		}
	}

	var diskWarns []string
	if err := s.snaps.DeleteStore(); err != nil {
		diskWarns = append(diskWarns, fmt.Sprintf("snapshot cleanup failed: %v", err))
	}
	if err := s.snaps.PersistAll(); err != nil {
		diskWarns = append(diskWarns, fmt.Sprintf("snapshot persist error: %v", err))
	}

	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
	s.mu.Unlock()

	resp.PersistenceWarning = mergeWarnings("", diskWarns, fileWarns, parseWarns)
	return resp, nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/api/ -run "TestConcurrentSnapshotSaves_BothPersist" -v -race`

Expected: PASS.

- [ ] **Step 6: Run full test suite with race detector**

Run: `go test ./internal/api/ -v -count=1 -race`

Expected: All tests PASS. No data races detected.

- [ ] **Step 7: Commit**

```bash
jj describe -m "fix: persist snapshots under lock to prevent concurrent save race (#108)"
jj new
```

---

### Task 6: Remove safeMemorySnapshotStore

**Files:**
- Modify: `internal/api/concurrent_test.go` — remove wrapper, use `NewMemorySnapshotStore()` directly

- [ ] **Step 1: Remove safeMemorySnapshotStore and update tests**

In `internal/api/concurrent_test.go`, remove the `safeMemorySnapshotStore` type and its methods (lines 11-40). Update `setupConcurrentService` to use `NewMemorySnapshotStore()` directly. Update `TestConcurrentSnapshotSaves_BothPersist` to use `NewMemorySnapshotStore()` and read from the store directly.

Remove lines 11-40 (the `safeMemorySnapshotStore` type, constructor, and three methods).

Update `setupConcurrentService`:
```go
func setupConcurrentService(t *testing.T) (svc *OrgService, aliceID, bobID, carolID string) {
	t.Helper()
	svc = NewOrgService(NewMemorySnapshotStore())
```

Update `TestConcurrentSnapshotSaves_BothPersist`:
```go
// Scenarios: CONC-005
func TestConcurrentSnapshotSaves_BothPersist(t *testing.T) {
	store := NewMemorySnapshotStore()
	svc := NewOrgService(store)
	csv := []byte("Name,Role,Manager,Team,Status\nAlice,VP,,Eng,Active\n")
	if _, err := svc.Upload(context.Background(), "test.csv", csv); err != nil {
		t.Fatalf("upload: %v", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_ = svc.SaveSnapshot(context.Background(), "snap-a")
	}()
	go func() {
		defer wg.Done()
		_ = svc.SaveSnapshot(context.Background(), "snap-b")
	}()
	wg.Wait()

	// Both snapshots must be in memory
	snaps := svc.ListSnapshots(context.Background())
	names := make(map[string]bool, len(snaps))
	for _, s := range snaps {
		names[s.Name] = true
	}
	if !names["snap-a"] || !names["snap-b"] {
		t.Errorf("expected both snap-a and snap-b in list, got %v", snaps)
	}

	// Both snapshots must be persisted to the store
	persisted, err := store.Read()
	if err != nil {
		t.Fatalf("reading store: %v", err)
	}
	if _, ok := persisted["snap-a"]; !ok {
		t.Error("snap-a not persisted to store")
	}
	if _, ok := persisted["snap-b"]; !ok {
		t.Error("snap-b not persisted to store")
	}
}
```

- [ ] **Step 2: Remove unused import if needed**

Check if `fmt` and `strings` are still needed in `concurrent_test.go`. They are — used by `TestConcurrentUpdates` and `TestConcurrentMixedOperations`.

- [ ] **Step 3: Run full test suite with race detector**

Run: `go test ./internal/api/ -v -count=1 -race`

Expected: All tests PASS. No data races.

- [ ] **Step 4: Run scenario check**

Run: `make check-scenarios`

Expected: PASS. CONC-004 and CONC-005 both have matching test references.

- [ ] **Step 5: Commit**

```bash
jj describe -m "refactor: remove safeMemorySnapshotStore wrapper, all store access under lock"
jj new
```
