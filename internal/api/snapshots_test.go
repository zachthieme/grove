package api

import (
	"context"
	"strings"
	"testing"
	"time"
)

// Scenarios: SNAP-001
func TestSnapshot_SaveAndList(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	if err := svc.SaveSnapshot(context.Background(), "v1"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	time.Sleep(time.Millisecond)
	if err := svc.SaveSnapshot(context.Background(), "v2"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}

	list := svc.ListSnapshots(context.Background())
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

// Scenarios: SNAP-002
func TestSnapshot_Load(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	// Save snapshot, then mutate working data.
	if err := svc.SaveSnapshot(context.Background(), "before"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	bob := findByName(svc.GetWorking(context.Background()), "Bob")
	if _, err := svc.Update(context.Background(), bob.Id, PersonUpdate{Role: ptr("Senior Engineer")}); err != nil {
		t.Fatalf("update: %v", err)
	}

	// Load the snapshot — should restore original working data.
	orgData, err := svc.LoadSnapshot(context.Background(), "before")
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
	workingBob := findByName(svc.GetWorking(context.Background()), "Bob")
	if workingBob.Role != "Engineer" {
		t.Errorf("expected working Bob's role to be 'Engineer', got '%s'", workingBob.Role)
	}
}

// Scenarios: SNAP-003
func TestSnapshot_Overwrite(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	if err := svc.SaveSnapshot(context.Background(), "v1"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	if err := svc.SaveSnapshot(context.Background(), "v1"); err != nil { // Overwrite silently.
		t.Fatalf("save snapshot: %v", err)
	}

	list := svc.ListSnapshots(context.Background())
	if len(list) != 1 {
		t.Errorf("expected 1 snapshot after overwrite, got %d", len(list))
	}
}

// Scenarios: SNAP-007
func TestSnapshot_Delete(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	if err := svc.SaveSnapshot(context.Background(), "v1"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	_ = svc.DeleteSnapshot(context.Background(), "v1")

	list := svc.ListSnapshots(context.Background())
	if len(list) != 0 {
		t.Errorf("expected 0 snapshots after delete, got %d", len(list))
	}
}

// Scenarios: SNAP-004
func TestSnapshot_LoadNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	_, err := svc.LoadSnapshot(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error loading nonexistent snapshot")
	}
}

// Scenarios: SNAP-002
func TestSnapshot_LoadClearsRecycled(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	if err := svc.SaveSnapshot(context.Background(), "clean"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}

	// Delete someone to populate recycled.
	bob := findByName(svc.GetWorking(context.Background()), "Bob")
	if _, err := svc.Delete(context.Background(), bob.Id); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if len(svc.GetRecycled(context.Background())) == 0 {
		t.Fatal("expected recycled to be non-empty")
	}

	// Load snapshot should clear recycled.
	_, err := svc.LoadSnapshot(context.Background(), "clean")
	if err != nil {
		t.Fatalf("load snapshot failed: %v", err)
	}
	if len(svc.GetRecycled(context.Background())) != 0 {
		t.Errorf("expected recycled to be cleared after load, got %d", len(svc.GetRecycled(context.Background())))
	}
}

// Scenarios: SNAP-009
func TestSnapshot_Save_EmptyName(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	err := svc.SaveSnapshot(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty snapshot name")
	}
	if !isValidation(err) {
		t.Errorf("expected validation error, got: %v", err)
	}
}

// Scenarios: SNAP-009
func TestSnapshot_Save_PathTraversal(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	err := svc.SaveSnapshot(context.Background(), "../evil")
	if err == nil {
		t.Fatal("expected error for path-traversal snapshot name")
	}
	if !isValidation(err) {
		t.Errorf("expected validation error, got: %v", err)
	}
}

// Scenarios: SNAP-009
func TestSnapshot_Save_TooLong(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	longName := strings.Repeat("a", 101)
	err := svc.SaveSnapshot(context.Background(), longName)
	if err == nil {
		t.Fatal("expected error for snapshot name over 100 chars")
	}
	if !isValidation(err) {
		t.Errorf("expected validation error, got: %v", err)
	}
}

// Scenarios: SNAP-009
func TestSnapshot_Save_ValidSpecialChars(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	validNames := []string{
		"v1",
		"my snapshot",
		"release-2026",
		"snapshot_v1.0",
		"Q1 Planning",
		strings.Repeat("a", 100), // exactly 100 chars
	}
	for _, name := range validNames {
		if err := svc.SaveSnapshot(context.Background(), name); err != nil {
			t.Errorf("expected valid name %q to succeed, got: %v", name, err)
		}
	}
}

// Scenarios: SNAP-009
func TestSnapshot_Save_InvalidChars(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	invalidNames := []string{
		"../evil",
		"/etc/passwd",
		"name\x00null",
		"<script>",
		"name|pipe",
	}
	for _, name := range invalidNames {
		err := svc.SaveSnapshot(context.Background(), name)
		if err == nil {
			t.Errorf("expected invalid name %q to fail", name)
		}
	}
}
