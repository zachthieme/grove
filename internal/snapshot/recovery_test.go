package snapshot

import (
	"os"
	"path/filepath"
	"testing"
)

// Scenarios: CONTRACT-008

func TestSnapshotRecovery_MalformedJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte("{not valid json!!!"), 0644); err != nil {
		t.Fatal(err)
	}
	old := storageDir
	storageDir = dir
	defer func() { storageDir = old }()

	result, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_TruncatedJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte(`{"snap1":{"people":[{"id":"a","name":"Al`), 0644); err != nil {
		t.Fatal(err)
	}
	old := storageDir
	storageDir = dir
	defer func() { storageDir = old }()

	result, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error for truncated JSON, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte(""), 0644); err != nil {
		t.Fatal(err)
	}
	old := storageDir
	storageDir = dir
	defer func() { storageDir = old }()

	result, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error for empty file, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_FileNotExist(t *testing.T) {
	dir := t.TempDir()
	old := storageDir
	storageDir = dir
	defer func() { storageDir = old }()

	result, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("expected nil error for missing file, got %v", err)
	}
	if result != nil {
		t.Errorf("expected nil result, got %v", result)
	}
}

func TestSnapshotRecovery_ValidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	data := `{"snap1":{"people":[{"id":"a","name":"Alice"}],"timestamp":"2026-01-01T00:00:00Z"}}`
	if err := os.WriteFile(path, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}
	old := storageDir
	storageDir = dir
	defer func() { storageDir = old }()

	result, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(result))
	}
	snap := result["snap1"]
	if len(snap.People) != 1 || snap.People[0].Name != "Alice" {
		t.Errorf("unexpected snapshot content: %+v", snap)
	}
}

func TestSnapshotRecovery_ServiceStartsClean(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte("corrupted!"), 0644); err != nil {
		t.Fatal(err)
	}
	old := storageDir
	storageDir = dir
	defer func() { storageDir = old }()

	store := FileStore{}
	ss := New(store, newStubOrgProvider())
	list := ss.List()
	if len(list) != 0 {
		t.Errorf("expected empty snapshot list after corrupt store, got %d", len(list))
	}
}
