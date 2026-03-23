package api

import (
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

func TestUploadZip_ThreeFiles(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"2-snapshot.csv", testCSVContent3},
	})

	resp, err := svc.UploadZip(data)
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

func TestUploadZip_SingleFile(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"org.csv", testCSVContent},
	})

	resp, err := svc.UploadZip(data)
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

func TestUploadZip_NoCSVFiles(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"image.png", "not a csv"},
	})

	_, err := svc.UploadZip(data)
	if err == nil {
		t.Error("expected error for ZIP with no CSV files")
	}
}

func TestUploadZip_UnprefixedFiles(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"beta.csv", testCSVContent},
		{"alpha.csv", testCSVContent2},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
}

func TestUploadZip_IgnoresNonCSV(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"chart.png", "binary data"},
		{"README.md", "ignore me"},
	})

	resp, err := svc.UploadZip(data)
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
