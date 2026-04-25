package api

import (
	"context"
	"testing"
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
