package api

import (
	"bytes"
	"encoding/csv"
	"testing"
)

func TestExportCSV_RoundTrip(t *testing.T) {
	input := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"

	svc := NewOrgService()
	if _, err := svc.Upload("test.csv", []byte(input)); err != nil {
		t.Fatalf("upload: %v", err)
	}

	data, err := ExportCSV(svc.GetWorking())
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("parsing exported CSV: %v", err)
	}

	if len(records) != 3 {
		t.Fatalf("expected 3 rows (header + 2 data), got %d", len(records))
	}

	expectedHeaders := []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status"}
	for i, h := range expectedHeaders {
		if records[0][i] != h {
			t.Errorf("header[%d]: expected %s, got %s", i, h, records[0][i])
		}
	}

	// Alice is a root — manager should be empty
	if records[1][0] != "Alice" {
		t.Errorf("expected first data row to be Alice, got %s", records[1][0])
	}
	if records[1][3] != "" {
		t.Errorf("expected Alice's manager to be empty, got '%s'", records[1][3])
	}

	// Bob's manager should be "Alice" (name, not UUID)
	if records[2][3] != "Alice" {
		t.Errorf("expected Bob's manager to be 'Alice', got '%s'", records[2][3])
	}
}
