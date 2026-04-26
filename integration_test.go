package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/zachthieme/grove/internal/api"
	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/snapshot"
)

// Scenarios: CONTRACT-007
func TestIntegration_WebAPI_RoundTrip(t *testing.T) {
	t.Parallel()
	handler, data := uploadTestCSV(t)

	if len(data.Working) != 3 {
		t.Fatalf("expected 3 people, got %d", len(data.Working))
	}

	bob := findAPINodeByName(data.Working, "Bob")
	if bob == nil {
		t.Fatal("expected to find Bob")
	}
	postJSON(t, handler, "/api/update",
		fmt.Sprintf(`{"personId":"%s","fields":{"role":"Staff Engineer"}}`, bob.Id), 200)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/export/csv", nil)
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

// Scenarios: SNAP-001, SNAP-002
func TestIntegration_SnapshotRoundTrip(t *testing.T) {
	t.Parallel()
	handler, data := uploadTestCSV(t)

	bob := findAPINodeByName(data.Working, "Bob")
	if bob == nil {
		t.Fatal("expected to find Bob")
	}

	// Update Bob's role
	postJSON(t, handler, "/api/update",
		fmt.Sprintf(`{"personId":"%s","fields":{"role":"Staff Engineer"}}`, bob.Id), 200)

	// Save a snapshot
	postJSON(t, handler, "/api/snapshots/save", `{"name":"before-reorg"}`, 200)

	// Verify snapshot appears in list
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/snapshots", nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("list snapshots: %d", rec.Code)
	}
	var snapshots []snapshot.Info
	if err := json.NewDecoder(rec.Body).Decode(&snapshots); err != nil {
		t.Fatalf("decode snapshots: %v", err)
	}
	found := false
	for _, s := range snapshots {
		if s.Name == "before-reorg" {
			found = true
		}
	}
	if !found {
		t.Error("expected snapshot 'before-reorg' in list")
	}

	// Update Bob again
	postJSON(t, handler, "/api/update",
		fmt.Sprintf(`{"personId":"%s","fields":{"role":"Principal Engineer"}}`, bob.Id), 200)

	// Load the snapshot — should restore Staff Engineer
	body := postJSON(t, handler, "/api/snapshots/load", `{"name":"before-reorg"}`, 200)
	var orgData api.OrgData
	if err := json.Unmarshal(body, &orgData); err != nil {
		t.Fatalf("decode load snapshot: %v", err)
	}
	restoredBob := findAPINodeByName(orgData.Working, "Bob")
	if restoredBob == nil {
		t.Fatal("Bob missing after snapshot load")
	}
	if restoredBob.Role != "Staff Engineer" {
		t.Errorf("expected Bob's role 'Staff Engineer' after snapshot load, got '%s'", restoredBob.Role)
	}
}

// Scenarios: ORG-018
func TestIntegration_PodWorkflow(t *testing.T) {
	t.Parallel()
	handler, data := uploadTestCSV(t)

	alice := findAPINodeByName(data.Working, "Alice")
	if alice == nil {
		t.Fatal("expected to find Alice")
	}

	// Create a pod under Alice
	body := postJSON(t, handler, "/api/pods/create",
		fmt.Sprintf(`{"managerId":"%s","name":"Alpha","team":"Platform"}`, alice.Id), 200)
	var workResp api.WorkingResponse
	if err := json.Unmarshal(body, &workResp); err != nil {
		t.Fatalf("decode create pod: %v", err)
	}
	if len(workResp.Pods) == 0 {
		t.Fatal("expected at least one pod after creation")
	}
	var alphaPod *apitypes.Pod
	for i := range workResp.Pods {
		if workResp.Pods[i].Name == "Alpha" {
			alphaPod = &workResp.Pods[i]
		}
	}
	if alphaPod == nil {
		t.Fatal("expected pod 'Alpha' in response")
	}

	// Verify pods appear in list endpoint
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/pods", nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("list pods: %d", rec.Code)
	}

	// Update the pod notes
	postJSON(t, handler, "/api/pods/update",
		fmt.Sprintf(`{"podId":"%s","fields":{"publicNote":"Pod for alpha team"}}`, alphaPod.Id), 200)

	// Export pods sidecar CSV and verify it contains the pod
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/export/pods-sidecar", nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("export pods sidecar: %d", rec.Code)
	}
	exported := rec.Body.String()
	if !strings.Contains(exported, "Alpha") {
		t.Error("expected pods sidecar CSV to contain pod name 'Alpha'")
	}
}

// Scenarios: CONTRACT-007
func TestIntegration_ErrorResponses(t *testing.T) {
	t.Parallel()
	handler, _ := uploadTestCSV(t)

	// Move to nonexistent manager → 404
	body := postJSON(t, handler, "/api/move",
		`{"personId":"nonexistent-id","newManagerId":"also-fake","newTeam":"X"}`, 404)
	var errResp map[string]string
	if err := json.Unmarshal(body, &errResp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResp["error"] == "" {
		t.Error("expected error message in 404 response")
	}

	// Update with unknown field → 422
	postJSON(t, handler, "/api/update",
		`{"personId":"nonexistent-id","fields":{"name":"X"}}`, 404)

	// Export with no data loaded → use fresh service
	freshSvc := api.NewOrgService(snapshot.NewMemoryStore())
	freshHandler := api.NewRouter(api.NewServices(freshSvc), nil, autosave.NewMemoryStore())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/export/csv", nil)
	freshHandler.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Errorf("expected 400 for export with no data, got %d", rec.Code)
	}

	// Load nonexistent snapshot → 404
	postJSON(t, handler, "/api/snapshots/load", `{"name":"does-not-exist"}`, 404)
}

// Scenarios: ORG-002
func TestIntegration_CycleDetection(t *testing.T) {
	t.Parallel()
	handler, data := uploadTestCSV(t)

	// Alice → Bob → Carol. Moving Alice under Carol should fail (cycle).
	alice := findAPINodeByName(data.Working, "Alice")
	carol := findAPINodeByName(data.Working, "Carol")
	if alice == nil || carol == nil {
		t.Fatal("expected to find Alice and Carol")
	}

	body := postJSON(t, handler, "/api/move",
		fmt.Sprintf(`{"personId":"%s","newManagerId":"%s","newTeam":"Eng"}`, alice.Id, carol.Id), 422)
	var errResp map[string]string
	if err := json.Unmarshal(body, &errResp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if !strings.Contains(errResp["error"], "circular") {
		t.Errorf("expected circular chain error, got: %s", errResp["error"])
	}
}

// --- helpers ---

// uploadTestCSV uploads testdata/simple.csv and returns the handler and org data.
func uploadTestCSV(t *testing.T) (handler http.Handler, data *api.OrgData) {
	t.Helper()
	svc := api.NewOrgService(snapshot.NewMemoryStore())
	handler = api.NewRouter(api.NewServices(svc), nil, autosave.NewMemoryStore())

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
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}

	var resp api.UploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return handler, resp.OrgData
}

// postJSON sends a JSON POST and asserts the expected status code. Returns the response body.
func postJSON(t *testing.T, handler http.Handler, path, payload string, wantStatus int) []byte {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", path, strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	handler.ServeHTTP(rec, req)
	if rec.Code != wantStatus {
		t.Fatalf("%s: expected %d, got %d: %s", path, wantStatus, rec.Code, rec.Body.String())
	}
	return rec.Body.Bytes()
}

func findAPINodeByName(people []apitypes.OrgNode, name string) *apitypes.OrgNode {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}
