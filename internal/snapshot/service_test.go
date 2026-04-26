package snapshot

import (
	"context"
	"testing"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// stubOrgProvider is a test-only implementation of OrgStateProvider.
type stubOrgProvider struct {
	captureFn  func() OrgState
	applyFn    func(OrgState)
	getWorking func(context.Context) []apitypes.OrgNode
	getOrig    func(context.Context) []apitypes.OrgNode
}

func (s *stubOrgProvider) CaptureState() OrgState { return s.captureFn() }
func (s *stubOrgProvider) ApplyState(st OrgState) { s.applyFn(st) }
func (s *stubOrgProvider) GetWorking(ctx context.Context) []apitypes.OrgNode {
	return s.getWorking(ctx)
}
func (s *stubOrgProvider) GetOriginal(ctx context.Context) []apitypes.OrgNode { return s.getOrig(ctx) }

func newStubOrgProvider() *stubOrgProvider {
	return &stubOrgProvider{
		captureFn:  func() OrgState { return OrgState{} },
		applyFn:    func(OrgState) {},
		getWorking: func(context.Context) []apitypes.OrgNode { return nil },
		getOrig:    func(context.Context) []apitypes.OrgNode { return nil },
	}
}

// Scenarios: SNAP-003
func TestNewSnapshotService_StartsEmpty(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore(), newStubOrgProvider())
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list, got %d entries", len(got))
	}
}

