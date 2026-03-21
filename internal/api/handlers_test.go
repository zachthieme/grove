package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
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
	part.Write([]byte(csvData))
	writer.Close()

	req := httptest.NewRequest("POST", "/api/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("upload expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var data OrgData
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decoding upload response: %v", err)
	}
	return &data
}

func TestUploadHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

	data := uploadCSV(t, handler)

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
	handler := NewRouter(svc)

	req := httptest.NewRequest("GET", "/api/org", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

func TestGetOrg_WithData(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)
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
	handler := NewRouter(svc)

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

	var people []Person
	if err := json.NewDecoder(rec.Body).Decode(&people); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(people) != 3 {
		t.Errorf("expected 3 people, got %d", len(people))
	}
	updated := findById(people, carol.Id)
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
	handler := NewRouter(svc)

	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob")

	body, _ := json.Marshal(map[string]interface{}{
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

	var people []Person
	if err := json.NewDecoder(rec.Body).Decode(&people); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	updated := findById(people, bob.Id)
	if updated.Role != "Senior Engineer" {
		t.Errorf("expected role 'Senior Engineer', got '%s'", updated.Role)
	}
}

func TestAddHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

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

	var people []Person
	if err := json.NewDecoder(rec.Body).Decode(&people); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(people) != 4 {
		t.Errorf("expected 4 people, got %d", len(people))
	}
}

func TestDeleteHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

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

	var people []Person
	if err := json.NewDecoder(rec.Body).Decode(&people); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(people) != 2 {
		t.Errorf("expected 2 people, got %d", len(people))
	}
}

func TestExportHandler_CSV(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)
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
	handler := NewRouter(svc)
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
