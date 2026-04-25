package api

import (
	"context"
	"testing"

	"github.com/zachthieme/grove/internal/model"
)

// stubOrgProvider is a test-only implementation of orgStateProvider.
type stubOrgProvider struct {
	captureFn  func() OrgState
	applyFn    func(OrgState)
	getWorking func(context.Context) []OrgNode
	getOrig    func(context.Context) []OrgNode
}

func (s *stubOrgProvider) CaptureState() OrgState                    { return s.captureFn() }
func (s *stubOrgProvider) ApplyState(st OrgState)                    { s.applyFn(st) }
func (s *stubOrgProvider) GetWorking(ctx context.Context) []OrgNode  { return s.getWorking(ctx) }
func (s *stubOrgProvider) GetOriginal(ctx context.Context) []OrgNode { return s.getOrig(ctx) }

func newStubOrgProvider() *stubOrgProvider {
	return &stubOrgProvider{
		captureFn:  func() OrgState { return OrgState{} },
		applyFn:    func(OrgState) {},
		getWorking: func(context.Context) []OrgNode { return nil },
		getOrig:    func(context.Context) []OrgNode { return nil },
	}
}

// Scenarios: SNAP-003
func TestNewSnapshotService_StartsEmpty(t *testing.T) {
	t.Parallel()
	ss := NewSnapshotService(NewMemorySnapshotStore(), newStubOrgProvider())
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list, got %d entries", len(got))
	}
}

// Scenarios: SNAP-003
func TestNewSnapshotService_LoadsFromStore(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	// Pre-populate the store with one snapshot.
	preload := map[string]snapshotData{
		"v1": {People: []OrgNode{}, Pods: []Pod{}, Settings: Settings{}},
	}
	if err := store.Write(preload); err != nil {
		t.Fatalf("preload write: %v", err)
	}

	ss := NewSnapshotService(store, newStubOrgProvider())
	list := ss.List()
	if len(list) != 1 || list[0].Name != "v1" {
		t.Errorf("expected [v1] from preloaded store, got %v", list)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_StoresSnapshot(t *testing.T) {
	t.Parallel()
	captured := OrgState{
		People: []OrgNode{{
			OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"},
			Id:            "a1",
		}},
		Pods:     []Pod{},
		Settings: Settings{DisciplineOrder: []string{"Eng"}},
	}
	provider := newStubOrgProvider()
	provider.captureFn = func() OrgState { return captured }

	ss := NewSnapshotService(NewMemorySnapshotStore(), provider)
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
	ss := NewSnapshotService(NewMemorySnapshotStore(), newStubOrgProvider())
	err := ss.Save(context.Background(), SnapshotWorking)
	if err == nil || !isConflict(err) {
		t.Errorf("expected ConflictError, got %v", err)
	}
}

// Scenarios: SNAP-004
func TestSnapshotService_Save_RejectsInvalidName(t *testing.T) {
	t.Parallel()
	ss := NewSnapshotService(NewMemorySnapshotStore(), newStubOrgProvider())
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
		return OrgState{People: []OrgNode{}, Pods: []Pod{}}
	}
	store := NewMemorySnapshotStore()

	ss := NewSnapshotService(store, provider)
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
	ss := NewSnapshotService(NewMemorySnapshotStore(), newStubOrgProvider())

	// Simulate a Clear() racing between the epoch read and the commit lock:
	// the captureFn itself bumps ss.epoch. Save reads expectedEpoch BEFORE
	// CaptureState, so the bump inside CaptureState advances ss.epoch past
	// expectedEpoch and the commit-time check aborts.
	provider := ss.org.(*stubOrgProvider)
	provider.captureFn = func() OrgState {
		ss.mu.Lock()
		ss.epoch++
		ss.mu.Unlock()
		return OrgState{People: []OrgNode{}, Pods: []Pod{}}
	}

	err := ss.Save(context.Background(), "racing")
	if err == nil || !isConflict(err) {
		t.Errorf("expected ConflictError from epoch advance, got %v", err)
	}
	if list := ss.List(); len(list) != 0 {
		t.Errorf("expected no snapshots after aborted Save, got %v", list)
	}
}
