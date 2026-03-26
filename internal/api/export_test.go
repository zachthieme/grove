package api

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"
)

func TestExportCSV_RoundTrip(t *testing.T) {
	t.Parallel()
	input := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"

	svc := NewOrgService(NewMemorySnapshotStore())
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

	expectedHeaders := []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note"}
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

	// Employment type should default to "FTE" when not in input
	for _, row := range records[1:] {
		if row[7] != "FTE" {
			t.Errorf("expected employment type 'FTE' for %s, got '%s'", row[0], row[7])
		}
	}
}

func TestExportCSV_IncludesNewFields(t *testing.T) {
	t.Parallel()
	input := "Name,Role,Discipline,Manager,Team,Status,Pod,Public Note,Private Note\nAlice,VP,Eng,,Eng,Active,Alpha,public info,secret info\n"

	svc := NewOrgService(NewMemorySnapshotStore())
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

	if len(records) < 2 {
		t.Fatalf("expected at least 2 rows (header + data), got %d", len(records))
	}

	// Verify headers include the three new columns
	header := records[0]
	expectedNewHeaders := map[string]int{
		"Pod":          11,
		"Public Note":  12,
		"Private Note": 13,
	}
	for name, idx := range expectedNewHeaders {
		if idx >= len(header) {
			t.Errorf("header too short to contain %q at index %d", name, idx)
			continue
		}
		if header[idx] != name {
			t.Errorf("header[%d] = %q, want %q", idx, header[idx], name)
		}
	}

	// Verify data row contains the values
	row := records[1]
	if row[11] != "Alpha" {
		t.Errorf("Pod = %q, want %q", row[11], "Alpha")
	}
	if row[12] != "public info" {
		t.Errorf("Public Note = %q, want %q", row[12], "public info")
	}
	if row[13] != "secret info" {
		t.Errorf("Private Note = %q, want %q", row[13], "secret info")
	}
}

func TestExportPodsSidecarCSV(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "m1", Name: "Alice", Team: "Eng"},
		{Id: "p1", Name: "Bob", ManagerId: "m1", Team: "Platform"},
	}
	pods := []Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "m1",
			PublicNote: "owns pipeline", PrivateNote: "needs headcount"},
	}
	data, err := ExportPodsSidecarCSV(pods, people)
	if err != nil {
		t.Fatal(err)
	}
	csv := string(data)
	if !strings.Contains(csv, "Pod Name") {
		t.Error("expected Pod Name header")
	}
	if !strings.Contains(csv, "Alice") {
		t.Error("expected manager name Alice")
	}
	if !strings.Contains(csv, "owns pipeline") {
		t.Error("expected public note")
	}
	if !strings.Contains(csv, "needs headcount") {
		t.Error("expected private note")
	}
}

func TestExportCSV_IncludesLevel(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active", Level: 7},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	csv := string(data)
	if !strings.Contains(csv, "Level") {
		t.Error("expected Level header")
	}
	if !strings.Contains(csv, "7") {
		t.Error("expected level value 7")
	}
}
