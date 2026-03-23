package api

import (
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
