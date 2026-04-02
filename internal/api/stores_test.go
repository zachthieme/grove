package api

import (
	"context"
	"encoding/json"
	"github.com/zachthieme/grove/internal/model"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- Snapshot store error path tests ---

// Scenarios: SNAP-006
func TestSaveSnapshot_PersistenceError(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	svc := NewOrgService(store)
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	if _, err := svc.Upload(context.Background(), "test.csv", csv); err != nil {
		t.Fatalf("upload: %v", err)
	}

	store.SetWriteErr("disk full")
	err := svc.SaveSnapshot(context.Background(), "v1")
	if err == nil {
		t.Fatal("expected error when snapshot store write fails")
	}
	if !strings.Contains(err.Error(), "disk full") {
		t.Errorf("expected error to contain 'disk full', got: %v", err)
	}
}

// Scenarios: SNAP-006
func TestDeleteSnapshot_PersistenceError(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	svc := NewOrgService(store)
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	if _, err := svc.Upload(context.Background(), "test.csv", csv); err != nil {
		t.Fatalf("upload: %v", err)
	}

	if err := svc.SaveSnapshot(context.Background(), "v1"); err != nil {
		t.Fatalf("save: %v", err)
	}

	store.SetWriteErr("permission denied")
	err := svc.DeleteSnapshot(context.Background(), "v1")
	if err == nil {
		t.Fatal("expected error when snapshot store write fails on delete")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected error to contain 'permission denied', got: %v", err)
	}
}

// Scenarios: SNAP-006
func TestUpload_SnapshotDeleteError_ReturnsPersistenceWarning(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	svc := NewOrgService(store)
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")

	// First upload to establish state
	if _, err := svc.Upload(context.Background(), "test.csv", csv); err != nil {
		t.Fatalf("upload: %v", err)
	}

	// Now make delete fail for the next upload
	store.SetDeleteErr("snapshot cleanup failed")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload should not hard-fail on persistence error: %v", err)
	}
	if resp.PersistenceWarning == "" {
		t.Error("expected persistence warning when snapshot delete fails")
	}
	if !strings.Contains(resp.PersistenceWarning, "snapshot cleanup failed") {
		t.Errorf("expected warning to mention failure, got: %s", resp.PersistenceWarning)
	}
}

// Scenarios: CONTRACT-008
func TestNewOrgService_SnapshotReadError_StartsEmpty(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	store.SetReadErr("corrupted file")
	svc := NewOrgService(store)

	// Service should start without snapshots, not crash
	list := svc.ListSnapshots(context.Background())
	if len(list) != 0 {
		t.Errorf("expected 0 snapshots when store read fails, got %d", len(list))
	}
}

// Scenarios: CONTRACT-008
func TestNewOrgService_LoadsPreviousSnapshots(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	// Pre-populate the store
	_ = store.Write(map[string]snapshotData{
		"saved": {People: []Person{{PersonFields: model.PersonFields{Name: "Alice", Status: "Active"}, Id: "1"}}},
	})

	svc := NewOrgService(store)
	list := svc.ListSnapshots(context.Background())
	if len(list) != 1 {
		t.Fatalf("expected 1 snapshot from store, got %d", len(list))
	}
	if list[0].Name != "saved" {
		t.Errorf("expected snapshot 'saved', got '%s'", list[0].Name)
	}
}

// --- Autosave store error path tests ---

// Scenarios: AUTO-006
func TestAutosaveHandler_WriteError(t *testing.T) {
	t.Parallel()
	store := NewMemoryAutosaveStore()
	store.SetWriteErr("disk full")
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, store)

	body := `{"original":[],"working":[],"recycled":[],"snapshotName":"","timestamp":"now"}`
	req := httptest.NewRequest("POST", "/api/autosave", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on write error, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !strings.Contains(resp["error"], "disk full") {
		t.Errorf("expected error message to contain 'disk full', got: %s", resp["error"])
	}
}

// Scenarios: AUTO-006
func TestAutosaveHandler_ReadError(t *testing.T) {
	t.Parallel()
	store := NewMemoryAutosaveStore()
	store.SetReadErr("corrupted file")
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, store)

	req := httptest.NewRequest("GET", "/api/autosave", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on read error, got %d", rec.Code)
	}
}

