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

func TestNewOrg_DuplicateName(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Alice", Role: "PM", Discipline: "PM", Manager: "", Team: "PM", Status: "Active"},
	}
	_, err := NewOrg(people)
	if err == nil {
		t.Fatal("expected error for duplicate name")
	}
}

func TestNewOrg_DanglingManager(t *testing.T) {
	people := []Person{
		{Name: "Bob", Role: "Eng", Discipline: "Eng", Manager: "Nobody", Team: "Eng", Status: "Active"},
	}
	_, err := NewOrg(people)
	if err == nil {
		t.Fatal("expected error for dangling manager ref")
	}
}

func TestNewOrg_CircularReporting(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "Bob", Team: "Eng", Status: "Active"},
		{Name: "Bob", Role: "Dir", Discipline: "Eng", Manager: "Alice", Team: "Eng", Status: "Active"},
	}
	_, err := NewOrg(people)
	if err == nil {
		t.Fatal("expected error for circular reporting")
	}
}

func TestNewOrg_InvalidStatus(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "TBD"},
	}
	_, err := NewOrg(people)
	if err == nil {
		t.Fatal("expected error for invalid status")
	}
}

func TestNewOrg_MissingRequiredField(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
	}
	_, err := NewOrg(people)
	if err == nil {
		t.Fatal("expected error for missing Role")
	}
}

func TestApplyPlanned_SwapsFields(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "Engineer", Discipline: "Eng", Manager: "", Team: "Platform", Status: "Active", NewRole: "Senior Engineer", NewTeam: "Search"},
		{Name: "Bob", Role: "PM", Discipline: "PM", Manager: "Alice", Team: "Platform", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	planned, err := ApplyPlanned(org)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	alice := planned.ByName["Alice"]
	if alice.Role != "Senior Engineer" {
		t.Errorf("expected Alice role 'Senior Engineer', got '%s'", alice.Role)
	}
	if alice.Team != "Search" {
		t.Errorf("expected Alice team 'Search', got '%s'", alice.Team)
	}

	bob := planned.ByName["Bob"]
	if bob.Role != "PM" {
		t.Errorf("expected Bob role unchanged 'PM', got '%s'", bob.Role)
	}
}

func TestNewOrg_TransferAllowsBlankRoleAndDiscipline(t *testing.T) {
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Incoming", Role: "", Discipline: "", Manager: "Alice", Team: "Eng", Status: "Transfer"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Errorf("expected 2 people, got %d", len(org.People))
	}
}

func TestNodeID_Simple(t *testing.T) {
	ids := NewIDGenerator()
	id := ids.ID("Jane Smith")
	if id != "jane_smith" {
		t.Errorf("expected 'jane_smith', got '%s'", id)
	}
}

func TestNodeID_SpecialChars(t *testing.T) {
	ids := NewIDGenerator()
	id := ids.ID("O'Brien-Jones")
	if id != "obrienjones" {
		t.Errorf("expected 'obrienjones', got '%s'", id)
	}
}

func TestNodeID_Collision(t *testing.T) {
	ids := NewIDGenerator()
	id1 := ids.ID("Jane Smith")
	id2 := ids.ID("Jane  Smith")
	if id1 == id2 {
		t.Error("expected different IDs for colliding names")
	}
	if id2 != "jane_smith_2" {
		t.Errorf("expected 'jane_smith_2', got '%s'", id2)
	}
}

func TestNodeID_OpenHiring(t *testing.T) {
	ids := NewIDGenerator()
	id1 := ids.OpenID()
	id2 := ids.OpenID()
	if id1 != "open_1" {
		t.Errorf("expected 'open_1', got '%s'", id1)
	}
	if id2 != "open_2" {
		t.Errorf("expected 'open_2', got '%s'", id2)
	}
}
