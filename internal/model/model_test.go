package model

import (
	"testing"
)

func TestNewOrg_ValidPeople(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Engineering", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Bob", Role: "Engineer", Discipline: "Engineering", Manager: "Alice", Team: "Platform", Status: "Active"},
	}

	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(org.People) != 2 {
		t.Errorf("expected 2 people, got %d", len(org.People))
	}
	if org.ByName["Alice"] == nil {
		t.Error("expected Alice in ByName")
	}
	if len(org.ByTeam["Platform"]) != 1 {
		t.Errorf("expected 1 person on Platform, got %d", len(org.ByTeam["Platform"]))
	}
	if len(org.ByManager["Alice"]) != 1 {
		t.Errorf("expected 1 report for Alice, got %d", len(org.ByManager["Alice"]))
	}
	if len(org.Roots) != 1 {
		t.Errorf("expected 1 root, got %d", len(org.Roots))
	}
	if org.Roots[0].Name != "Alice" {
		t.Errorf("expected root to be Alice, got %s", org.Roots[0].Name)
	}
}
