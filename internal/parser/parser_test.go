package parser

import (
	"testing"
)

func TestBuildPeopleWithMapping(t *testing.T) {
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

func TestBuildPeopleWithMapping_MissingRequired(t *testing.T) {
	header := []string{"Full Name", "Job Title"}
	rows := [][]string{{"Alice", "VP"}}
	mapping := map[string]string{"name": "Full Name", "role": "Job Title"}

	_, err := BuildPeopleWithMapping(header, rows, mapping)
	if err == nil {
		t.Fatal("expected error for missing required fields")
	}
}
