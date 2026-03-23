package api

import (
	"testing"
	"time"
)

func TestSnapshot_SaveAndList(t *testing.T) {
	svc := newTestService(t)

	svc.SaveSnapshot("v1")
	time.Sleep(time.Millisecond)
	svc.SaveSnapshot("v2")

	list := svc.ListSnapshots()
	if len(list) != 2 {
		t.Fatalf("expected 2 snapshots, got %d", len(list))
	}
	// Sorted by timestamp descending — v2 should be first.
	if list[0].Name != "v2" {
		t.Errorf("expected first snapshot to be 'v2', got '%s'", list[0].Name)
	}
	if list[1].Name != "v1" {
		t.Errorf("expected second snapshot to be 'v1', got '%s'", list[1].Name)
	}
	if list[0].Timestamp == "" {
		t.Error("expected timestamp to be set")
	}
}

func TestSnapshot_Load(t *testing.T) {
	svc := newTestService(t)

	// Save snapshot, then mutate working data.
	svc.SaveSnapshot("before")
	bob := findByName(svc.GetWorking(), "Bob")
	if _, err := svc.Update(bob.Id, map[string]string{"role": "Senior Engineer"}); err != nil {
		t.Fatalf("update: %v", err)
	}

	// Load the snapshot — should restore original working data.
	orgData, err := svc.LoadSnapshot("before")
	if err != nil {
		t.Fatalf("load snapshot failed: %v", err)
	}

	restoredBob := findByName(orgData.Working, "Bob")
	if restoredBob == nil {
		t.Fatal("expected Bob in restored data")
	}
	if restoredBob.Role != "Engineer" {
		t.Errorf("expected Bob's role to be 'Engineer' after restore, got '%s'", restoredBob.Role)
	}

	// Verify working state on service matches.
	workingBob := findByName(svc.GetWorking(), "Bob")
	if workingBob.Role != "Engineer" {
		t.Errorf("expected working Bob's role to be 'Engineer', got '%s'", workingBob.Role)
	}
}

func TestSnapshot_Overwrite(t *testing.T) {
	svc := newTestService(t)

	svc.SaveSnapshot("v1")
	svc.SaveSnapshot("v1") // Overwrite silently.

	list := svc.ListSnapshots()
	if len(list) != 1 {
		t.Errorf("expected 1 snapshot after overwrite, got %d", len(list))
	}
}

func TestSnapshot_Delete(t *testing.T) {
	svc := newTestService(t)

	svc.SaveSnapshot("v1")
	svc.DeleteSnapshot("v1")

	list := svc.ListSnapshots()
	if len(list) != 0 {
		t.Errorf("expected 0 snapshots after delete, got %d", len(list))
	}
}

func TestSnapshot_LoadNotFound(t *testing.T) {
	svc := newTestService(t)

	_, err := svc.LoadSnapshot("nonexistent")
	if err == nil {
		t.Fatal("expected error loading nonexistent snapshot")
	}
}

func TestSnapshot_LoadClearsRecycled(t *testing.T) {
	svc := newTestService(t)

	svc.SaveSnapshot("clean")

	// Delete someone to populate recycled.
	bob := findByName(svc.GetWorking(), "Bob")
	if err := svc.Delete(bob.Id); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if len(svc.GetRecycled()) == 0 {
		t.Fatal("expected recycled to be non-empty")
	}

	// Load snapshot should clear recycled.
	_, err := svc.LoadSnapshot("clean")
	if err != nil {
		t.Fatalf("load snapshot failed: %v", err)
	}
	if len(svc.GetRecycled()) != 0 {
		t.Errorf("expected recycled to be cleared after load, got %d", len(svc.GetRecycled()))
	}
}
