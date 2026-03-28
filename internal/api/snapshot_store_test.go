package api

// Scenarios: CONTRACT-008, SNAP-006 — all tests in this file

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSnapshotStore_WriteAndRead(t *testing.T) {
	snapshotStoreDir = t.TempDir()
	defer func() { snapshotStoreDir = "" }()

	snaps := map[string]snapshotData{
		"v1": {
			People:    []Person{{Id: "1", Name: "Alice", Status: "Active"}},
			Timestamp: time.Now(),
		},
	}
	if err := WriteSnapshots(snaps); err != nil {
		t.Fatalf("write: %v", err)
	}

	loaded, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(loaded) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(loaded))
	}
	if loaded["v1"].People[0].Name != "Alice" {
		t.Errorf("expected Alice, got %s", loaded["v1"].People[0].Name)
	}
}

func TestSnapshotStore_ReadMissing(t *testing.T) {
	snapshotStoreDir = t.TempDir()
	defer func() { snapshotStoreDir = "" }()

	snaps, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if snaps != nil {
		t.Errorf("expected nil for missing file, got %v", snaps)
	}
}

func TestSnapshotStore_Delete(t *testing.T) {
	snapshotStoreDir = t.TempDir()
	defer func() { snapshotStoreDir = "" }()

	snaps := map[string]snapshotData{
		"v1": {People: []Person{{Id: "1", Name: "Alice", Status: "Active"}}, Timestamp: time.Now()},
	}
	_ = WriteSnapshots(snaps)

	if err := DeleteSnapshotStore(); err != nil {
		t.Fatalf("delete: %v", err)
	}

	loaded, _ := ReadSnapshots()
	if loaded != nil {
		t.Error("expected nil after delete")
	}
}

func TestSnapshotStore_DeleteMissing(t *testing.T) {
	snapshotStoreDir = t.TempDir()
	defer func() { snapshotStoreDir = "" }()

	// Delete when no file exists should not error
	if err := DeleteSnapshotStore(); err != nil {
		t.Errorf("expected no error deleting non-existent file, got: %v", err)
	}
}

func TestSnapshotStore_CorruptJSON(t *testing.T) {
	dir := t.TempDir()
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = "" }()

	// Write corrupt JSON directly to the file
	path := filepath.Join(dir, "snapshots.json")
	if err := os.WriteFile(path, []byte("{not valid json!!!"), 0644); err != nil {
		t.Fatalf("writing corrupt file: %v", err)
	}

	snaps, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error reading corrupt JSON")
	}
	if !strings.Contains(err.Error(), "parsing snapshots") {
		t.Errorf("expected 'parsing snapshots' in error, got: %v", err)
	}
	if snaps != nil {
		t.Error("expected nil snapshots on corrupt JSON")
	}
}

func TestSnapshotStore_WriteToReadOnlyDir(t *testing.T) {
	dir := t.TempDir()
	readOnlyDir := filepath.Join(dir, "readonly")
	if err := os.MkdirAll(readOnlyDir, 0755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}
	// Make directory read-only to prevent temp file creation
	if err := os.Chmod(readOnlyDir, 0555); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(readOnlyDir, 0755) })

	snapshotStoreDir = readOnlyDir
	defer func() { snapshotStoreDir = "" }()

	snaps := map[string]snapshotData{
		"v1": {People: []Person{{Id: "1", Name: "Alice", Status: "Active"}}, Timestamp: time.Now()},
	}
	err := WriteSnapshots(snaps)
	if err == nil {
		t.Fatal("expected error writing to read-only directory")
	}
}

func TestSnapshotStore_ReadPermissionDenied(t *testing.T) {
	dir := t.TempDir()
	snapshotStoreDir = dir
	defer func() { snapshotStoreDir = "" }()

	// Write valid data, then make file unreadable
	snaps := map[string]snapshotData{
		"v1": {People: []Person{{Id: "1", Name: "Alice", Status: "Active"}}, Timestamp: time.Now()},
	}
	if err := WriteSnapshots(snaps); err != nil {
		t.Fatalf("write: %v", err)
	}

	path := filepath.Join(dir, "snapshots.json")
	if err := os.Chmod(path, 0000); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, 0644) })

	loaded, err := ReadSnapshots()
	if err == nil {
		t.Fatal("expected error reading unreadable file")
	}
	if !strings.Contains(err.Error(), "reading snapshots") {
		t.Errorf("expected 'reading snapshots' in error, got: %v", err)
	}
	if loaded != nil {
		t.Error("expected nil on read error")
	}
}

func TestSnapshotStore_RoundTripPreservesAllFields(t *testing.T) {
	snapshotStoreDir = t.TempDir()
	defer func() { snapshotStoreDir = "" }()

	ts := time.Date(2026, 3, 28, 12, 0, 0, 0, time.UTC)
	snaps := map[string]snapshotData{
		"v1": {
			People:   []Person{{Id: "1", Name: "Alice", Role: "VP", Status: "Active", Pod: "Alpha"}},
			Pods:     []Pod{{Id: "p1", Name: "Alpha", Team: "Eng", ManagerId: "1"}},
			Settings: Settings{DisciplineOrder: []string{"Eng", "Design"}},
			Timestamp: ts,
		},
	}
	if err := WriteSnapshots(snaps); err != nil {
		t.Fatalf("write: %v", err)
	}

	loaded, err := ReadSnapshots()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	snap := loaded["v1"]
	if snap.People[0].Pod != "Alpha" {
		t.Errorf("expected Pod 'Alpha', got '%s'", snap.People[0].Pod)
	}
	if len(snap.Pods) != 1 || snap.Pods[0].Name != "Alpha" {
		t.Error("expected pods to round-trip")
	}
	if len(snap.Settings.DisciplineOrder) != 2 {
		t.Error("expected settings to round-trip")
	}
	if !snap.Timestamp.Equal(ts) {
		t.Errorf("expected timestamp %v, got %v", ts, snap.Timestamp)
	}
}
