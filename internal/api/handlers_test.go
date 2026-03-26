package api

import (
	"archive/zip"
	"bytes"
	"encoding/json"
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
	if resp.Status != "ready" {
		t.Fatalf("expected upload status 'ready', got '%s'", resp.Status)
	}
	return resp.OrgData
}

func TestUploadHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestGetOrg_NoData(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("GET", "/api/org", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

func TestGetOrg_WithData(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestMoveHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestUpdateHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	body, _ := json.Marshal(map[string]any{
		"personId": bob.Id,
		"fields":   map[string]string{"role": "Senior Engineer"},
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

func TestAddHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestDeleteHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestRecycledHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestRestoreHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestEmptyBinHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestExportHandler_CSV(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestExportHandler_XLSX(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestConfirmMappingHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	resp := uploadNonStandardCSV(t, handler)
	if resp.Status != "needs_mapping" {
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

func TestReorderHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestReorderHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestResetHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	// Mutate: update Bob's role
	body, _ := json.Marshal(map[string]any{
		"personId": bob.Id,
		"fields":   map[string]string{"role": "Senior Engineer"},
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

func TestSnapshotHandlers_SaveAndList(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestSnapshotHandlers_Load(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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
		"fields":   map[string]string{"role": "Senior Engineer"},
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

func TestSnapshotHandlers_LoadNotFound(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{"name": "nonexistent"})
	req := httptest.NewRequest("POST", "/api/snapshots/load", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestSnapshotHandlers_Delete(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestMoveHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestMoveHandler_PersonNotFound(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{
		"personId":     "nonexistent",
		"newManagerId": "",
	})
	req := httptest.NewRequest("POST", "/api/move", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateHandler_PersonNotFound(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]any{
		"personId": "nonexistent",
		"fields":   map[string]string{"role": "VP"},
	})
	req := httptest.NewRequest("POST", "/api/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestAddHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/add", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestDeleteHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestDeleteHandler_PersonNotFound(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{"personId": "nonexistent"})
	req := httptest.NewRequest("POST", "/api/delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestRestoreHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/restore", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestRestoreHandler_PersonNotFound(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	body, _ := json.Marshal(map[string]string{"personId": "nonexistent"})
	req := httptest.NewRequest("POST", "/api/restore", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestConfirmMappingHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("POST", "/api/upload/confirm", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestConfirmMappingHandler_NoPending(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	body, _ := json.Marshal(map[string]any{"mapping": map[string]string{"name": "Name"}})
	req := httptest.NewRequest("POST", "/api/upload/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestExportHandler_EmptyOrg(t *testing.T) {
	// When no data has been uploaded, export should return 400.
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("GET", "/api/export/csv", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExportHandler_UnsupportedFormat(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

func TestSaveSnapshotHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestLoadSnapshotHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/snapshots/load", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestDeleteSnapshotHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	req := httptest.NewRequest("POST", "/api/snapshots/delete", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestUploadHandler_NoFile(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("POST", "/api/upload", nil)
	req.Header.Set("Content-Type", "multipart/form-data")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestUploadHandler_UnsupportedFormat(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestAutosaveHandlers_WriteReadDelete(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestAutosaveHandler_WriteInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("POST", "/api/autosave", bytes.NewReader([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestAutosaveHandler_ReadMissing(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("GET", "/api/autosave", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

func TestAutosaveHandler_DeleteMissing(t *testing.T) {
	dir := t.TempDir()
	autosaveDir = dir
	defer func() { autosaveDir = "" }()

	svc := NewOrgService()
	handler := NewRouter(svc, nil)

	req := httptest.NewRequest("DELETE", "/api/autosave", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

func TestExportSnapshotHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
	uploadCSV(t, handler)

	// Save a snapshot
	body, _ := json.Marshal(map[string]any{"name": "snap1"})
	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	t.Run("exports working as CSV", func(t *testing.T) {
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

	t.Run("exports named snapshot as CSV", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=snap1&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("404 for missing snapshot", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=nope&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("400 for unsupported format", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=__working__&format=pdf", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	})
}

func TestHealthEndpoint(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestUploadZipHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.Snapshots) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(resp.Snapshots))
	}
}

func TestSettingsHandler_GetAndPost(t *testing.T) {
	svc := NewOrgService()
	svc.Upload("test.csv", []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n"))
	req := httptest.NewRequest("GET", "/api/settings", nil)
	w := httptest.NewRecorder()
	NewRouter(svc, nil).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("GET: expected 200, got %d", w.Code)
	}
	var settings Settings
	json.Unmarshal(w.Body.Bytes(), &settings)
	if len(settings.DisciplineOrder) == 0 {
		t.Error("expected non-empty discipline order")
	}
	body := `{"disciplineOrder":["Product","Eng"]}`
	req = httptest.NewRequest("POST", "/api/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	NewRouter(svc, nil).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("POST: expected 200, got %d", w.Code)
	}
}

// --- RestoreState handler tests ---

func TestRestoreStateHandler_Valid(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestRestoreStateHandler_InvalidJSON(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)

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

func TestBodySizeLimit(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc, nil)
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

