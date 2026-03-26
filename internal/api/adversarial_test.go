package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
	"testing"
	"unicode/utf8"
)

// setupService creates a fresh OrgService with a simple 3-person org:
// Alice (VP) → Bob (Engineer) → Carol (Engineer).
func setupService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := makeCSV([][]string{
		{"Name", "Role", "Discipline", "Manager", "Team", "Status"},
		{"Alice", "VP", "Eng", "", "Eng", "Active"},
		{"Bob", "Engineer", "Eng", "Alice", "Platform", "Active"},
		{"Carol", "Engineer", "Eng", "Bob", "Platform", "Active"},
	})
	resp, err := svc.Upload("test.csv", data)
	if err != nil {
		t.Fatalf("setup upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

// makeCSV produces valid CSV bytes from a slice of rows (header + data).
func makeCSV(rows [][]string) []byte {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	for _, row := range rows {
		if err := w.Write(row); err != nil {
			panic(fmt.Sprintf("makeCSV write failed: %v", err))
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		panic(fmt.Sprintf("makeCSV flush failed: %v", err))
	}
	return buf.Bytes()
}

func TestAdversarial_BOMMarker(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	csvData := makeCSV([][]string{
		{"Name", "Role", "Manager", "Team", "Status"},
		{"Alice", "VP", "", "Eng", "Active"},
	})
	// Prepend UTF-8 BOM
	bom := []byte{0xEF, 0xBB, 0xBF}
	withBOM := append(bom, csvData...)

	resp, err := svc.Upload("bom.csv", withBOM)
	if err != nil {
		t.Fatalf("upload with BOM failed: %v", err)
	}
	// The BOM may cause the header "Name" to become "\xEF\xBB\xBFName".
	// If it gets needs_mapping, confirm the mapping manually.
	if resp.Status == "needs_mapping" {
		// Find the header that contains "Name" (possibly BOM-prefixed)
		nameHeader := ""
		for _, h := range resp.Headers {
			if strings.Contains(h, "Name") {
				nameHeader = h
				break
			}
		}
		if nameHeader == "" {
			t.Fatal("could not find Name header in BOM-prefixed CSV")
		}
		mapping := map[string]string{
			"name":    nameHeader,
			"role":    "Role",
			"manager": "Manager",
			"team":    "Team",
			"status":  "Status",
		}
		orgData, err := svc.ConfirmMapping(mapping)
		if err != nil {
			t.Fatalf("confirm mapping with BOM failed: %v", err)
		}
		if len(orgData.Working) != 1 {
			t.Fatalf("expected 1 person, got %d", len(orgData.Working))
		}
		return
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready' or 'needs_mapping', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if len(org.Working) != 1 {
		t.Fatalf("expected 1 person, got %d", len(org.Working))
	}
}

func TestAdversarial_MixedLineEndings(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	// Build CSV manually with mixed line endings
	raw := "Name,Role,Manager,Team,Status\r\n" +
		"Alice,VP,,Eng,Active\n" +
		"Bob,Engineer,Alice,Platform,Active\r\n" +
		"Carol,Designer,,Design,Active\n"

	resp, err := svc.Upload("mixed.csv", []byte(raw))
	if err != nil {
		t.Fatalf("upload with mixed line endings failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if len(org.Working) != 3 {
		t.Errorf("expected 3 people, got %d", len(org.Working))
	}
}

func TestAdversarial_UnicodeNames(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	names := []string{
		"\U0001F469\u200D\U0001F4BB",  // 👩‍💻 (woman technologist, with ZWJ)
		"\u7530\u4E2D\u592A\u90CE",    // 田中太郎
		"\u0645\u062D\u0645\u062F",    // محمد
		"Jos\u00E9 Garc\u00EDa",       // José García
		"a\u200Db",                     // zero-width joiner between a and b
	}

	rows := [][]string{{"Name", "Role", "Manager", "Team", "Status"}}
	for _, name := range names {
		rows = append(rows, []string{name, "Engineer", "", "Eng", "Active"})
	}

	resp, err := svc.Upload("unicode.csv", makeCSV(rows))
	if err != nil {
		t.Fatalf("upload with unicode names failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if len(org.Working) != len(names) {
		t.Fatalf("expected %d people, got %d", len(names), len(org.Working))
	}
	for i, want := range names {
		got := org.Working[i].Name
		if got != want {
			t.Errorf("person %d: expected name %q, got %q", i, want, got)
		}
		if !utf8.ValidString(got) {
			t.Errorf("person %d: name is not valid UTF-8", i)
		}
	}
}

func TestAdversarial_XSSInFields(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	csvData := makeCSV([][]string{
		{"Name", "Role", "Manager", "Team", "Status"},
		{"<script>alert('xss')</script>", `"><img src=x onerror=alert(1)>`, "", "javascript:alert(1)", "Active"},
	})

	resp, err := svc.Upload("xss.csv", csvData)
	if err != nil {
		t.Fatalf("upload with XSS payloads failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	p := org.Working[0]
	if p.Name != "<script>alert('xss')</script>" {
		t.Errorf("expected XSS name stored verbatim, got %q", p.Name)
	}
	if p.Role != `"><img src=x onerror=alert(1)>` {
		t.Errorf("expected XSS role stored verbatim, got %q", p.Role)
	}
	if p.Team != "javascript:alert(1)" {
		t.Errorf("expected XSS team stored verbatim, got %q", p.Team)
	}
}

func TestAdversarial_SQLInjectionStrings(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	payload := "Robert'; DROP TABLE people;--"
	csvData := makeCSV([][]string{
		{"Name", "Role", "Manager", "Team", "Status"},
		{payload, "Engineer", "", "Eng", "Active"},
	})

	resp, err := svc.Upload("sqli.csv", csvData)
	if err != nil {
		t.Fatalf("upload with SQL injection string failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if org.Working[0].Name != payload {
		t.Errorf("expected SQL injection name stored verbatim, got %q", org.Working[0].Name)
	}
}

func TestAdversarial_OversizedFields(t *testing.T) {
	svc := setupService(t)
	org := svc.GetOrg()
	bob := findByName(org.Working, "Bob")

	// 501 characters should fail
	tooLong := strings.Repeat("x", 501)
	_, err := svc.Update(bob.Id, map[string]string{"name": tooLong})
	if err == nil {
		t.Fatal("expected error for 501-char name, got nil")
	}
	if !strings.Contains(err.Error(), "too long") {
		t.Errorf("expected 'too long' error, got: %s", err.Error())
	}

	// Exactly 500 characters should succeed
	exact := strings.Repeat("y", 500)
	result, err := svc.Update(bob.Id, map[string]string{"name": exact})
	if err != nil {
		t.Fatalf("expected success for 500-char name, got: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Name != exact {
		t.Error("expected 500-char name to be stored correctly")
	}
}

func TestAdversarial_OversizedNote(t *testing.T) {
	svc := setupService(t)
	org := svc.GetOrg()
	bob := findByName(org.Working, "Bob")

	// 2001 characters should fail
	tooLong := strings.Repeat("n", 2001)
	_, err := svc.Update(bob.Id, map[string]string{"publicNote": tooLong})
	if err == nil {
		t.Fatal("expected error for 2001-char note, got nil")
	}
	if !strings.Contains(err.Error(), "too long") {
		t.Errorf("expected 'too long' error, got: %s", err.Error())
	}

	// Exactly 2000 characters should succeed
	exact := strings.Repeat("m", 2000)
	result, err := svc.Update(bob.Id, map[string]string{"publicNote": exact})
	if err != nil {
		t.Fatalf("expected success for 2000-char note, got: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.PublicNote != exact {
		t.Error("expected 2000-char note to be stored correctly")
	}
}

func TestAdversarial_CircularManagerChain(t *testing.T) {
	svc := setupService(t)
	org := svc.GetOrg()
	alice := findByName(org.Working, "Alice")
	bob := findByName(org.Working, "Bob")
	carol := findByName(org.Working, "Carol")

	// Try to move Alice under Carol (creates A→C→B→A cycle)
	_, err := svc.Move(alice.Id, carol.Id, "")
	if err == nil {
		t.Fatal("expected error for circular move, got nil")
	}
	if !strings.Contains(err.Error(), "circular") {
		t.Errorf("expected 'circular' error, got: %s", err.Error())
	}

	// Try to make Bob his own manager
	_, err = svc.Move(bob.Id, bob.Id, "")
	if err == nil {
		t.Fatal("expected error for self-manager, got nil")
	}
	if !strings.Contains(err.Error(), "own manager") {
		t.Errorf("expected 'own manager' error, got: %s", err.Error())
	}
}

func TestAdversarial_EmptyCSV(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	_, err := svc.Upload("empty.csv", []byte{})
	if err == nil {
		t.Fatal("expected error for empty CSV, got nil")
	}
}

func TestAdversarial_HeaderOnlyCSV(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	csvData := makeCSV([][]string{
		{"Name", "Role", "Manager", "Team", "Status"},
	})
	_, err := svc.Upload("header_only.csv", csvData)
	if err == nil {
		t.Fatal("expected error for header-only CSV, got nil")
	}
	if !strings.Contains(err.Error(), "at least one data row") {
		t.Errorf("expected 'at least one data row' error, got: %s", err.Error())
	}
}

func TestAdversarial_MassivePeopleCount(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	const count = 5000
	rows := [][]string{{"Name", "Role", "Manager", "Team", "Status"}}
	// First person has no manager
	rows = append(rows, []string{"Person0", "VP", "", "Eng", "Active"})
	for i := 1; i < count; i++ {
		rows = append(rows, []string{
			fmt.Sprintf("Person%d", i),
			"Engineer",
			"Person0",
			"Eng",
			"Active",
		})
	}

	resp, err := svc.Upload("massive.csv", makeCSV(rows))
	if err != nil {
		t.Fatalf("upload of %d people failed: %v", count, err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if len(org.Working) != count {
		t.Errorf("expected %d people, got %d", count, len(org.Working))
	}
}

func TestAdversarial_DuplicateHeaders(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	// Duplicate "Name" header — InferMapping maps to the first "Name" column,
	// but BuildPeopleWithMapping's headerIndex map overwrites with the last
	// duplicate, so the second column's value is used.
	csvData := makeCSV([][]string{
		{"Name", "Name", "Role", "Manager", "Team", "Status"},
		{"Alice", "AliceDup", "VP", "", "Eng", "Active"},
	})

	resp, err := svc.Upload("dupheaders.csv", csvData)
	if err != nil {
		t.Fatalf("upload with duplicate headers failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if len(org.Working) != 1 {
		t.Fatalf("expected 1 person, got %d", len(org.Working))
	}
	// Last "Name" column wins due to headerIndex map overwrite in parser
	if org.Working[0].Name != "AliceDup" {
		t.Errorf("expected 'AliceDup' (last Name column wins), got %q", org.Working[0].Name)
	}
}

func TestAdversarial_CommasInQuotedFields(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	csvData := makeCSV([][]string{
		{"Name", "Role", "Manager", "Team", "Status"},
		{"Smith, John", "VP", "", "Eng", "Active"},
	})

	resp, err := svc.Upload("commas.csv", csvData)
	if err != nil {
		t.Fatalf("upload with commas in quoted field failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if org.Working[0].Name != "Smith, John" {
		t.Errorf("expected 'Smith, John', got %q", org.Working[0].Name)
	}
}

func TestAdversarial_NewlinesInQuotedFields(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	// Build CSV manually to include a literal newline inside a quoted field.
	// csv.Writer will handle quoting automatically.
	csvData := makeCSV([][]string{
		{"Name", "Role", "Manager", "Team", "Status"},
		{"Alice\nSmith", "VP", "", "Eng", "Active"},
	})

	resp, err := svc.Upload("newlines.csv", csvData)
	if err != nil {
		t.Fatalf("upload with newlines in quoted field failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected 'ready', got '%s'", resp.Status)
	}
	org := svc.GetOrg()
	if org.Working[0].Name != "Alice\nSmith" {
		t.Errorf("expected 'Alice\\nSmith', got %q", org.Working[0].Name)
	}
}

func TestAdversarial_InvalidStatus(t *testing.T) {
	svc := setupService(t)
	org := svc.GetOrg()
	bob := findByName(org.Working, "Bob")

	_, err := svc.Update(bob.Id, map[string]string{"status": "InvalidStatus"})
	if err == nil {
		t.Fatal("expected error for invalid status, got nil")
	}
	if !strings.Contains(err.Error(), "invalid status") {
		t.Errorf("expected 'invalid status' error, got: %s", err.Error())
	}
}

func TestAdversarial_MoveToNonexistentManager(t *testing.T) {
	svc := setupService(t)
	org := svc.GetOrg()
	bob := findByName(org.Working, "Bob")

	_, err := svc.Move(bob.Id, "nonexistent-uuid-1234", "")
	if err == nil {
		t.Fatal("expected error for non-existent manager, got nil")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected 'not found' error, got: %s", err.Error())
	}
}

func TestAdversarial_DeleteNonexistentPerson(t *testing.T) {
	svc := setupService(t)

	_, err := svc.Delete("nonexistent-uuid-5678")
	if err == nil {
		t.Fatal("expected error for deleting non-existent person, got nil")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected 'not found' error, got: %s", err.Error())
	}
}

func TestAdversarial_RestoreFromEmptyBin(t *testing.T) {
	svc := setupService(t)

	// Bin starts empty — try to restore a random ID
	_, err := svc.Restore("nonexistent-uuid-9999")
	if err == nil {
		t.Fatal("expected error restoring from empty bin, got nil")
	}
	if !strings.Contains(err.Error(), "not found in recycled") {
		t.Errorf("expected 'not found in recycled' error, got: %s", err.Error())
	}
}
