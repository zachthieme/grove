package org

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/snapshot"
)

// Scenarios: UPLOAD-001
func TestOrgService_Upload(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected org data after upload")
	}
	if len(data.Original) != 3 {
		t.Errorf("expected 3 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(data.Working))
	}
	if data.Original[0].Id != data.Working[0].Id {
		t.Error("expected original and working to share IDs")
	}
}

// Scenarios: UPLOAD-001
func TestOrgService_Upload_AutoProceed(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
		t.Errorf("expected status 'ready', got '%s'", resp.Status)
	}
	if resp.OrgData == nil {
		t.Fatal("expected OrgData to be set")
	}
	if len(resp.OrgData.Original) != 1 {
		t.Errorf("expected 1 person, got %d", len(resp.OrgData.Original))
	}
}

// Scenarios: UPLOAD-002
func TestOrgService_Upload_NeedsMapping(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	// Use headers that won't all map to high confidence.
	// "Nombre" and "Nivel" are unrecognizable, so name/role won't be high.
	csv := []byte("Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Errorf("expected status 'needs_mapping', got '%s'", resp.Status)
	}
	if resp.OrgData != nil {
		t.Error("expected OrgData to be nil for needs_mapping")
	}
	if len(resp.Headers) != 7 {
		t.Errorf("expected 7 headers, got %d", len(resp.Headers))
	}
	if resp.Mapping == nil {
		t.Fatal("expected mapping to be set")
	}
	if len(resp.Preview) < 2 {
		t.Errorf("expected at least 2 preview rows (header + data), got %d", len(resp.Preview))
	}
}

