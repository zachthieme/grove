package api

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
)

// safeMemorySnapshotStore wraps MemorySnapshotStore with a mutex so that
// concurrent calls to Write/Read/Delete (which happen outside OrgService.mu)
// do not race. The real FileSnapshotStore serialises via the filesystem; the
// in-memory version needs an explicit lock for the same guarantee.
type safeMemorySnapshotStore struct {
	mu    sync.Mutex
	inner *MemorySnapshotStore
}

func newSafeMemorySnapshotStore() *safeMemorySnapshotStore {
	return &safeMemorySnapshotStore{inner: NewMemorySnapshotStore()}
}

func (s *safeMemorySnapshotStore) Read() (map[string]snapshotData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inner.Read()
}

func (s *safeMemorySnapshotStore) Write(snaps map[string]snapshotData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inner.Write(snaps)
}

func (s *safeMemorySnapshotStore) Delete() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inner.Delete()
}

// setupConcurrentService creates a fresh OrgService with 3 people:
// Alice (VP, root), Bob (Engineer, reports to Alice), Carol (Engineer, reports to Bob).
// Returns the service along with Alice, Bob, and Carol's IDs.
func setupConcurrentService(t *testing.T) (svc *OrgService, aliceID, bobID, carolID string) {
	t.Helper()
	svc = NewOrgService(newSafeMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
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
				_, _ = svc.Move(context.Background(), carolID, aliceID, "Eng")
				// Move Carol back to Bob
				_, _ = svc.Move(context.Background(), carolID, bobID, "Platform")
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
				_, _ = svc.Update(context.Background(), bobID, PersonUpdate{Role: ptr(role)})
			}
		}()
	}
	wg.Wait()

	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected non-nil org data after concurrent updates")
	}

	var bob *Person
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
					_, _ = svc.Move(context.Background(), carolID, aliceID, "Eng")
				} else {
					_, _ = svc.Move(context.Background(), carolID, bobID, "Platform")
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
					_, _ = svc.Move(context.Background(), carolID, aliceID, "Eng")
				case 1:
					// Move Carol back to Bob
					_, _ = svc.Move(context.Background(), carolID, bobID, "Platform")
				case 2:
					// Update Bob's role
					_, _ = svc.Update(context.Background(), bobID, PersonUpdate{Role: ptr(fmt.Sprintf("Role-%d-%d", g, i))})
				case 3:
					// Add a new person
					_, _, _, _ = svc.Add(context.Background(), Person{
						Name:      fmt.Sprintf("NewPerson-%d-%d", g, i),
						Role:      "IC",
						ManagerId: aliceID,
						Team:      "Eng",
						Status:    "Active",
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
