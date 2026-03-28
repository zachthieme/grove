package api

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"

	"github.com/zachthieme/grove/internal/parser"
)

// Scenarios: EXPORT-001
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

	expectedHeaders := []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note", "Private"}
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

// Scenarios: EXPORT-001
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

// Scenarios: EXPORT-004
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

// Scenarios: EXPORT-001
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

// Scenarios: EXPORT-001
func TestExportCSV_IncludesExtraColumns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active",
			Extra: map[string]string{"CostCenter": "CC001", "Location": "NYC"}},
		{Id: "2", Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active",
			Extra: map[string]string{"CostCenter": "CC002"}},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")

	// Extra headers should appear after standard headers, sorted alphabetically
	if !strings.Contains(lines[0], "CostCenter") {
		t.Errorf("expected header to contain CostCenter, got: %s", lines[0])
	}
	if !strings.Contains(lines[0], "Location") {
		t.Errorf("expected header to contain Location, got: %s", lines[0])
	}

	// Verify CostCenter comes before Location (alphabetical)
	ccIdx := strings.Index(lines[0], "CostCenter")
	locIdx := strings.Index(lines[0], "Location")
	if ccIdx > locIdx {
		t.Errorf("expected CostCenter before Location in headers")
	}

	// Alice's row should have CC001 and NYC
	if !strings.Contains(lines[1], "CC001") {
		t.Errorf("expected Alice row to contain CC001, got: %s", lines[1])
	}
	if !strings.Contains(lines[1], "NYC") {
		t.Errorf("expected Alice row to contain NYC, got: %s", lines[1])
	}

	// Bob's row should have CC002 but empty Location
	if !strings.Contains(lines[2], "CC002") {
		t.Errorf("expected Bob row to contain CC002, got: %s", lines[2])
	}
}

// Scenarios: EXPORT-001
func TestExportCSV_NoExtraColumns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active"},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")

	// Header count should match standard exportHeaders (15 columns)
	r := csv.NewReader(strings.NewReader(lines[0]))
	fields, _ := r.Read()
	if len(fields) != len(exportHeaders) {
		t.Errorf("expected %d headers, got %d", len(exportHeaders), len(fields))
	}
}

// Scenarios: EXPORT-001
func TestExportCSV_RoundTrip_ExtraColumns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Engineering", Status: "Active",
			Extra: map[string]string{"CostCenter": "CC001", "Location": "NYC", "StartDate": "2020-01-15"}},
		{Id: "2", Name: "Bob", Role: "Engineer", Discipline: "Eng", Team: "Platform", Status: "Active", ManagerId: "1",
			Extra: map[string]string{"CostCenter": "CC002", "Location": "SF"}},
	}

	// Export
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}

	// Re-import via parser
	r := csv.NewReader(bytes.NewReader(data))
	allRows, err := r.ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	header := allRows[0]
	dataRows := allRows[1:]

	mapping := InferMapping(header)
	simpleMapping := make(map[string]string, len(mapping))
	for field, mc := range mapping {
		simpleMapping[field] = mc.Column
	}

	org, err := parser.BuildPeopleWithMapping(header, dataRows, simpleMapping)
	if err != nil {
		t.Fatal(err)
	}

	// Verify extra columns survived the round-trip
	if org.People[0].Extra == nil {
		t.Fatal("expected Extra on Alice after round-trip")
	}
	if org.People[0].Extra["CostCenter"] != "CC001" {
		t.Errorf("CostCenter: got %q, want CC001", org.People[0].Extra["CostCenter"])
	}
	if org.People[0].Extra["Location"] != "NYC" {
		t.Errorf("Location: got %q, want NYC", org.People[0].Extra["Location"])
	}
	if org.People[0].Extra["StartDate"] != "2020-01-15" {
		t.Errorf("StartDate: got %q, want 2020-01-15", org.People[0].Extra["StartDate"])
	}

	if org.People[1].Extra["CostCenter"] != "CC002" {
		t.Errorf("Bob CostCenter: got %q, want CC002", org.People[1].Extra["CostCenter"])
	}
	if org.People[1].Extra["Location"] != "SF" {
		t.Errorf("Bob Location: got %q, want SF", org.People[1].Extra["Location"])
	}
	if _, ok := org.People[1].Extra["StartDate"]; ok {
		t.Error("expected StartDate absent for Bob")
	}
}

// Scenarios: EXPORT-001
func TestExportCSV_IncludesPrivateColumn(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active", Private: true},
		{Id: "2", Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active", Private: false},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")
	if !strings.Contains(lines[0], "Private") {
		t.Errorf("expected header to contain 'Private', got: %s", lines[0])
	}
	if !strings.Contains(lines[1], "true") {
		t.Errorf("expected Alice's row to contain 'true', got: %s", lines[1])
	}
	if !strings.Contains(lines[2], "false") {
		t.Errorf("expected Bob's row to contain 'false', got: %s", lines[2])
	}
}
