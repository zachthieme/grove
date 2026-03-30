package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func uploadCSV(t *testing.T, handler http.Handler) *OrgData {
	t.Helper()
	csvData := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n"

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", "test.csv")
	if err != nil {
		t.Fatalf("creating form file: %v", err)
	}
	if _, err = part.Write([]byte(csvData)); err != nil {
		t.Fatalf("writing form data: %v", err)
	}
	if err = writer.Close(); err != nil {
		t.Fatalf("closing multipart writer: %v", err)
	}

	req := httptest.NewRequest("POST", "/api/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("upload expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp UploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding upload response: %v", err)
	}
	if resp.Status != UploadReady {
		t.Fatalf("expected upload status 'ready', got '%s'", resp.Status)
	}
	return resp.OrgData
}

// Scenarios: UPLOAD-001
func TestUploadHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)

	if data == nil {
		t.Fatal("expected OrgData from upload")
	}
	if len(data.Original) != 3 {
		t.Errorf("expected 3 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(data.Working))
	}
	if data.Original[0].Name != "Alice" {
		t.Errorf("expected first person to be Alice, got %s", data.Original[0].Name)
	}
}

// Scenarios: CONTRACT-006
func TestGetOrg_NoData(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/org", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-006
func TestGetOrg_WithData(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("GET", "/api/org", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var data OrgData
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(data.Original) != 3 {
		t.Errorf("expected 3 people, got %d", len(data.Original))
	}
}

// Scenarios: ORG-001
func TestMoveHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	body, _ := json.Marshal(map[string]string{
		"personId":     carol.Id,
		"newManagerId": alice.Id,
		"newTeam":      "Eng",
	})

	req := httptest.NewRequest("POST", "/api/move", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Working []Person `json:"working"`
		Pods    []Pod    `json:"pods"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(resp.Working) != 3 {
		t.Errorf("expected 3 people, got %d", len(resp.Working))
	}
	updated := findById(resp.Working, carol.Id)
	if updated == nil {
		t.Fatal("Carol not found in response")
	}
	if updated.ManagerId != alice.Id {
		t.Errorf("expected Carol's manager to be Alice, got %s", updated.ManagerId)
	}
	if updated.Team != "Eng" {
		t.Errorf("expected Carol's team to be Eng, got %s", updated.Team)
	}
}

// Scenarios: ORG-005
func TestUpdateHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	body, _ := json.Marshal(map[string]any{
		"personId": bob.Id,
		"fields":   map[string]any{"role": "Senior Engineer"},
	})

	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Working []Person `json:"working"`
		Pods    []Pod    `json:"pods"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	updated := findById(resp.Working, bob.Id)
	if updated.Role != "Senior Engineer" {
		t.Errorf("expected role 'Senior Engineer', got '%s'", updated.Role)
	}
}

// Scenarios: ORG-011
func TestAddHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	uploadCSV(t, handler)

	body, _ := json.Marshal(Person{
		Name: "Dave", Role: "Engineer", Discipline: "Eng",
		Team: "Eng", Status: "Active",
	})

	req := httptest.NewRequest("POST", "/api/add", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Created Person   `json:"created"`
		Working []Person `json:"working"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Created.Id == "" {
		t.Error("expected created person to have an ID")
	}
	if resp.Created.Name != "Dave" {
		t.Errorf("expected created name 'Dave', got '%s'", resp.Created.Name)
	}
	if len(resp.Working) != 4 {
		t.Errorf("expected 4 people, got %d", len(resp.Working))
	}
}

// Scenarios: ORG-012
func TestDeleteHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	body, _ := json.Marshal(map[string]string{"personId": bob.Id})

	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Working  []Person `json:"working"`
		Recycled []Person `json:"recycled"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(resp.Working) != 2 {
		t.Errorf("expected 2 working people, got %d", len(resp.Working))
	}
	if len(resp.Recycled) != 1 {
		t.Errorf("expected 1 recycled person, got %d", len(resp.Recycled))
	}
}

// Scenarios: ORG-012
func TestRecycledHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	// Delete Bob first
	body, _ := json.Marshal(map[string]string{"personId": bob.Id})
	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// GET /api/recycled
	req = httptest.NewRequest("GET", "/api/recycled", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var recycled []Person
	if err := json.NewDecoder(rec.Body).Decode(&recycled); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(recycled) != 1 {
		t.Errorf("expected 1 recycled person, got %d", len(recycled))
	}
}

// Scenarios: ORG-012
func TestRestoreHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	// Delete Bob first
	body, _ := json.Marshal(map[string]string{"personId": bob.Id})
	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// POST /api/restore with Bob's ID
	body, _ = json.Marshal(map[string]string{"personId": bob.Id})
	req = httptest.NewRequest("POST", "/api/restore", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Working  []Person `json:"working"`
		Recycled []Person `json:"recycled"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(resp.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(resp.Working))
	}
	if len(resp.Recycled) != 0 {
		t.Errorf("expected 0 recycled people, got %d", len(resp.Recycled))
	}
}

// Scenarios: ORG-014
func TestEmptyBinHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	// Delete Bob first
	body, _ := json.Marshal(map[string]string{"personId": bob.Id})
	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// POST /api/empty-bin
	req = httptest.NewRequest("POST", "/api/empty-bin", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Recycled []Person `json:"recycled"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(resp.Recycled) != 0 {
		t.Errorf("expected 0 recycled people, got %d", len(resp.Recycled))
	}
}

// Scenarios: EXPORT-001
func TestExportHandler_CSV(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("GET", "/api/export/csv", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/csv" {
		t.Errorf("expected Content-Type text/csv, got %s", ct)
	}
	if rec.Body.Len() == 0 {
		t.Error("expected non-empty CSV body")
	}
}

// Scenarios: EXPORT-002
func TestExportHandler_XLSX(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("GET", "/api/export/xlsx", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" {
		t.Errorf("expected XLSX content type, got %s", ct)
	}
	if rec.Body.Len() == 0 {
		t.Error("expected non-empty XLSX body")
	}
}

func uploadNonStandardCSV(t *testing.T, handler http.Handler) *UploadResponse {
	t.Helper()
	// Use unrecognizable headers ("Nombre", "Nivel") so InferMapping won't auto-proceed.
	csvData := "Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", "test.csv")
	if err != nil {
		t.Fatalf("creating form file: %v", err)
	}
	if _, err = part.Write([]byte(csvData)); err != nil {
		t.Fatalf("writing form data: %v", err)
	}
	if err = writer.Close(); err != nil {
		t.Fatalf("closing multipart writer: %v", err)
	}

	req := httptest.NewRequest("POST", "/api/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("upload expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp UploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding upload response: %v", err)
	}
	return &resp
}

// Scenarios: UPLOAD-002
func TestConfirmMappingHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	resp := uploadNonStandardCSV(t, handler)
	if resp.Status != UploadNeedsMapping {
		t.Fatalf("expected 'needs_mapping', got '%s'", resp.Status)
	}

	// POST /api/upload/confirm with explicit mapping
	mapping := map[string]string{
		"name":            "Nombre",
		"role":            "Nivel",
		"discipline":      "Discipline",
		"manager":         "Manager",
		"team":            "Team",
		"additionalTeams": "Additional Teams",
		"status":          "Status",
	}
	body, _ := json.Marshal(map[string]any{"mapping": mapping})

	req := httptest.NewRequest("POST", "/api/upload/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var orgData OrgData
	if err := json.NewDecoder(rec.Body).Decode(&orgData); err != nil {
		t.Fatalf("decoding confirm response: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(orgData.Original))
	}
	if len(orgData.Working) != 2 {
		t.Errorf("expected 2 working people, got %d", len(orgData.Working))
	}
	if orgData.Original[0].Name != "Alice" {
		t.Errorf("expected first person to be Alice, got %s", orgData.Original[0].Name)
	}
}

// Scenarios: ORG-015
func TestReorderHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	body, _ := json.Marshal(map[string]any{
		"personIds": []string{carol.Id, alice.Id, bob.Id},
	})

	req := httptest.NewRequest("POST", "/api/reorder", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Working []Person `json:"working"`
		Pods    []Pod    `json:"pods"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	carolUpdated := findById(resp.Working, carol.Id)
	aliceUpdated := findById(resp.Working, alice.Id)
	bobUpdated := findById(resp.Working, bob.Id)

	if carolUpdated.SortIndex != 0 {
		t.Errorf("expected Carol sortIndex 0, got %d", carolUpdated.SortIndex)
	}
	if aliceUpdated.SortIndex != 1 {
		t.Errorf("expected Alice sortIndex 1, got %d", aliceUpdated.SortIndex)
	}
	if bobUpdated.SortIndex != 2 {
		t.Errorf("expected Bob sortIndex 2, got %d", bobUpdated.SortIndex)
	}
}

// Scenarios: CONTRACT-002
func TestReorderHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/reorder", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}

	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("decoding error response: %v", err)
	}
	if errResp["error"] == "" {
		t.Error("expected error message in JSON response")
	}
}

// Scenarios: ORG-016
func TestResetHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	// Mutate: update Bob's role
	body, _ := json.Marshal(map[string]any{
		"personId": bob.Id,
		"fields":   map[string]any{"role": "Senior Engineer"},
	})
	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update expected 200, got %d", rec.Code)
	}

	// Delete Carol so recycled has data
	carol := findByName(data.Working, "Carol")
	body, _ = json.Marshal(map[string]string{"personId": carol.Id})
	req = httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete expected 200, got %d", rec.Code)
	}

	// POST /api/reset
	req = httptest.NewRequest("POST", "/api/reset", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var orgData OrgData
	if err := json.NewDecoder(rec.Body).Decode(&orgData); err != nil {
		t.Fatalf("decoding response: %v", err)
	}

	if len(orgData.Working) != 3 {
		t.Errorf("expected 3 working people after reset, got %d", len(orgData.Working))
	}
	if len(orgData.Original) != 3 {
		t.Errorf("expected 3 original people after reset, got %d", len(orgData.Original))
	}

	// Bob's role should be back to original
	resetBob := findByName(orgData.Working, "Bob")
	if resetBob.Role != "Engineer" {
		t.Errorf("expected Bob's role to be 'Engineer' after reset, got '%s'", resetBob.Role)
	}

	// Carol should be back
	resetCarol := findByName(orgData.Working, "Carol")
	if resetCarol == nil {
		t.Error("expected Carol to be present after reset")
	}

	// Recycled should be empty (check via GET /api/recycled)
	req = httptest.NewRequest("GET", "/api/recycled", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	var recycled []Person
	if err := json.NewDecoder(rec.Body).Decode(&recycled); err != nil {
		t.Fatalf("decoding recycled: %v", err)
	}
	if len(recycled) != 0 {
		t.Errorf("expected 0 recycled after reset, got %d", len(recycled))
	}
}

// Scenarios: SNAP-001
func TestSnapshotHandlers_SaveAndList(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	// Save a snapshot.
	body, _ := json.Marshal(map[string]string{"name": "v1"})
	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var list []SnapshotInfo
	if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(list))
	}
	if list[0].Name != "v1" {
		t.Errorf("expected name 'v1', got '%s'", list[0].Name)
	}

	// List snapshots.
	req = httptest.NewRequest("GET", "/api/snapshots", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(list))
	}
}

// Scenarios: SNAP-002
func TestSnapshotHandlers_Load(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)

	// Save a snapshot.
	body, _ := json.Marshal(map[string]string{"name": "v1"})
	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("save expected 200, got %d", rec.Code)
	}

	// Mutate working data.
	bob := findByName(data.Working, "Bob")
	body, _ = json.Marshal(map[string]any{
		"personId": bob.Id,
		"fields":   map[string]any{"role": "Senior Engineer"},
	})
	req = httptest.NewRequest("POST", "/api/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update expected 200, got %d", rec.Code)
	}

	// Load snapshot.
	body, _ = json.Marshal(map[string]string{"name": "v1"})
	req = httptest.NewRequest("POST", "/api/snapshots/load", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var orgData OrgData
	if err := json.NewDecoder(rec.Body).Decode(&orgData); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	restoredBob := findByName(orgData.Working, "Bob")
	if restoredBob.Role != "Engineer" {
		t.Errorf("expected Bob's role to be 'Engineer' after load, got '%s'", restoredBob.Role)
	}
}

// Scenarios: SNAP-004
func TestSnapshotHandlers_LoadNotFound(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{"name": "nonexistent"})
	req := httptest.NewRequest("POST", "/api/snapshots/load", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

// Scenarios: SNAP-007
func TestSnapshotHandlers_Delete(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	// Save a snapshot.
	body, _ := json.Marshal(map[string]string{"name": "v1"})
	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("save expected 200, got %d", rec.Code)
	}

	// Delete the snapshot.
	body, _ = json.Marshal(map[string]string{"name": "v1"})
	req = httptest.NewRequest("POST", "/api/snapshots/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var list []SnapshotInfo
	if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("expected 0 snapshots after delete, got %d", len(list))
	}
}

// --- Error path tests for handlers ---

// Scenarios: CONTRACT-002
func TestMoveHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/move", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("decoding error response: %v", err)
	}
	if errResp["error"] == "" {
		t.Error("expected error message")
	}
}

// Scenarios: ORG-003
func TestMoveHandler_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{
		"personId":     "nonexistent",
		"newManagerId": "",
	})
	req := httptest.NewRequest("POST", "/api/move", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestUpdateHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: ORG-008
func TestUpdateHandler_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]any{
		"personId": "nonexistent",
		"fields":   map[string]any{"role": "VP"},
	})
	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestAddHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/add", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestDeleteHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: ORG-013
func TestDeleteHandler_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{"personId": "nonexistent"})
	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestRestoreHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/restore", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: ORG-013
func TestRestoreHandler_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{"personId": "nonexistent"})
	req := httptest.NewRequest("POST", "/api/restore", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestConfirmMappingHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("POST", "/api/upload/confirm", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: UPLOAD-003
func TestConfirmMappingHandler_NoPending(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	body, _ := json.Marshal(map[string]any{"mapping": map[string]string{"name": "Name"}})
	req := httptest.NewRequest("POST", "/api/upload/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

// Scenarios: EXPORT-003
func TestExportHandler_EmptyOrg(t *testing.T) {
	t.Parallel()
	// When no data has been uploaded, export should return 400.
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/export/csv", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Scenarios: EXPORT-003
func TestExportHandler_UnsupportedFormat(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("GET", "/api/export/pdf", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("decoding error response: %v", err)
	}
	if errResp["error"] != "unsupported export format" {
		t.Errorf("expected 'unsupported export format', got '%s'", errResp["error"])
	}
}

// Scenarios: CONTRACT-002
func TestSaveSnapshotHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestLoadSnapshotHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/snapshots/load", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestDeleteSnapshotHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/snapshots/delete", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: UPLOAD-011
func TestUploadHandler_NoFile(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("POST", "/api/upload", nil)
	req.Header.Set("Content-Type", "multipart/form-data")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: UPLOAD-011
func TestUploadHandler_UnsupportedFormat(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", "test.txt")
	if err != nil {
		t.Fatalf("creating form file: %v", err)
	}
	if _, err = part.Write([]byte("hello world")); err != nil {
		t.Fatalf("writing form data: %v", err)
	}
	if err = writer.Close(); err != nil {
		t.Fatalf("closing multipart writer: %v", err)
	}

	req := httptest.NewRequest("POST", "/api/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- Autosave handler tests ---

// Scenarios: AUTO-006
func TestAutosaveHandlers_WriteReadDelete(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	// Write autosave
	data := AutosaveData{
		Original:  []Person{{Id: "1", Name: "Alice", Status: "Active", Team: "Eng"}},
		Working:   []Person{{Id: "1", Name: "Alice", Status: "Active", Team: "Eng"}},
		Timestamp: "2026-03-21T12:00:00Z",
	}
	body, _ := json.Marshal(data)
	req := httptest.NewRequest("POST", "/api/autosave", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("write expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Read autosave
	req = httptest.NewRequest("GET", "/api/autosave", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("read expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var readData AutosaveData
	if err := json.NewDecoder(rec.Body).Decode(&readData); err != nil {
		t.Fatalf("decoding autosave: %v", err)
	}
	if len(readData.Original) != 1 {
		t.Errorf("expected 1 original, got %d", len(readData.Original))
	}

	// Delete autosave
	req = httptest.NewRequest("DELETE", "/api/autosave", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("delete expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Read again — should be 204
	req = httptest.NewRequest("GET", "/api/autosave", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

// Scenarios: CONTRACT-002
func TestAutosaveHandler_WriteInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("POST", "/api/autosave", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

// Scenarios: AUTO-006
func TestAutosaveHandler_ReadMissing(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/autosave", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

// Scenarios: AUTO-006
func TestAutosaveHandler_DeleteMissing(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("DELETE", "/api/autosave", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

// Scenarios: SNAP-008
func TestExportSnapshotHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	// Save a snapshot
	body, _ := json.Marshal(map[string]any{"name": "snap1"})
	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	t.Run("[SNAP-008] exports working as CSV", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=__working__&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		if rec.Header().Get("Content-Type") != "text/csv" {
			t.Errorf("expected text/csv, got %s", rec.Header().Get("Content-Type"))
		}
	})

	t.Run("[SNAP-008] exports named snapshot as CSV", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=snap1&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("[SNAP-008] 404 for missing snapshot", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=nope&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("[SNAP-008] 400 for unsupported format", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=__working__&format=pdf", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	})
}

// Scenarios: CONTRACT-003
func TestHealthEndpoint(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status 'ok', got '%s'", resp["status"])
	}
}

// Scenarios: UPLOAD-006
func TestUploadZipHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	csvContent := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"
	csvContent2 := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Senior Engineer,Eng,Alice,Platform,,Active\n"

	// Build ZIP
	var zipBuf bytes.Buffer
	zw := zip.NewWriter(&zipBuf)
	f1, err := zw.Create("0-original.csv")
	if err != nil {
		t.Fatalf("create zip entry: %v", err)
	}
	_, _ = f1.Write([]byte(csvContent))
	f2, err := zw.Create("1-working.csv")
	if err != nil {
		t.Fatalf("create zip entry: %v", err)
	}
	_, _ = f2.Write([]byte(csvContent2))
	f3, err := zw.Create("2-reorg.csv")
	if err != nil {
		t.Fatalf("create zip entry: %v", err)
	}
	_, _ = f3.Write([]byte(csvContent))
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	// Upload ZIP via multipart
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", "test.zip")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	_, _ = part.Write(zipBuf.Bytes())
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest("POST", "/api/upload/zip", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp UploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Status != UploadReady {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.Snapshots) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(resp.Snapshots))
	}
}

// Scenarios: SETTINGS-001
func TestSettingsHandler_GetAndPost(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	_, _ = svc.Upload(context.Background(), "test.csv", []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n"))
	req := httptest.NewRequest("GET", "/api/settings", nil)
	w := httptest.NewRecorder()
	NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore()).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("GET: expected 200, got %d", w.Code)
	}
	var settings Settings
	_ = json.Unmarshal(w.Body.Bytes(), &settings)
	if len(settings.DisciplineOrder) == 0 {
		t.Error("expected non-empty discipline order")
	}
	body := `{"disciplineOrder":["Product","Eng"]}`
	req = httptest.NewRequest("POST", "/api/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore()).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("POST: expected 200, got %d", w.Code)
	}
}

// --- RestoreState handler tests ---

// Scenarios: AUTO-007
func TestRestoreStateHandler_Valid(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	data := AutosaveData{
		Original: []Person{
			{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Role: "Engineer", Team: "Platform", ManagerId: "1", Status: "Active"},
		},
		Working: []Person{
			{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Role: "Senior Engineer", Team: "Platform", ManagerId: "1", Status: "Active"},
		},
		Settings: &Settings{DisciplineOrder: []string{"Eng"}},
	}
	body, _ := json.Marshal(data)
	req := httptest.NewRequest("POST", "/api/restore-state", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status 'ok', got '%s'", resp["status"])
	}

	// Verify state was loaded by fetching org
	req = httptest.NewRequest("GET", "/api/org", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from /api/org, got %d", rec.Code)
	}
	var orgData OrgData
	if err := json.NewDecoder(rec.Body).Decode(&orgData); err != nil {
		t.Fatalf("decoding org: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 original, got %d", len(orgData.Original))
	}
	if len(orgData.Working) != 2 {
		t.Errorf("expected 2 working, got %d", len(orgData.Working))
	}
	bob := findByName(orgData.Working, "Bob")
	if bob == nil {
		t.Fatal("expected Bob in working")
	}
	if bob.Role != "Senior Engineer" {
		t.Errorf("expected Bob's role 'Senior Engineer', got '%s'", bob.Role)
	}
}

// Scenarios: CONTRACT-002
func TestRestoreStateHandler_InvalidJSON(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("POST", "/api/restore-state", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("decoding error response: %v", err)
	}
	if errResp["error"] == "" {
		t.Error("expected error message")
	}
}

// --- Body size limit test ---

// Scenarios: CONTRACT-002
func TestBodySizeLimit(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	uploadCSV(t, handler)

	// Create a body larger than 1 MB (the limitBody threshold)
	bigBody := make([]byte, (1<<20)+1024) // 1 MB + 1 KB
	// Fill with valid-looking JSON prefix to ensure the limit is hit during read
	copy(bigBody, []byte(`{"personId":"x","fields":{"name":"`))
	for i := len(`{"personId":"x","fields":{"name":"`); i < len(bigBody)-3; i++ {
		bigBody[i] = 'A'
	}
	copy(bigBody[len(bigBody)-3:], []byte(`"}}`))

	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader(bigBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	// The request should be rejected — either 400 or 413
	if rec.Code == http.StatusOK {
		t.Error("expected request to be rejected for body exceeding 1MB limit, but got 200")
	}
}

// Scenario: CONTRACT-012
func TestSanitizeFilename(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"normal filename", "org-export.csv", "org-export.csv"},
		{"CRLF injection", "export\r\nX-Injected: true\r\n.csv", "exportX-Injected: true.csv"},
		{"null bytes", "export\x00.csv", "export.csv"},
		{"quotes", "export\".csv", "export.csv"},
		{"control chars stripped", "export\x01\x02.csv", "export.csv"},
		{"empty after sanitization", "\r\n", "download"},
		{"unicode preserved", "données.csv", "données.csv"},
		{"spaces preserved", "my export.csv", "my export.csv"},
		{"backslashes stripped", `export\.csv`, "export.csv"},
		{"path traversal stripped", "../../../etc/passwd", "passwd"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := sanitizeFilename(tc.input)
			if got != tc.expected {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

// Scenario: CONTRACT-012
func TestWriteFileResponse_SanitizedHeader(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	writeFileResponse(rec, []byte("data"), "text/csv", "export\r\nX-Injected: true\r\n.csv")

	// Should have exactly one Content-Disposition header
	cdHeaders := rec.Result().Header["Content-Disposition"]
	if len(cdHeaders) != 1 {
		t.Fatalf("expected 1 Content-Disposition header, got %d: %v", len(cdHeaders), cdHeaders)
	}

	// The header value should not contain CRLF
	cd := cdHeaders[0]
	if strings.ContainsAny(cd, "\r\n") {
		t.Errorf("Content-Disposition contains control characters: %q", cd)
	}

	// Filename should be quoted and sanitized
	expected := `attachment; filename="exportX-Injected: true.csv"`
	if cd != expected {
		t.Errorf("Content-Disposition = %q, want %q", cd, expected)
	}

	// No injected headers should appear
	if rec.Result().Header.Get("X-Injected") != "" {
		t.Error("header injection succeeded: X-Injected header found in response")
	}
}

// --- Content-Type validation tests ---

// Scenarios: CONTRACT-014
func TestContentTypeValidation(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	// Pick a representative JSON endpoint
	working := svc.GetWorking(context.Background())
	personId := working[0].Id
	body := fmt.Sprintf(`{"personId":"%s","fields":{"role":"Staff"}}`, personId)

	cases := []struct {
		name        string
		contentType string
		wantStatus  int
	}{
		{"application/json", "application/json", 200},
		{"application/json with charset", "application/json; charset=utf-8", 200},
		{"empty content-type", "", 200},
		{"text/plain rejected", "text/plain", 415},
		{"text/html rejected", "text/html", 415},
		{"multipart/form-data rejected", "multipart/form-data", 415},
		{"application/xml rejected", "application/xml", 415},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest("POST", "/api/update", strings.NewReader(body))
			if tc.contentType != "" {
				req.Header.Set("Content-Type", tc.contentType)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("Content-Type %q: expected %d, got %d: %s", tc.contentType, tc.wantStatus, rec.Code, rec.Body.String())
			}
		})
	}
}

// Scenarios: CONTRACT-014
func TestContentTypeValidation_ErrorShape(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("POST", "/api/update", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != 415 {
		t.Fatalf("expected 415, got %d", rec.Code)
	}
	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("error response not valid JSON: %v", err)
	}
	if errResp["error"] == "" {
		t.Error("expected non-empty error message")
	}
}

// Scenarios: CREATE-001
func TestCreateHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	body := strings.NewReader(`{"name":"Alice"}`)
	req := httptest.NewRequest("POST", "/api/create", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var data OrgData
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(data.Working) != 1 {
		t.Errorf("expected 1 working person, got %d", len(data.Working))
	}
	if data.Working[0].Name != "Alice" {
		t.Errorf("expected Alice, got %s", data.Working[0].Name)
	}
	// [CREATE-001] disciplineOrder must be [] (not null) so it serializes as [] in JSON
	if data.Settings == nil {
		t.Fatal("expected non-nil settings in response")
	}
	if data.Settings.DisciplineOrder == nil {
		t.Error("[CREATE-001] disciplineOrder must be [] not null after create")
	}
}

// Scenarios: CREATE-004
func TestCreateHandler_EmptyName(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	body := strings.NewReader(`{"name":""}`)
	req := httptest.NewRequest("POST", "/api/create", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Scenarios: CREATE-002
func TestAddParentHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)
	alice := findByName(data.Working, "Alice")

	body := strings.NewReader(fmt.Sprintf(`{"childId":"%s","name":"CEO"}`, alice.Id))
	req := httptest.NewRequest("POST", "/api/people/add-parent", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp AddResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Created.Name != "CEO" {
		t.Errorf("expected created name CEO, got %s", resp.Created.Name)
	}
	updatedAlice := findByName(resp.Working, "Alice")
	if updatedAlice.ManagerId != resp.Created.Id {
		t.Errorf("expected Alice's manager to be %s, got %s", resp.Created.Id, updatedAlice.ManagerId)
	}
}

// Scenarios: CREATE-004
func TestAddParentHandler_EmptyName(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)
	alice := findByName(data.Working, "Alice")

	body := strings.NewReader(fmt.Sprintf(`{"childId":"%s","name":""}`, alice.Id))
	req := httptest.NewRequest("POST", "/api/people/add-parent", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Scenarios: CREATE-003
func TestAddParentHandler_ChildHasManager(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob") // Bob reports to Alice

	body := strings.NewReader(fmt.Sprintf(`{"childId":"%s","name":"Middle"}`, bob.Id))
	req := httptest.NewRequest("POST", "/api/people/add-parent", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