// Scenarios: UPLOAD-002
func TestOrgService_ConfirmMapping(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	// Use unrecognizable headers so InferMapping won't auto-proceed.
	csv := []byte("Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	mapping := map[string]string{
		"name":            "Nombre",
		"role":            "Nivel",
		"discipline":      "Discipline",
		"manager":         "Manager",
		"team":            "Team",
		"additionalTeams": "Additional Teams",
		"status":          "Status",
	}
	orgData, err := svc.ConfirmMapping(context.Background(), mapping)
	if err != nil {
		t.Fatalf("confirm mapping failed: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(orgData.Original))
	}
	if len(orgData.Working) != 2 {
		t.Errorf("expected 2 working people, got %d", len(orgData.Working))
	}
}

// Scenarios: UPLOAD-003
func TestOrgService_ConfirmMapping_NoPending(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	_, err := svc.ConfirmMapping(context.Background(), map[string]string{"name": "Name"})
	if err == nil {
		t.Fatal("expected error when no pending file")
	}
}

// Scenarios: UPLOAD-008
func TestOrgService_ConfirmMapping_NonZip(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	csv := []byte("Full Name,Title,Department,Reports To,Group\nAlice,VP,Eng,,Eng\nBob,SWE,Eng,Alice,Platform\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Skipf("headers were auto-mapped; skipping confirm test")
	}
	mapping := map[string]string{
		"name": "Full Name", "role": "Title", "discipline": "Department",
		"manager": "Reports To", "team": "Group",
	}
	data, err := svc.ConfirmMapping(context.Background(), mapping)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if len(data.Working) != 2 {
		t.Errorf("expected 2 working, got %d", len(data.Working))
	}
}

// Scenarios: UPLOAD-011
func TestOrgService_Upload_UnsupportedFormat(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	_, err := svc.Upload(context.Background(), "test.txt", []byte("hello"))
	if err == nil {
		t.Fatal("expected error for unsupported format")
	}
}

// Scenarios: UPLOAD-011
func TestOrgService_Upload_InvalidCSV(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	// Only header, no data row
	_, err := svc.Upload(context.Background(), "test.csv", []byte("Name,Role\n"))
	if err == nil {
		t.Fatal("expected error for CSV with no data rows")
	}
}

// Scenarios: UPLOAD-011
func TestUpload_PreservesSnapshotsOnParseFailure(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	if err := svc.SaveSnapshot(context.Background(), "important"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	if len(svc.ListSnapshots(context.Background())) != 1 {
		t.Fatal("expected 1 snapshot")
	}
	// Upload invalid data — should fail without destroying snapshots
	_, err := svc.Upload(context.Background(), "bad.csv", []byte("just-one-row-no-data\n"))
	if err == nil {
		t.Fatal("expected upload to fail")
	}
	// Snapshots should still exist
	if len(svc.ListSnapshots(context.Background())) != 1 {
		t.Error("expected snapshot to survive failed upload")
	}
}

// Scenarios: ORG-018
func TestUpload_SeedsPods(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	csv := "Name,Role,Discipline,Manager,Team,Status,Pod\nAlice,VP,Eng,,Eng,Active,\nBob,Engineer,Eng,Alice,Platform,Active,Platform\nCarol,Engineer,Eng,Alice,Infra,Active,Infra\n"
	resp, err := svc.Upload(context.Background(), "test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	if resp.OrgData == nil {
		t.Fatal("expected orgData")
	}
	if len(resp.OrgData.Pods) != 2 {
		t.Errorf("expected 2 pods, got %d", len(resp.OrgData.Pods))
	}
}

// Scenarios: SETTINGS-002
func TestUpload_DerivesSettings(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Product,,Eng,Active\nBob,Engineer,Engineering,Alice,Platform,Active\n"
	resp, err := svc.Upload(context.Background(), "test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("expected settings")
	}
	order := resp.OrgData.Settings.DisciplineOrder
	if len(order) != 2 {
		t.Fatalf("expected 2 disciplines, got %d", len(order))
	}
	if order[0] != "Engineering" || order[1] != "Product" {
		t.Errorf("expected [Engineering Product], got %v", order)
	}
}

// --- RestoreState tests ---
// Scenarios: CONTRACT-008
func TestConfirmMapping_CancelledContext(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	// Upload a file that needs mapping (non-standard headers)
	csv := []byte("Nombre,Cargo,Departamento\nAlice,VP,Eng\nBob,Engineer,Eng\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Cancel context before calling ConfirmMapping
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled

	_, err = svc.ConfirmMapping(ctx, map[string]string{"name": "Nombre"})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if err != context.Canceled {
		t.Errorf("expected context.Canceled, got %v", err)
	}

	// Verify no state was committed — pending was cleared in Phase 1,
	// but no org data should be loaded
	org := svc.GetOrg(context.Background())
	if org != nil {
		t.Error("expected nil org data (no state committed)")
	}
}

func TestConfirmMapping_DeadlineExceeded(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	csv := []byte("Nombre,Cargo,Departamento\nAlice,VP,Eng\nBob,Engineer,Eng\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Create an already-expired deadline
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	_, err = svc.ConfirmMapping(ctx, map[string]string{"name": "Nombre"})
	if err == nil {
		t.Fatal("expected error from expired deadline")
	}
	if err != context.DeadlineExceeded {
		t.Errorf("expected context.DeadlineExceeded, got %v", err)
	}
}

// Scenarios: CONC-004
func TestConfirmMapping_RejectsStaleEpoch(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	// Upload A — needs mapping (non-standard headers that won't auto-map)
	csvA := []byte("PersonLabel,JobCode\nAlice,VP\n")
	respA, err := svc.Upload(context.Background(), "a.csv", csvA)
	if err != nil {
		t.Fatalf("upload A: %v", err)
	}
	if respA.Status != UploadNeedsMapping {
		t.Skipf("headers auto-mapped; cannot test epoch race")
	}

	// Upload B — supersedes A
	csvB := []byte("PersonLabel,JobCode\nBob,SWE\n")
	respB, err := svc.Upload(context.Background(), "b.csv", csvB)
	if err != nil {
		t.Fatalf("upload B: %v", err)
	}
	if respB.Status != UploadNeedsMapping {
		t.Skipf("headers auto-mapped; cannot test epoch race")
	}

	// Confirm with A's mapping — should fail because B superseded it
	_, err = svc.ConfirmMapping(context.Background(), map[string]string{"name": "PersonLabel", "role": "JobCode"})
	if err == nil {
		t.Fatal("expected conflict error when confirming stale upload, got nil")
	}
	if !IsConflict(err) {
		t.Errorf("expected conflict error, got: %v", err)
	}
}

// Scenarios: CONC-004
func TestConfirmMapping_AcceptsCurrentEpoch(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	csv := []byte("PersonLabel,JobCode\nAlice,VP\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != UploadNeedsMapping {
		t.Skipf("headers auto-mapped; cannot test epoch")
	}

	data, err := svc.ConfirmMapping(context.Background(), map[string]string{"name": "PersonLabel", "role": "JobCode"})
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if len(data.Working) != 1 {
		t.Errorf("expected 1 working person, got %d", len(data.Working))
	}
}

// Scenarios: UPLOAD-012
func TestUpload_RaggedCSV(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	// Row 2 has fewer fields than header (3 vs 5)
	csv := "Name,Role,Team,Manager,Level\nAlice,VP,Eng,Bob,29\nCarol,SWE\nDave,,,Alice,\n"
	data, err := svc.Upload(context.Background(), "ragged.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if data.Status != "ready" {
		t.Fatalf("expected ready, got %s", data.Status)
	}
	// Carol should exist with empty fields
	var carol *apitypes.OrgNode
	for i := range data.OrgData.Working {
		if data.OrgData.Working[i].Name == "Carol" {
			carol = &data.OrgData.Working[i]
			break
		}
	}
	if carol == nil {
		t.Fatal("Carol not found in working set")
	}
	if carol.Role != "SWE" {
		t.Errorf("expected role SWE, got %q", carol.Role)
	}
	if carol.Team != "" {
		t.Errorf("expected empty team, got %q", carol.Team)
	}
}

// Scenarios: UPLOAD-013
func TestUpload_NilAdditionalTeamsBecomesEmptyArray(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	// CSV has no additionalTeams column — field will be nil in Go
	csv := "Name,Role\nAlice,VP\n"
	resp, err := svc.Upload(context.Background(), "minimal.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	for _, p := range resp.OrgData.Working {
		if p.AdditionalTeams == nil {
			t.Errorf("person %q has nil AdditionalTeams, want empty slice", p.Name)
		}
	}
	for _, p := range resp.OrgData.Original {
		if p.AdditionalTeams == nil {
			t.Errorf("original person %q has nil AdditionalTeams, want empty slice", p.Name)
		}
	}
}

// Scenarios: UPLOAD-014
func TestUpload_NameOnlyCSV(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	csv := "Name\nAlice\nBob\nCarol\n"
	resp, err := svc.Upload(context.Background(), "names.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.OrgData.Working) != 3 {
		t.Fatalf("expected 3 people, got %d", len(resp.OrgData.Working))
	}
	// Verify no nil slices in the JSON-ready response
	for _, p := range resp.OrgData.Working {
		if p.AdditionalTeams == nil {
			t.Errorf("person %q: AdditionalTeams is nil", p.Name)
		}
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("Settings is nil")
	}
	if resp.OrgData.Settings.DisciplineOrder == nil {
		t.Error("DisciplineOrder is nil, want empty slice")
	}
	if resp.OrgData.Pods == nil {
		t.Error("Pods is nil, want empty slice")
	}
}

// Scenarios: UPLOAD-014
func TestUpload_JSONNeverContainsNull(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	csv := "Name\nAlice\n"
	resp, err := svc.Upload(context.Background(), "one.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Marshal the OrgData to JSON and check for null arrays
	encoded, err := json.Marshal(resp.OrgData)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	jsonStr := string(encoded)
	// These fields must never be null — they must be []
	for _, field := range []string{`"additionalTeams"`, `"disciplineOrder"`, `"pods"`} {
		if strings.Contains(jsonStr, field+":null") {
			t.Errorf("JSON contains %s:null — must be an empty array", field)
		}
	}
}

// newTestServiceFromNodes creates an OrgService pre-loaded with the given model nodes.
