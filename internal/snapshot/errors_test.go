package snapshot

import (
	"context"
	"net/http"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
)

// Scenarios: SNAP-004
//
// Save rolls back the in-memory map when the store write fails on a fresh
// insert: nothing should appear in List afterwards.
func TestSave_RollsBackOnStoreWriteError_FreshInsert(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	store.SetWriteErr("disk full")
	ss := New(store)
	err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch())
	if err == nil {
		t.Fatal("expected error from store.Write")
	}
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected rollback to leave empty list, got %v", got)
	}
}

// Scenarios: SNAP-004
//
// Save rolls back to the prior entry when the store write fails on an
// overwrite — neither lost data nor partial state.
func TestSave_RollsBackOnStoreWriteError_Overwrite(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("seed Save: %v", err)
	}
	store.SetWriteErr("disk full")
	err := ss.Save(context.Background(), "v1", stateWith("Bob"), ss.Epoch())
	if err == nil {
		t.Fatal("expected error from store.Write")
	}
	loaded, err := ss.Load(context.Background(), "v1")
	if err != nil {
		t.Fatalf("Load after rollback: %v", err)
	}
	if loaded.People[0].Name != "Alice" {
		t.Errorf("expected Alice (rollback), got %q", loaded.People[0].Name)
	}
}

// Scenarios: SNAP-004
func TestSave_RejectsTooLongName(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	long := make([]byte, 101)
	for i := range long {
		long[i] = 'a'
	}
	err := ss.Save(context.Background(), string(long), stateWith("x"), ss.Epoch())
	if err == nil || !isValidation(err) {
		t.Errorf("expected ValidationError for >100 char name, got %v", err)
	}
}

// Scenarios: SNAP-004
func TestSave_RejectsEmptyName(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	err := ss.Save(context.Background(), "", stateWith("x"), ss.Epoch())
	if err == nil || !isValidation(err) {
		t.Errorf("expected ValidationError for empty name, got %v", err)
	}
}

// Scenarios: SNAP-005
//
// Delete rolls back when store write fails — the entry must still be
// reachable via List/Load.
func TestDelete_RollsBackOnStoreWriteError(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("seed Save: %v", err)
	}
	store.SetWriteErr("disk full")
	err := ss.Delete(context.Background(), "v1")
	if err == nil {
		t.Fatal("expected error from store.Write")
	}
	if got := ss.List(); len(got) != 1 {
		t.Errorf("expected rollback to keep entry, got %v", got)
	}
}

// Scenarios: SNAP-005
//
// Delete is idempotent: removing a nonexistent snapshot is a no-op and
// touches neither the in-memory map nor the store.
func TestDelete_NonexistentIsNoop(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	store.SetWriteErr("would fail if Delete tried to write")
	ss := New(store)
	if err := ss.Delete(context.Background(), "missing"); err != nil {
		t.Errorf("expected nil for nonexistent delete, got %v", err)
	}
}

// Scenarios: SNAP-007
//
// Clear rolls back state on store error: epoch and snaps map remain valid.
// (Current Clear does NOT roll back the in-memory clear if store.Delete
// fails — it logs and returns the error. Document that behavior here.)
func TestClear_StoreErrorBubblesUp(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("seed Save: %v", err)
	}
	store.SetDeleteErr("disk error")
	if err := ss.Clear(); err == nil {
		t.Fatal("expected error from store.Delete")
	}
}

// Scenarios: SNAP-007
//
// ReplaceAll(nil) deletes the persisted store. Rollback on Delete error
// restores both the prior map and the prior epoch.
func TestReplaceAll_Nil_RollsBackOnStoreDeleteError(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("seed Save: %v", err)
	}
	priorEpoch := ss.Epoch()
	store.SetDeleteErr("disk error")
	err := ss.ReplaceAll(nil)
	if err == nil {
		t.Fatal("expected error from store.Delete")
	}
	if ss.Epoch() != priorEpoch {
		t.Errorf("expected epoch rolled back to %d, got %d", priorEpoch, ss.Epoch())
	}
	if got := ss.List(); len(got) != 1 {
		t.Errorf("expected prior map restored, got %d entries", len(got))
	}
}

// Scenarios: SNAP-007
//
// ReplaceAll(non-nil) writes to store. Rollback on Write error restores
// both the prior map and prior epoch.
func TestReplaceAll_RollsBackOnStoreWriteError(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	ss := New(store)
	if err := ss.Save(context.Background(), "v1", stateWith("Alice"), ss.Epoch()); err != nil {
		t.Fatalf("seed Save: %v", err)
	}
	priorEpoch := ss.Epoch()
	store.SetWriteErr("disk full")

	newMap := map[string]Data{"imported": {People: []apitypes.OrgNode{{Id: "x"}}}}
	err := ss.ReplaceAll(newMap)
	if err == nil {
		t.Fatal("expected error from store.Write")
	}
	if ss.Epoch() != priorEpoch {
		t.Errorf("expected epoch rolled back to %d, got %d", priorEpoch, ss.Epoch())
	}
	got := ss.List()
	if len(got) != 1 || got[0].Name != "v1" {
		t.Errorf("expected prior [v1] map restored, got %v", got)
	}
}

// Scenarios: SNAP-007
//
// ReplaceAll(nil) on an already-empty store deletes successfully — no entries.
func TestReplaceAll_NilOnEmpty_Succeeds(t *testing.T) {
	t.Parallel()
	ss := New(NewMemoryStore())
	if err := ss.ReplaceAll(nil); err != nil {
		t.Fatalf("ReplaceAll(nil) on empty: %v", err)
	}
	if got := ss.List(); len(got) != 0 {
		t.Errorf("expected empty list, got %v", got)
	}
}

// Scenarios: API-CONTRACT
//
// HTTPStatus mappings for typed errors. Locks the contract so the httpapi
// layer's status mapping continues to work.
func TestErrorTypes_HTTPStatusMapping(t *testing.T) {
	t.Parallel()
	cases := []struct {
		err  interface{ HTTPStatus() int }
		want int
		name string
	}{
		{&ValidationError{msg: "x"}, http.StatusUnprocessableEntity, "Validation→422"},
		{&NotFoundError{msg: "x"}, http.StatusNotFound, "NotFound→404"},
		{&ConflictError{msg: "x"}, http.StatusConflict, "Conflict→409"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.err.HTTPStatus(); got != tc.want {
				t.Errorf("HTTPStatus = %d, want %d", got, tc.want)
			}
			if msg := tc.err.(error).Error(); msg != "x" {
				t.Errorf("Error() = %q, want %q", msg, "x")
			}
		})
	}
}
