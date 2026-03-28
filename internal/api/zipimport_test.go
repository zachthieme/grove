package api

import (
	"context"
	"archive/zip"
	"bytes"
	"testing"
)

type zipFile struct {
	name    string
	content string
}

func buildTestZip(t *testing.T, files []zipFile) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, f := range files {
		entry, err := w.Create(f.name)
		if err != nil {
			t.Fatalf("creating zip entry %s: %v", f.name, err)
		}
		if _, err := entry.Write([]byte(f.content)); err != nil {
			t.Fatalf("writing zip entry %s: %v", f.name, err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("closing zip: %v", err)
	}
	return buf.Bytes()
}

const testCSVContent = "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"
const testCSVContent2 = "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Senior Engineer,Eng,Alice,Platform,,Active\n"
const testCSVContent3 = "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,Director,Eng,,Eng,,Active\nBob,Senior Engineer,Eng,Alice,Platform,,Active\nCarol,Intern,Eng,Bob,Platform,,Active\n"

// Scenarios: UPLOAD-006
func TestUploadZip_ThreeFiles(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"2-snapshot.csv", testCSVContent3},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if resp.OrgData == nil {
		t.Fatal("expected orgData")
	}
	if len(resp.OrgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(resp.OrgData.Original))
	}
	if len(resp.OrgData.Working) != 2 {
		t.Errorf("expected 2 working people, got %d", len(resp.OrgData.Working))
	}
	if len(resp.Snapshots) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(resp.Snapshots))
	}
	if len(resp.Snapshots) > 0 && resp.Snapshots[0].Name != "snapshot" {
		t.Errorf("expected snapshot name 'snapshot', got '%s'", resp.Snapshots[0].Name)
	}
}

// Scenarios: UPLOAD-006
func TestUploadZip_SingleFile(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"org.csv", testCSVContent},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.OrgData.Original) != len(resp.OrgData.Working) {
		t.Error("expected original and working to be the same for single file")
	}
	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots for single file, got %d", len(resp.Snapshots))
	}
}

// Scenarios: UPLOAD-007
func TestUploadZip_NoCSVFiles(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"image.png", "not a csv"},
	})

	_, err := svc.UploadZip(context.Background(), data)
	if err == nil {
		t.Error("expected error for ZIP with no CSV files")
	}
}

// Scenarios: UPLOAD-006
func TestUploadZip_UnprefixedFiles(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"beta.csv", testCSVContent},
		{"alpha.csv", testCSVContent2},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
}

// Scenarios: UPLOAD-008
func TestUploadZip_NeedsMapping_ThenConfirm(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Use headers that don't match "name" at all so inference fails
	csvContent := "Who,Title,Dept,Reports To,Group,Extra Teams,State\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", csvContent},
		{"1-working.csv", csvContent},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	orgData, err := svc.ConfirmMapping(context.Background(), map[string]string{
		"name": "Who", "role": "Title", "discipline": "Dept",
		"manager": "Reports To", "team": "Group", "additionalTeams": "Extra Teams",
		"status": "State",
	})
	if err != nil {
		t.Fatalf("ConfirmMapping failed: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(orgData.Original))
	}
}

// Scenarios: UPLOAD-006
func TestUploadZip_SharedIDsAcrossFiles(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}

	// Build name→ID maps for original and working
	origByName := make(map[string]string)
	for _, p := range resp.OrgData.Original {
		origByName[p.Name] = p.Id
	}
	workByName := make(map[string]string)
	for _, p := range resp.OrgData.Working {
		workByName[p.Name] = p.Id
	}

	// People with the same name must share the same UUID across original and working
	for name, origID := range origByName {
		workID, ok := workByName[name]
		if !ok {
			t.Errorf("person %q in original but not in working", name)
			continue
		}
		if origID != workID {
			t.Errorf("person %q has different IDs: original=%s working=%s", name, origID, workID)
		}
	}

	// Manager references must also use shared IDs
	for _, w := range resp.OrgData.Working {
		if w.ManagerId != "" {
			found := false
			for _, o := range resp.OrgData.Working {
				if o.Id == w.ManagerId {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("working person %q has managerID %s that doesn't match any working person", w.Name, w.ManagerId)
			}
		}
	}
}

