package snapshot

import (
	"context"
	"testing"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// stateWith returns a non-empty OrgState for tests that just need real data.
func stateWith(name string) OrgState {
	return OrgState{
		People: []apitypes.OrgNode{{
			OrgNodeFields: model.OrgNodeFields{Name: name, Status: "Active"},
			Id:            name,
		}},
		Pods:     []apitypes.Pod{},
		Settings: apitypes.Settings{DisciplineOrder: []string{"Eng"}},
	}
}

// Scenarios: SNAP-003
func TestNewSnapshotService_StartsEmpty(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list, got %d entries", len(got))
	}
}

// Scenarios: SNAP-003
func TestNewSnapshotService_LoadsFromStore(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	preload := map[string]Data{
		"v1": {People: []apitypes.OrgNode{}, Pods: []apitypes.Pod{}, Settings: apitypes.Settings{}},
	}
	if err := store.Write(preload); err != nil {
		t.Fatalf("preload write: %v", err)
	}

	ss := New(store)
	list := ss.List()
	if len(list) != 1 || list[0].Name != "v1" {
		t.Errorf("expected [v1] from preloaded store, got %v", list)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_StoresSnapshot(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	list := ss.List()
	if len(list) != 1 || list[0].Name != "v1" {
		t.Errorf("expected [v1], got %v", list)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_RejectsReservedName(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	err := ss.Save(context.Background(), Working, stateWith("x"), ss.Epoch())
	if err == nil || !isConflict(err) {
		t.Errorf("expected ConflictError, got %v", err)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_RejectsInvalidName(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	err := ss.Save(context.Background(), "../evil", stateWith("x"), ss.Epoch())
	if err == nil || !isValidation(err) {
		t.Errorf("expected ValidationError, got %v", err)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_PersistsToStore(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "saved", stateWith("x"), ss.Epoch()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	persisted, err := store.Read()
	if err != nil {
		t.Fatalf("store.Read: %v", err)
	}
	if _, ok := persisted["saved"]; !ok {
		t.Errorf("expected snapshot persisted to store")
	}
}

// Scenarios: SNAP-008
//
// Verifies the race-guard: caller reads epoch, then a Clear runs, then the
// caller's Save attempts to commit with the stale epoch and aborts. This is
// the exact pattern OrgService.SaveSnapshot follows.
func TestSnapshotService_Save_AbortsWhenEpochAdvances(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())

	// Caller reads epoch BEFORE capturing state.
	expectedEpoch := ss.Epoch()
	// A Clear runs in between (simulating Reset/Create/Upload).
	if err := ss.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	// Caller's Save attempts to commit with the stale epoch — must abort.
	err := ss.Save(context.Background(), "racing", stateWith("x"), expectedEpoch)
	if err == nil || !isConflict(err) {
		t.Errorf("expected ConflictError from epoch advance, got %v", err)
	}
	if list := ss.List(); len(list) != 0 {
		t.Errorf("expected no snapshots after aborted Save, got %v", list)
	}
}

// Scenarios: SNAP-005
func TestSnapshotService_Load_ReturnsState(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	original := stateWith("Alice")
	if err := ss.Save(context.Background(), "v1", original, ss.Epoch()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := ss.Load(context.Background(), "v1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(loaded.People) != 1 || loaded.People[0].Name != "Alice" {
		t.Errorf("expected Load to return [Alice], got %v", loaded.People)
	}
}

// Scenarios: SNAP-005
func TestSnapshotService_Load_NotFound(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	_, err := ss.Load(context.Background(), "missing")
	if err == nil || !isNotFound(err) {
		t.Errorf("expected NotFoundError, got %v", err)
	}
}

// Scenarios: SNAP-005
func TestSnapshotService_Delete_RemovesEntry(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if err := ss.Save(context.Background(), "v1", stateWith("x"), ss.Epoch()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := ss.Delete(context.Background(), "v1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list after delete, got %v", got)
	}
}

// Scenarios: SNAP-006
//
// Reserved-name routing (Working/Original) lives in the org layer, not in
// snapshot.Service. Service.Export treats reserved names as not-found.
func TestSnapshotService_Export_NamedSnapshot(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if err := ss.Save(context.Background(), "snap1", stateWith("Frozen"), ss.Epoch()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	people, err := ss.Export(context.Background(), "snap1")
	if err != nil {
		t.Fatalf("Export named: %v", err)
	}
	if len(people) != 1 || people[0].Name != "Frozen" {
		t.Errorf("expected [Frozen], got %v", people)
	}
}

// Scenarios: SNAP-006
func TestSnapshotService_Export_NotFound(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	_, err := ss.Export(context.Background(), "missing")
	if err == nil || !isNotFound(err) {
		t.Errorf("expected NotFoundError, got %v", err)
	}
}

// Scenarios: SNAP-006
func TestSnapshotService_Export_ReservedNameNotFound(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if _, err := ss.Export(context.Background(), Working); err == nil || !isNotFound(err) {
		t.Errorf("expected NotFound for reserved Working (routed at org layer), got %v", err)
	}
	if _, err := ss.Export(context.Background(), Original); err == nil || !isNotFound(err) {
		t.Errorf("expected NotFound for reserved Original (routed at org layer), got %v", err)
	}
}

// Scenarios: SNAP-007
func TestSnapshotService_Clear_RemovesAllAndBumpsEpoch(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "v1", stateWith("x"), ss.Epoch()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	priorEpoch := ss.Epoch()
	if err := ss.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list after Clear, got %v", got)
	}
	if ss.Epoch() == priorEpoch {
		t.Errorf("expected Epoch to advance after Clear, still %d", priorEpoch)
	}
	persisted, err := store.Read()
	if err != nil {
		t.Fatalf("store.Read: %v", err)
	}
	if len(persisted) != 0 {
		t.Errorf("expected store cleared, got %v", persisted)
	}
}

// Scenarios: SNAP-008
//
// Smoke test that Save succeeds normally after a Clear (the epoch advance
// only invalidates IN-FLIGHT Saves whose expectedEpoch was captured before
// the bump).
func TestSnapshotService_Save_SucceedsAfterClear(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if err := ss.Save(context.Background(), "v1", stateWith("a"), ss.Epoch()); err != nil {
		t.Fatalf("Save before Clear: %v", err)
	}
	if err := ss.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if err := ss.Save(context.Background(), "v2", stateWith("b"), ss.Epoch()); err != nil {
		t.Fatalf("Save after Clear should succeed: %v", err)
	}
	if got := ss.List(); len(got) != 1 || got[0].Name != "v2" {
		t.Errorf("expected [v2] after clear+save, got %v", got)
	}
}

// Scenarios: SNAP-007
func TestSnapshotService_ReplaceAll_PersistsNewMap(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)

	newMap := map[string]Data{
		"imported": {People: []apitypes.OrgNode{{Id: "x"}}, Timestamp: time.Now()},
	}
	if err := ss.ReplaceAll(newMap); err != nil {
		t.Fatalf("ReplaceAll: %v", err)
	}
	list := ss.List()
	if len(list) != 1 || list[0].Name != "imported" {
		t.Errorf("expected [imported], got %v", list)
	}
	persisted, err := store.Read()
	if err != nil {
		t.Fatalf("store.Read: %v", err)
	}
	if _, ok := persisted["imported"]; !ok {
		t.Errorf("expected ReplaceAll to persist new map")
	}
}
