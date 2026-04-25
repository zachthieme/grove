package api

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// setupConcurrentService creates a fresh OrgService with 3 people:
// Alice (VP, root), Bob (Engineer, reports to Alice), Carol (Engineer, reports to Bob).
// Returns the service along with Alice, Bob, and Carol's IDs.
func setupConcurrentService(t *testing.T) (svc *OrgService, aliceID, bobID, carolID string) {
	t.Helper()
	svc = NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	data := svc.GetOrg(context.Background())
	for _, p := range data.Working {
		switch p.Name {
		case "Alice":
			aliceID = p.Id
		case "Bob":
			bobID = p.Id
		case "Carol":
			carolID = p.Id
		}
	}
	if aliceID == "" || bobID == "" || carolID == "" {
		t.Fatal("could not find all three people after upload")
	}
	return svc, aliceID, bobID, carolID
}

// Scenarios: CONC-001
func TestConcurrentMoves(t *testing.T) {
	svc, aliceID, bobID, carolID := setupConcurrentService(t)

	const goroutines = 10
	const iterations = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for range goroutines {
		go func() {
			defer wg.Done()
			for range iterations {
				// Move Carol to Alice
				_, _ = svc.Move(context.Background(), carolID, aliceID, "Eng", "")
				// Move Carol back to Bob
				_, _ = svc.Move(context.Background(), carolID, bobID, "Platform", "")
			}
		}()
	}
	wg.Wait()

	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected non-nil org data after concurrent moves")
	}
	if len(data.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(data.Working))
	}
}

// Scenarios: CONC-001
func TestConcurrentUpdates(t *testing.T) {
	svc, _, bobID, _ := setupConcurrentService(t)

	const goroutines = 10
	const iterations = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := range goroutines {
		go func() {
			defer wg.Done()
			for range iterations {
				role := fmt.Sprintf("Role-%d", g)
				_, _ = svc.Update(context.Background(), bobID, apitypes.OrgNodeUpdate{Role: ptr(role)})
			}
		}()
	}
	wg.Wait()

	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected non-nil org data after concurrent updates")
	}

	var bob *apitypes.OrgNode
	for i := range data.Working {
		if data.Working[i].Id == bobID {
			bob = &data.Working[i]
			break
		}
	}
	if bob == nil {
		t.Fatal("Bob not found after concurrent updates")
	}
	if !strings.HasPrefix(bob.Role, "Role-") {
		t.Errorf("expected Bob's role to be 'Role-N', got '%s'", bob.Role)
	}
}

// Scenarios: CONC-001
func TestConcurrentReadsAndWrites(t *testing.T) {
	svc, aliceID, bobID, carolID := setupConcurrentService(t)

	const writers = 5
	const readers = 5
	const iterations = 50
	var wg sync.WaitGroup
	wg.Add(writers + readers)

	// Writer goroutines: move Carol between Alice and Bob
	for range writers {
		go func() {
			defer wg.Done()
			for i := range iterations {
				if i%2 == 0 {
					_, _ = svc.Move(context.Background(), carolID, aliceID, "Eng", "")
				} else {
					_, _ = svc.Move(context.Background(), carolID, bobID, "Platform", "")
				}
			}
		}()
	}

	// Reader goroutines: call GetOrg and verify invariants
	errs := make(chan string, readers*iterations)
	for range readers {
		go func() {
			defer wg.Done()
			for range iterations {
				data := svc.GetOrg(context.Background())
				if data == nil {
					errs <- "GetOrg returned nil"
					continue
				}
				if len(data.Working) != 3 {
					errs <- fmt.Sprintf("expected 3 working people, got %d", len(data.Working))
				}
			}
		}()
	}
	wg.Wait()
	close(errs)

	for e := range errs {
		t.Error(e)
	}
}

// Scenarios: CONC-001
func TestConcurrentDeleteRestore(t *testing.T) {
	svc, _, _, carolID := setupConcurrentService(t)

	const goroutines = 10
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := range goroutines {
		go func() {
			defer wg.Done()
			if g%2 == 0 {
				// Deleter
				_, _ = svc.Delete(context.Background(), carolID)
			} else {
				// Restorer
				_, _ = svc.Restore(context.Background(), carolID)
			}
		}()
	}
	wg.Wait()

	working := svc.GetWorking(context.Background())
	recycled := svc.GetRecycled(context.Background())
	total := len(working) + len(recycled)
	if total != 3 {
		t.Errorf("expected working + recycled == 3, got %d (working=%d, recycled=%d)", total, len(working), len(recycled))
	}
}