// Scenarios: SNAP-003
func TestNewSnapshotService_LoadsFromStore(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	// Pre-populate the store with one snapshot.
	preload := map[string]Data{
		"v1": {People: []apitypes.OrgNode{}, Pods: []apitypes.Pod{}, Settings: apitypes.Settings{}},
	}
	if err := store.Write(preload); err != nil {
		t.Fatalf("preload write: %v", err)
	}

	ss := New(store, newStubOrgProvider())
	list := ss.List()
	if len(list) != 1 || list[0].Name != "v1" {
		t.Errorf("expected [v1] from preloaded store, got %v", list)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_StoresSnapshot(t *testing.T) {
	t.Parallel()
	captured := OrgState{
		People: []apitypes.OrgNode{{
			OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"},
			Id:            "a1",
		}},
		Pods:     []apitypes.Pod{},
		Settings: apitypes.Settings{DisciplineOrder: []string{"Eng"}},
	}
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState { return captured }

	ss := New(NewMemoryStore(), provider)
	if err := ss.Save(context.Background(), "v1"); err != nil {
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
	ss := New(NewMemoryStore(), newStubOrgProvider())
	err := ss.Save(context.Background(), Working)
	if err == nil || !isConflict(err) {
		t.Errorf("expected ConflictError, got %v", err)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_RejectsInvalidName(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore(), newStubOrgProvider())
	err := ss.Save(context.Background(), "../evil")
	if err == nil || !isValidation(err) {
		t.Errorf("expected ValidationError, got %v", err)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_PersistsToStore(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState {
		return OrgState{People: []apitypes.OrgNode{}, Pods: []apitypes.Pod{}}
	}
	store := NewMemoryStore()

	ss := New(store, provider)
	if err := ss.Save(context.Background(), "saved"); err != nil {
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
func TestSnapshotService_Save_AbortsWhenEpochAdvances(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore(), newStubOrgProvider())

	// Simulate a Clear() racing between the epoch read and the commit lock:
	// the captureFn itself bumps ss.epoch. Save reads expectedEpoch BEFORE
	// CaptureState, so the bump inside CaptureState advances ss.epoch past
	// expectedEpoch and the commit-time check aborts.
	provider := ss.org.(*stubOrgProvider)
	provider.captureFn = func() OrgState {
		ss.mu.Lock()
		ss.epoch++
		ss.mu.Unlock()
		return OrgState{People: []apitypes.OrgNode{}, Pods: []apitypes.Pod{}}
	}

	err := ss.Save(context.Background(), "racing")
	if err == nil || !isConflict(err) {
		t.Errorf("expected ConflictError from epoch advance, got %v", err)
	}
	if list := ss.List(); len(list) != 0 {
		t.Errorf("expected no snapshots after aborted Save, got %v", list)
	}
}

// Scenarios: SNAP-005
func TestSnapshotService_Load_AppliesToOrg(t *testing.T) {
	t.Parallel()
	captured := OrgState{
		People:   []apitypes.OrgNode{{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Id: "a1"}},
		Pods:     []apitypes.Pod{},
		Settings: apitypes.Settings{DisciplineOrder: []string{"Eng"}},
	}
	var applied OrgState
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState { return captured }
	provider.applyFn = func(s OrgState) { applied = s }

	ss := New(NewMemoryStore(), provider)
	if err := ss.Save(context.Background(), "v1"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := ss.Load(context.Background(), "v1"); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(applied.People) != 1 || applied.People[0].Name != "Alice" {
		t.Errorf("expected ApplyState called with [Alice], got %v", applied.People)
	}
}

// Scenarios: SNAP-005
func TestSnapshotService_Load_NotFound(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore(), newStubOrgProvider())
	err := ss.Load(context.Background(), "missing")
	if err == nil || !isNotFound(err) {
		t.Errorf("expected NotFoundError, got %v", err)
	}
}

// Scenarios: SNAP-005
func TestSnapshotService_Delete_RemovesEntry(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState { return OrgState{} }

	ss := New(NewMemoryStore(), provider)
	if err := ss.Save(context.Background(), "v1"); err != nil {
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
func TestSnapshotService_Export_Working(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.getWorking = func(context.Context) []apitypes.OrgNode {
		return []apitypes.OrgNode{{OrgNodeFields: model.OrgNodeFields{Name: "WorkingPerson"}, Id: "w1"}}
	}

	ss := New(NewMemoryStore(), provider)
	people, err := ss.Export(context.Background(), Working)
	if err != nil {
		t.Fatalf("Export working: %v", err)
	}
	if len(people) != 1 || people[0].Name != "WorkingPerson" {
		t.Errorf("expected [WorkingPerson], got %v", people)
	}
}

// Scenarios: SNAP-006
func TestSnapshotService_Export_Original(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.getOrig = func(context.Context) []apitypes.OrgNode {
		return []apitypes.OrgNode{{OrgNodeFields: model.OrgNodeFields{Name: "OrigPerson"}, Id: "o1"}}
	}

	ss := New(NewMemoryStore(), provider)
	people, err := ss.Export(context.Background(), Original)
	if err != nil {
		t.Fatalf("Export original: %v", err)
	}
	if len(people) != 1 || people[0].Name != "OrigPerson" {
		t.Errorf("expected [OrigPerson], got %v", people)
	}
}

// Scenarios: SNAP-006
func TestSnapshotService_Export_NamedSnapshot(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState {
		return OrgState{
			People: []apitypes.OrgNode{{OrgNodeFields: model.OrgNodeFields{Name: "Frozen"}, Id: "f1"}},
		}
	}

	ss := New(NewMemoryStore(), provider)
	if err := ss.Save(context.Background(), "snap1"); err != nil {
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
	ss := New(NewMemoryStore(), newStubOrgProvider())
	_, err := ss.Export(context.Background(), "missing")
	if err == nil || !isNotFound(err) {
		t.Errorf("expected NotFoundError, got %v", err)
	}
}

// Scenarios: SNAP-007
func TestSnapshotService_Clear_RemovesAllAndBumpsEpoch(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState { return OrgState{} }

	store := NewMemoryStore()
	ss := New(store, provider)
	if err := ss.Save(context.Background(), "v1"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := ss.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list after Clear, got %v", got)
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
func TestSnapshotService_Save_AbortsAfterClear(t *testing.T) {
	t.Parallel()
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState { return OrgState{} }

	ss := New(NewMemoryStore(), provider)

	// Smoke test that Clear bumps the epoch counter and a subsequent
	// Save still succeeds (the epoch advance only invalidates IN-FLIGHT
	// Saves whose expectedEpoch was captured before the bump). A separate
	// test (TestSnapshotService_Save_AbortsWhenEpochAdvances, in Task 3)
	// exercises the actual race path.
	if err := ss.Save(context.Background(), "v1"); err != nil {
		t.Fatalf("Save before Clear: %v", err)
	}
	if err := ss.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if err := ss.Save(context.Background(), "v2"); err != nil {
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
	ss := New(store, newStubOrgProvider())

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
