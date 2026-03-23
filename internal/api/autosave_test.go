package api

import "testing"

func TestAutosave_WriteAndRead(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	data := AutosaveData{
		Original:     []Person{{Id: "1", Name: "Alice", Status: "Active", Team: "Eng"}},
		Working:      []Person{{Id: "1", Name: "Alice", Status: "Active", Team: "Eng"}},
		SnapshotName: "v1",
		Timestamp:    "2026-03-21T12:00:00Z",
	}

	if err := WriteAutosave(data); err != nil {
		t.Fatalf("write: %v", err)
	}

	read, err := ReadAutosave()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if read == nil {
		t.Fatal("expected autosave data")
	}
	if len(read.Original) != 1 {
		t.Errorf("expected 1 original, got %d", len(read.Original))
	}
	if read.SnapshotName != "v1" {
		t.Errorf("expected snapshot name 'v1', got '%s'", read.SnapshotName)
	}
}

func TestAutosave_ReadMissing(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	data, err := ReadAutosave()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if data != nil {
		t.Error("expected nil for missing autosave")
	}
}

func TestAutosave_Delete(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	if err := WriteAutosave(AutosaveData{Timestamp: "now"}); err != nil {
		t.Fatalf("write autosave: %v", err)
	}
	if err := DeleteAutosave(); err != nil {
		t.Fatalf("delete: %v", err)
	}

	data, _ := ReadAutosave()
	if data != nil {
		t.Error("expected nil after delete")
	}
}

func TestAutosave_DeleteMissing(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	if err := DeleteAutosave(); err != nil {
		t.Fatalf("expected no error deleting missing file, got: %v", err)
	}
}
