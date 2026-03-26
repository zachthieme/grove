package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/zachthieme/grove/internal/api"
)

func TestIntegration_WebAPI_RoundTrip(t *testing.T) {
	svc := api.NewOrgService(api.NewMemorySnapshotStore())
	handler := api.NewRouter(svc, nil, api.NewMemoryAutosaveStore())

	csvData, err := os.ReadFile("testdata/simple.csv")
	if err != nil {
		t.Fatalf("reading test file: %v", err)
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err2 := writer.CreateFormFile("file", "simple.csv")
	if err2 != nil {
		t.Fatalf("create form file: %v", err2)
	}
	if _, err2 = part.Write(csvData); err2 != nil {
		t.Fatalf("write form: %v", err2)
	}
	if err2 = writer.Close(); err2 != nil {
		t.Fatalf("close writer: %v", err2)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}

	var resp api.UploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected upload status 'ready', got '%s'", resp.Status)
	}
	data := resp.OrgData
	if len(data.Working) != 3 {
		t.Fatalf("expected 3 people, got %d", len(data.Working))
	}

	bob := findAPIPersonByName(data.Working, "Bob")
	if bob == nil {
		t.Fatal("expected to find Bob")
	}
	payload := fmt.Sprintf(`{"personId":"%s","fields":{"role":"Staff Engineer"}}`, bob.Id)
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/update", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("update: %d %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/export/csv", nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("export: %d", rec.Code)
	}

	exported := rec.Body.String()
	if !strings.Contains(exported, "Staff Engineer") {
		t.Error("expected exported CSV to contain updated role 'Staff Engineer'")
	}
	if !strings.Contains(exported, "Alice") {
		t.Error("expected exported CSV to contain Alice")
	}
}

func findAPIPersonByName(people []api.Person, name string) *api.Person {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}
