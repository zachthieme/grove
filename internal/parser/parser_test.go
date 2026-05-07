package parser

// Scenarios: CONTRACT-009 — all tests in this file

import (
	"testing"
)

func TestBuildPeopleWithMapping(t *testing.T) {
	t.Parallel()
	header := []string{"Full Name", "Job Title", "Dept", "Supervisor", "Function", "State"}
	rows := [][]string{
		{"Alice", "VP", "Engineering", "", "Eng", "Active"},
		{"Bob", "Engineer", "Platform", "Alice", "Eng", "Active"},
	}
	mapping := map[string]string{
		"name": "Full Name", "role": "Job Title", "discipline": "Function",
		"manager": "Supervisor", "team": "Dept", "status": "State",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Fatalf("expected 2 people, got %d", len(org.People))
	}
	if org.People[0].Name != "Alice" {
		t.Errorf("expected Alice, got %s", org.People[0].Name)
	}
	if org.People[1].Manager != "Alice" {
		t.Errorf("expected Bob's manager to be Alice, got %s", org.People[1].Manager)
	}
	if org.People[0].Team != "Engineering" {
		t.Errorf("expected team Engineering, got %s", org.People[0].Team)
	}
}

func TestBuildPeopleWithMapping_MissingName(t *testing.T) {
	t.Parallel()
	header := []string{"Job Title", "Dept"}
	rows := [][]string{{"VP", "Eng"}}
	mapping := map[string]string{"role": "Job Title", "team": "Dept"}

	_, err := BuildPeopleWithMapping(header, rows, mapping)
	if err == nil {
		t.Fatal("expected error when name is not mapped")
	}
}

func TestBuildPeopleWithMapping_OnlyNameMapped(t *testing.T) {
	t.Parallel()
	header := []string{"Full Name"}
	rows := [][]string{{"Alice"}, {"Bob"}}
	mapping := map[string]string{"name": "Full Name"}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Fatalf("expected 2 people, got %d", len(org.People))
	}
	if org.People[0].Name != "Alice" {
		t.Errorf("expected Alice, got %s", org.People[0].Name)
	}
}

func TestBuildPeopleWithMapping_ExtraColumns(t *testing.T) {
	t.Parallel()
	header := []string{"Full Name", "Job Title", "Dept", "CostCenter", "Location"}
	rows := [][]string{
		{"Alice", "VP", "Engineering", "CC001", "NYC"},
		{"Bob", "Engineer", "Platform", "CC002", ""},
	}
	mapping := map[string]string{
		"name": "Full Name", "role": "Job Title", "team": "Dept",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Fatalf("expected 2 people, got %d", len(org.People))
	}

	// Alice should have both extra columns
	if org.People[0].Extra == nil {
		t.Fatal("expected Extra map for Alice, got nil")
	}
	if org.People[0].Extra["CostCenter"] != "CC001" {
		t.Errorf("expected CostCenter=CC001, got %q", org.People[0].Extra["CostCenter"])
	}
	if org.People[0].Extra["Location"] != "NYC" {
		t.Errorf("expected Location=NYC, got %q", org.People[0].Extra["Location"])
	}

	// Bob should have CostCenter but not Location (empty values are skipped)
	if org.People[1].Extra == nil {
		t.Fatal("expected Extra map for Bob, got nil")
	}
	if org.People[1].Extra["CostCenter"] != "CC002" {
		t.Errorf("expected CostCenter=CC002, got %q", org.People[1].Extra["CostCenter"])
	}
	if _, ok := org.People[1].Extra["Location"]; ok {
		t.Error("expected Location to be absent for Bob (empty value)")
	}
}

// Scenarios: CONTRACT-009, PROD-006
func TestBuildPeopleWithMapping_ProductRows(t *testing.T) {
	t.Parallel()
	header := []string{"Name", "Type", "Status", "Manager"}
	rows := [][]string{
		{"Alice", "person", "Active", ""},
		{"Widget", "product", "Active", "Alice"},
		{"Bob", "", "Active", "Alice"},
	}
	mapping := map[string]string{
		"name": "Name", "type": "Type", "status": "Status", "manager": "Manager",
	}
	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 3 {
		t.Fatalf("expected 3 people, got %d", len(org.People))
	}
	if org.People[0].Type != "person" {
		t.Errorf("expected Alice type 'person', got '%s'", org.People[0].Type)
	}
	if org.People[1].Type != "product" {
		t.Errorf("expected Widget type 'product', got '%s'", org.People[1].Type)
	}
	if org.People[2].Type != "" {
		t.Errorf("expected Bob type '' (empty), got '%s'", org.People[2].Type)
	}
}

func TestBuildPeopleWithMapping_NoExtraColumns(t *testing.T) {
	t.Parallel()
	header := []string{"Full Name", "Job Title"}
	rows := [][]string{{"Alice", "VP"}}
	mapping := map[string]string{
		"name": "Full Name", "role": "Job Title",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.People[0].Extra != nil {
		t.Errorf("expected nil Extra when all columns mapped, got %v", org.People[0].Extra)
	}
}

func TestBuildPeopleWithMapping_SpacePaddedHeaders(t *testing.T) {
	t.Parallel()
	// Simulates CSVs with "Name, Role, Level, Manager" (space after comma)
	header := []string{"Name", " Role", " Level", " Manager", " Notes"}
	rows := [][]string{
		{"Alice", "VP", "29", "Bob", "some note"},
	}
	mapping := map[string]string{
		"name": "Role", "role": " Role", "level": " Level", "manager": " Manager",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.People[0].Role != "VP" {
		t.Errorf("expected role VP, got %s", org.People[0].Role)
	}
	if org.People[0].Level != 29 {
		t.Errorf("expected level 29, got %d", org.People[0].Level)
	}
}

func TestBuildPeopleWithMapping_EmptyStatusDefaultsToActive(t *testing.T) {
	t.Parallel()
	header := []string{"Name", "Role", "Status"}
	rows := [][]string{
		{"Alice", "VP", ""},       // explicit empty
		{"Bob", "Engineer", "Open"},
	}
	mapping := map[string]string{"name": "Name", "role": "Role", "status": "Status"}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.People[0].Status != "Active" {
		t.Errorf("expected Alice status 'Active', got %q", org.People[0].Status)
	}
	if org.People[1].Status != "Open" {
		t.Errorf("expected Bob status 'Open', got %q", org.People[1].Status)
	}
}

func TestBuildPeopleWithMapping_NoStatusColumnDefaultsToActive(t *testing.T) {
	t.Parallel()
	header := []string{"Name"}
	rows := [][]string{{"Alice"}, {"Bob"}}
	mapping := map[string]string{"name": "Name"}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, p := range org.People {
		if p.Status != "Active" {
			t.Errorf("person %q: expected status 'Active', got %q", p.Name, p.Status)
		}
	}
}
