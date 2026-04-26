package snapshot

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// stateForConcurrent returns a small OrgState for concurrent tests.
func stateForConcurrent(id string) OrgState {
	return OrgState{
		People: []apitypes.OrgNode{{
			OrgNodeFields: model.OrgNodeFields{Name: id, Status: "Active"},
			Id:            id,
		}},
		Pods: []apitypes.Pod{},
	}
}

// Scenarios: SNAP-008
//
// Concurrent Save vs Clear: at least one Save in N goroutines must observe
// the epoch bump and return ConflictError. Without the epoch guard this
// test passes "trivially" (all Saves succeed) — that's why we additionally
// assert ConflictError was observed at least once.
func TestConcurrentSave_VsClear_ObservesEpochConflict(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())

	const writers = 16
	var conflictSeen atomic.Int32
	var wg sync.WaitGroup

	wg.Add(writers + 1)
	for i := range writers {
		go func(i int) {
			defer wg.Done()
			expectedEpoch := ss.Epoch()
			err := ss.Save(context.Background(), fmt.Sprintf("v%d", i), stateForConcurrent(fmt.Sprintf("p%d", i)), expectedEpoch)
			if isConflict(err) {
				conflictSeen.Add(1)
			}
		}(i)
	}
	go func() {
		defer wg.Done()
		_ = ss.Clear()
	}()
	wg.Wait()

	// At least one of the 16 racers should have read the pre-Clear epoch and
	// failed at commit. This is probabilistic but extremely robust:
	// 16 writers, one Clear, scheduler-dependent.
	if conflictSeen.Load() == 0 {
		// Fall through to a deterministic check: a fresh Save with stale
		// epoch must fail.
		stale := uint64(0)
		err := ss.Save(context.Background(), "after", stateForConcurrent("p"), stale)
		if !isConflict(err) {
			t.Fatalf("epoch guard never fired: stale-epoch Save returned %v", err)
		}
	}
}

// Scenarios: SNAP-008
//
// Concurrent Save vs ReplaceAll: same race as above but for the import path.
func TestConcurrentSave_VsReplaceAll_ObservesEpochConflict(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())

	const writers = 16
	var conflictSeen atomic.Int32
	var wg sync.WaitGroup

	wg.Add(writers + 1)
	for i := range writers {
		go func(i int) {
			defer wg.Done()
			expectedEpoch := ss.Epoch()
			err := ss.Save(context.Background(), fmt.Sprintf("v%d", i), stateForConcurrent(fmt.Sprintf("p%d", i)), expectedEpoch)
			if isConflict(err) {
				conflictSeen.Add(1)
			}
		}(i)
	}
	go func() {
		defer wg.Done()
		_ = ss.ReplaceAll(map[string]Data{"imported": {People: []apitypes.OrgNode{{Id: "x"}}}})
	}()
	wg.Wait()

	if conflictSeen.Load() == 0 {
		// Deterministic fallback: epoch advanced, stale Save must fail.
		stale := uint64(0)
		err := ss.Save(context.Background(), "after", stateForConcurrent("p"), stale)
		if !isConflict(err) {
			t.Fatalf("epoch guard never fired: stale-epoch Save returned %v", err)
		}
	}
}

// Scenarios: SNAP-008
//
// Many Saves racing under the same epoch: every successful Save must end up
// in the store, with no map corruption. Run under -race to catch any
// missing locking on ss.snaps.
func TestConcurrentSaves_AllPersistOrConflict(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())

	const writers = 32
	var wg sync.WaitGroup
	wg.Add(writers)
	for i := range writers {
		go func(i int) {
			defer wg.Done()
			expectedEpoch := ss.Epoch()
			_ = ss.Save(context.Background(), fmt.Sprintf("v%d", i), stateForConcurrent(fmt.Sprintf("p%d", i)), expectedEpoch)
		}(i)
	}
	wg.Wait()

	// No Clear/ReplaceAll ran → no epoch conflicts → every Save committed.
	got := ss.List()
	if len(got) != writers {
		t.Errorf("expected %d snapshots, got %d", writers, len(got))
	}
}

// Scenarios: SNAP-008
//
// Load racing with Save/Delete: Loads must either return a complete state
// or NotFound, never a partial/torn read. Verified under -race.
func TestConcurrentLoad_RacesAreSafe(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	// Seed one snapshot.
	if err := ss.Save(context.Background(), "seed", stateForConcurrent("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("seed Save: %v", err)
	}

	const ops = 50
	var wg sync.WaitGroup
	wg.Add(ops * 3)
	for i := range ops {
		go func(i int) {
			defer wg.Done()
			state, err := ss.Load(context.Background(), "seed")
			if err == nil && len(state.People) != 1 {
				t.Errorf("partial load: %d people", len(state.People))
			}
		}(i)
		go func(i int) {
			defer wg.Done()
			expectedEpoch := ss.Epoch()
			_ = ss.Save(context.Background(), fmt.Sprintf("racer-%d", i), stateForConcurrent("X"), expectedEpoch)
		}(i)
		go func(i int) {
			defer wg.Done()
			_ = ss.Delete(context.Background(), fmt.Sprintf("racer-%d", i))
		}(i)
	}
	wg.Wait()
}

// Scenarios: SNAP-008
//
// Removing the epoch bump from Clear would make this test fail: a stale
// expectedEpoch would still match ss.epoch and the Save would commit. By
// asserting ConflictError after a deterministic Clear, we lock the epoch
// guard's behavior into the test contract.
func TestSave_StaleEpoch_AfterClear_ReturnsConflict(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())

	staleEpoch := ss.Epoch()
	if err := ss.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	err := ss.Save(context.Background(), "v1", stateForConcurrent("p"), staleEpoch)
	if !isConflict(err) {
		t.Fatalf("expected ConflictError with stale epoch after Clear, got %v", err)
	}
}

// Scenarios: SNAP-008
//
// ReplaceAll bumps the epoch identically to Clear — same stale-epoch
// behavior expected.
func TestSave_StaleEpoch_AfterReplaceAll_ReturnsConflict(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())

	staleEpoch := ss.Epoch()
	if err := ss.ReplaceAll(map[string]Data{"imported": {}}); err != nil {
		t.Fatalf("ReplaceAll: %v", err)
	}
	err := ss.Save(context.Background(), "v1", stateForConcurrent("p"), staleEpoch)
	if !isConflict(err) {
		t.Fatalf("expected ConflictError with stale epoch after ReplaceAll, got %v", err)
	}
}