// Scenarios: UPLOAD-006
func TestUploadZip_SnapshotSharedIDs(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"2-snapshot.csv", testCSVContent3},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}

	// Build name→ID from original
	origByName := make(map[string]string)
	for _, p := range resp.OrgData.Original {
		origByName[p.Name] = p.Id
	}

	// Load the snapshot and verify shared IDs
	orgData, err := svc.LoadSnapshot(context.Background(), "snapshot")
	if err != nil {
		t.Fatalf("LoadSnapshot failed: %v", err)
	}

	for _, p := range orgData.Working {
		if origID, ok := origByName[p.Name]; ok {
			if p.Id != origID {
				t.Errorf("snapshot person %q has ID %s, want %s (from original)", p.Name, p.Id, origID)
			}
		}
		// Carol is new in snapshot — she should have a unique ID (no match expected)
	}
}

// Scenarios: UPLOAD-009
func TestUploadZip_FiltersPodsSidecar(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	podsCsv := "Pod Name,Manager,Team,Public Note,Private Note\nPlatform,Alice,Platform,pod note,secret\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"pods.csv", podsCsv},
	})
	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.OrgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(resp.OrgData.Original))
	}
}

// Scenarios: UPLOAD-009
func TestUploadZip_SeedsPods(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// CSV with explicit Pod values to verify seeding
	csvWithPods := "Name,Role,Discipline,Manager,Team,Additional Teams,Status,Pod\nAlice,VP,Eng,,Eng,,Active,\nBob,Engineer,Eng,Alice,Platform,,Active,Platform\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", csvWithPods},
		{"1-working.csv", csvWithPods},
	})
	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if len(resp.OrgData.Pods) == 0 {
		t.Error("expected pods to be seeded from ZIP import")
	}
}

// Scenarios: UPLOAD-009
func TestUploadZip_NoPodFieldNoPods(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
	})
	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if len(resp.OrgData.Pods) != 0 {
		t.Errorf("expected 0 pods for CSV without Pod field, got %d", len(resp.OrgData.Pods))
	}
}

// Scenarios: UPLOAD-009
func TestUploadZip_RestoresPodNotesFromSidecar(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// CSV with Pod column so SeedPods creates a "Platform" pod
	csvWithPod := "Name,Role,Discipline,Manager,Team,Additional Teams,Status,Pod\nAlice,VP,Eng,,Eng,,Active,\nBob,Engineer,Eng,Alice,Platform,,Active,Platform\n"
	csvWithPod2 := "Name,Role,Discipline,Manager,Team,Additional Teams,Status,Pod\nAlice,VP,Eng,,Eng,,Active,\nBob,Senior Engineer,Eng,Alice,Platform,,Active,Platform\n"
	podsCsv := "Pod Name,Manager,Team,Public Note,Private Note\nPlatform,Alice,Platform,pod note,secret note\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", csvWithPod},
		{"1-working.csv", csvWithPod2},
		{"pods.csv", podsCsv},
	})
	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	found := false
	for _, pod := range resp.OrgData.Pods {
		if pod.Name == "Platform" {
			found = true
			if pod.PublicNote != "pod note" {
				t.Errorf("expected public note 'pod note', got %q", pod.PublicNote)
			}
			if pod.PrivateNote != "secret note" {
				t.Errorf("expected private note 'secret note', got %q", pod.PrivateNote)
			}
		}
	}
	if !found {
		t.Error("Platform pod not found")
	}
}

// Scenarios: UPLOAD-015
func TestUploadZip_RestoresSettingsFromSidecar(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	settingsCsv := "Discipline Order\nProduct\nEng\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"settings.csv", settingsCsv},
	})
	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("expected settings")
	}
	order := resp.OrgData.Settings.DisciplineOrder
	if len(order) != 2 || order[0] != "Product" || order[1] != "Eng" {
		t.Errorf("expected [Product Eng], got %v", order)
	}
}

// Scenarios: UPLOAD-007
func TestUploadZip_IgnoresNonCSV(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"chart.png", "binary data"},
		{"README.md", "ignore me"},
	})

	resp, err := svc.UploadZip(context.Background(), data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots (only original+working), got %d", len(resp.Snapshots))
	}
}