// Scenarios: AUTO-006
func TestAutosaveHandler_DeleteError(t *testing.T) {
	t.Parallel()
	store := NewMemoryAutosaveStore()
	store.SetDeleteErr("permission denied")
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, store)

	req := httptest.NewRequest("DELETE", "/api/autosave", nil)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on delete error, got %d", rec.Code)
	}
}

// Scenarios: AUTO-006
func TestAutosaveHandler_RoundTrip(t *testing.T) {
	t.Parallel()
	store := NewMemoryAutosaveStore()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, store)

	// Write
	body := `{"original":[{"id":"1","name":"Alice"}],"working":[],"recycled":[],"snapshotName":"v1","timestamp":"2026-01-01T00:00:00Z"}`
	req := httptest.NewRequest("POST", "/api/autosave", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("write: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Read
	req = httptest.NewRequest("GET", "/api/autosave", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("read: expected 200, got %d", rec.Code)
	}
	var data AutosaveData
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if data.SnapshotName != "v1" {
		t.Errorf("expected snapshot name 'v1', got '%s'", data.SnapshotName)
	}

	// Delete
	req = httptest.NewRequest("DELETE", "/api/autosave", nil)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rec.Code)
	}

	// Confirm deleted
	req = httptest.NewRequest("GET", "/api/autosave", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 after delete, got %d", rec.Code)
	}
}

// --- Snapshot handler error path tests ---

// Scenarios: SNAP-006
func TestSaveSnapshotHandler_PersistenceError(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	svc := NewOrgService(store)
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	// Upload data first
	uploadCSV(t, handler)

	// Now make writes fail
	store.SetWriteErr("io error")

	body := `{"name":"v1"}`
	req := httptest.NewRequest("POST", "/api/snapshots/save", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when snapshot persist fails, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Scenarios: SNAP-006
func TestDeleteSnapshotHandler_PersistenceError(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()
	svc := NewOrgService(store)
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	uploadCSV(t, handler)

	// Save a snapshot first (with writes working)
	body := `{"name":"v1"}`
	req := httptest.NewRequest("POST", "/api/snapshots/save", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("save: expected 200, got %d", rec.Code)
	}

	// Now make writes fail
	store.SetWriteErr("io error")

	body = `{"name":"v1"}`
	req = httptest.NewRequest("POST", "/api/snapshots/delete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when snapshot delete persist fails, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- Memory store interface compliance ---

// Scenarios: CONTRACT-008
func TestMemorySnapshotStore_Implements_Interface(t *testing.T) {
	t.Parallel()
	var _ SnapshotStore = NewMemorySnapshotStore()
	var _ SnapshotStore = FileSnapshotStore{}
}

// Scenarios: CONTRACT-008
func TestMemoryAutosaveStore_Implements_Interface(t *testing.T) {
	t.Parallel()
	var _ AutosaveStore = NewMemoryAutosaveStore()
	var _ AutosaveStore = FileAutosaveStore{}
}

// Scenarios: CONTRACT-008
func TestMemorySnapshotStore_BasicOperations(t *testing.T) {
	t.Parallel()
	store := NewMemorySnapshotStore()

	// Read empty
	data, err := store.Read()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if data != nil {
		t.Error("expected nil for empty store")
	}

	// Write
	snaps := map[string]snapshotData{
		"v1": {People: []Person{{PersonFields: model.PersonFields{Name: "Alice"}, Id: "1"}}},
	}
	if err := store.Write(snaps); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Read back
	data, err = store.Read()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(data) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(data))
	}
	if data["v1"].People[0].Name != "Alice" {
		t.Error("expected Alice")
	}

	// Delete
	if err := store.Delete(); err != nil {
		t.Fatalf("delete: %v", err)
	}
	data, err = store.Read()
	if err != nil {
		t.Fatalf("read after delete: %v", err)
	}
	if data != nil {
		t.Error("expected nil after delete")
	}
}

// Scenarios: CONTRACT-008
func TestMemoryAutosaveStore_BasicOperations(t *testing.T) {
	t.Parallel()
	store := NewMemoryAutosaveStore()

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
