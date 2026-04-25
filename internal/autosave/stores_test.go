package autosave

import "testing"

// Scenarios: CONTRACT-008
func TestMemoryAutosaveStore_Implements_Interface(t *testing.T) {
	t.Parallel()
	var _ AutosaveStore = NewMemoryStore()
	var _ AutosaveStore = FileAutosaveStore{}
}

// Scenarios: CONTRACT-008
func TestMemoryAutosaveStore_BasicOperations(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()

	// Read empty
	data, err := store.Read()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if data != nil {
		t.Error("expected nil for empty store")
	}

	// Write
	if err := store.Write(AutosaveData{SnapshotName: "test"}); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Read back
	data, err = store.Read()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if data == nil || data.SnapshotName != "test" {
		t.Error("expected snapshot name 'test'")
	}

	// Delete
	if err := store.Delete(); err != nil {
		t.Fatalf("delete: %v", err)
	}
	data, _ = store.Read()
	if data != nil {
		t.Error("expected nil after delete")
	}
}

// Scenarios: CONTRACT-008 — Memory store error injection helpers behave as expected.
func TestMemoryAutosaveStore_ErrorInjection(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()

	store.SetWriteErr("disk full")
	if err := store.Write(AutosaveData{}); err == nil || err.Error() != "disk full" {
		t.Errorf("expected 'disk full', got %v", err)
	}
	store.SetWriteErr("")

	store.SetReadErr("corrupted")
	if _, err := store.Read(); err == nil || err.Error() != "corrupted" {
		t.Errorf("expected 'corrupted', got %v", err)
	}
	store.SetReadErr("")

	store.SetDeleteErr("permission denied")
	if err := store.Delete(); err == nil || err.Error() != "permission denied" {
		t.Errorf("expected 'permission denied', got %v", err)
	}
	store.SetDeleteErr("")
}