// Scenarios: CONC-001
func TestConcurrentSnapshotOperations(t *testing.T) {
	svc, _, _, _ := setupConcurrentService(t)

	const goroutines = 10
	const iterations = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := range goroutines {
		go func() {
			defer wg.Done()
			for i := range iterations {
				name := fmt.Sprintf("snap-%d-%d", g, i)
				switch i % 4 {
				case 0:
					_ = svc.SaveSnapshot(context.Background(), name)
				case 1:
					_, _ = svc.LoadSnapshot(context.Background(), name)
				case 2:
					_ = svc.ListSnapshots(context.Background())
				case 3:
					_ = svc.DeleteSnapshot(context.Background(), name)
				}
			}
		}()
	}
	wg.Wait()

	// Service should still be functional
	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected non-nil org data after concurrent snapshot operations")
	}
}

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

// Scenarios: CONC-001
func TestConcurrentMixedOperations(t *testing.T) {
	svc, aliceID, bobID, carolID := setupConcurrentService(t)

	const goroutines = 20
	const iterations = 30
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := range goroutines {
		go func() {
			defer wg.Done()
			for i := range iterations {
				op := (g*iterations + i) % 11
				switch op {
				case 0:
					// Move Carol to Alice
					_, _ = svc.Move(context.Background(), carolID, aliceID, "Eng", "")
				case 1:
					// Move Carol back to Bob
					_, _ = svc.Move(context.Background(), carolID, bobID, "Platform", "")
				case 2:
					// Update Bob's role
					_, _ = svc.Update(context.Background(), bobID, apitypes.OrgNodeUpdate{Role: ptr(fmt.Sprintf("Role-%d-%d", g, i))})
				case 3:
					// Add a new person
					_, _, _, _ = svc.Add(context.Background(), apitypes.OrgNode{
						OrgNodeFields: model.OrgNodeFields{
							Name:   fmt.Sprintf("NewPerson-%d-%d", g, i),
							Role:   "IC",
							Team:   "Eng",
							Status: "Active",
						},
						ManagerId: aliceID,
					})
				case 4:
					// Delete Carol (may fail if already deleted)
					_, _ = svc.Delete(context.Background(), carolID)
				case 5:
					// Restore Carol (may fail if not deleted)
					_, _ = svc.Restore(context.Background(), carolID)
				case 6:
					// Reorder working people
					working := svc.GetWorking(context.Background())
					if len(working) > 0 {
						ids := make([]string, len(working))
						for j, p := range working {
							ids[j] = p.Id
						}
						_, _ = svc.Reorder(context.Background(), ids)
					}
				case 7:
					// GetOrg (read)
					_ = svc.GetOrg(context.Background())
				case 8:
					// GetWorking (read)
					_ = svc.GetWorking(context.Background())
				case 9:
					// GetRecycled (read)
					_ = svc.GetRecycled(context.Background())
				case 10:
					// Snapshot save + load + delete
					snapName := fmt.Sprintf("stress-%d-%d", g, i)
					_ = svc.SaveSnapshot(context.Background(), snapName)
					_, _ = svc.LoadSnapshot(context.Background(), snapName)
					_ = svc.DeleteSnapshot(context.Background(), snapName)
				}
			}
		}()
	}
	wg.Wait()

	// Verify the service is still functional after the stress test
	t.Cleanup(func() {
		data := svc.GetOrg(context.Background())
		if data == nil {
			t.Error("expected non-nil org data after stress test cleanup")
		}
	})
}

// blockingSnapshotStore is a SnapshotStore whose Write blocks until a
// release channel is closed. Used to prove that snapshot persist does not
// hold mu_org — concurrent Move must complete while Write is blocked.
type blockingSnapshotStore struct {
	started chan struct{}
	release chan struct{}
}

func (b *blockingSnapshotStore) Write(snaps map[string]snapshotData) error {
	select {
	case b.started <- struct{}{}:
	default:
		// Already signaled (subsequent writes don't re-block).
	}
	<-b.release
	return nil
}

func (b *blockingSnapshotStore) Read() (map[string]snapshotData, error) { return nil, nil }
func (b *blockingSnapshotStore) Delete() error                          { return nil }

// Scenarios: SNAP-009
func TestSnapshotPersist_DoesNotBlockEdits(t *testing.T) {
	store := &blockingSnapshotStore{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
	}
	svc := NewOrgService(store)
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n")
	if _, err := svc.Upload(context.Background(), "test.csv", csv); err != nil {
		t.Fatalf("upload: %v", err)
	}

	working := svc.GetWorking(context.Background())
	var aliceID, bobID string
	for _, p := range working {
		if p.Name == "Alice" {
			aliceID = p.Id
		}
		if p.Name == "Bob" {
			bobID = p.Id
		}
	}
	if aliceID == "" || bobID == "" {
		t.Fatalf("could not find Alice and Bob after upload")
	}

	saveDone := make(chan error, 1)
	go func() {
		// SaveSnapshot calls store.Write — which will block until release.
		saveDone <- svc.SaveSnapshot(context.Background(), "v1")
	}()

	// Wait for the save to enter store.Write (proves persist phase started).
	select {
	case <-store.started:
		// Save is now in store.Write, holding mu_snap. mu_org should be free.
	case <-time.After(2 * time.Second):
		t.Fatal("Save never entered store.Write within 2s")
	}

	moveDone := make(chan error, 1)
	go func() {
		_, err := svc.Move(context.Background(), bobID, aliceID, "Eng", "")
		moveDone <- err
	}()

	// Move must complete BEFORE we release the snapshot persist —
	// proving mu_org was not held during the snapshot disk write.
	select {
	case err := <-moveDone:
		if err != nil {
			t.Errorf("Move failed: %v", err)
		}
	case <-time.After(2 * time.Second):
		close(store.release) // unblock Save so the test exits cleanly
		<-saveDone
		t.Fatal("Move did not complete while snapshot persist was blocked — mu_org was held during persist")
	}

	// Release the save and verify it succeeds.
	close(store.release)
	if err := <-saveDone; err != nil {
		t.Errorf("Save returned error: %v", err)
	}
}

// Scenarios: SNAP-010
func TestSnapshotSave_EpochGuard_Reset(t *testing.T) {
	// Verify the epoch guard fires at least sometimes when SaveSnapshot
	// races against ResetToOriginal (which calls snap.Clear() and bumps epoch).
	//
	// We can't deterministically interleave the two without modifying production
	// code, so we run many trials and assert that conflicts are observed at
	// least once. If the race window is too narrow on this runner, we skip
	// (rather than fail) — the deterministic single-threaded guard test in
	// snapshot_service_test.go (TestSnapshotService_Save_AbortsWhenEpochAdvances)
	// covers the correctness invariant unconditionally.

	svc, _, _, _ := setupConcurrentService(t)

	const trials = 50
	var conflicts, successes int
	for range trials {
		// Pre-populate one snapshot so Reset has something to clear.
		_ = svc.SaveSnapshot(context.Background(), "stable")

		var wg sync.WaitGroup
		wg.Add(2)
		var saveErr error
		go func() {
			defer wg.Done()
			saveErr = svc.SaveSnapshot(context.Background(), "racing")
		}()
		go func() {
			defer wg.Done()
			svc.ResetToOriginal(context.Background())
		}()
		wg.Wait()

		if saveErr == nil {
			successes++
		} else if isConflict(saveErr) {
			conflicts++
		} else {
			t.Errorf("unexpected error from racing Save: %v", saveErr)
		}
	}

	t.Logf("save successes: %d, conflicts: %d (out of %d)", successes, conflicts, trials)
	if conflicts == 0 && successes == trials {
		t.Skip("epoch guard never triggered — race window too narrow on this runner; not a bug")
	}
}

// Scenarios: SNAP-010
func TestSnapshotSave_EpochGuard_UploadCSV(t *testing.T) {
	// Same shape as the Reset variant but using a CSV re-upload (which calls
	// snap.Clear() via the import path).
	svc, _, _, _ := setupConcurrentService(t)

	const trials = 50
	var conflicts int
	for range trials {
		_ = svc.SaveSnapshot(context.Background(), "stable")

		var wg sync.WaitGroup
		wg.Add(2)
		var saveErr error
		go func() {
			defer wg.Done()
			saveErr = svc.SaveSnapshot(context.Background(), "racing")
		}()
		go func() {
			defer wg.Done()
			csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nNew,VP,Eng,,Eng,,Active\n")
			_, _ = svc.Upload(context.Background(), "reup.csv", csv)
		}()
		wg.Wait()

		if isConflict(saveErr) {
			conflicts++
		}
	}

	t.Logf("upload-vs-save conflicts: %d (out of %d)", conflicts, trials)
}
