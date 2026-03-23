package api

import (
	"testing"

	"github.com/zachthieme/grove/internal/model"
)

func TestConvertOrg_AssignsIDs(t *testing.T) {
	people := []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Bob", Role: "Engineer", Discipline: "Eng", Manager: "Alice", Team: "Platform", Status: "Active"},
	}
	org, err := model.NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result := ConvertOrg(org)

	if len(result) != 2 {
		t.Fatalf("expected 2 people, got %d", len(result))
	}

	alice := findByName(result, "Alice")
	bob := findByName(result, "Bob")

	if alice == nil || bob == nil {
		t.Fatal("expected to find Alice and Bob")
	}
	if alice.Id == "" {
		t.Error("expected Alice to have an ID")
	}
	if bob.Id == "" {
		t.Error("expected Bob to have an ID")
	}
	if alice.Id == bob.Id {
		t.Error("expected unique IDs")
	}
	if bob.ManagerId != alice.Id {
		t.Errorf("expected Bob's ManagerId to be Alice's ID (%s), got %s", alice.Id, bob.ManagerId)
	}
	if alice.ManagerId != "" {
		t.Errorf("expected Alice's ManagerId to be empty, got %s", alice.ManagerId)
	}
}

func TestConvertOrg_PreservesFields(t *testing.T) {
	people := []model.Person{
		{Name: "Eve", Role: "TPM", Discipline: "TPM", Manager: "", Team: "Platform",
			AdditionalTeams: []string{"Search", "Infra"}, Status: "Active",
			NewRole: "Sr TPM", NewTeam: "Infra"},
	}
	org, err := model.NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result := ConvertOrg(org)
	eve := result[0]

	if eve.Role != "TPM" {
		t.Errorf("expected Role 'TPM', got '%s'", eve.Role)
	}
	if eve.Team != "Platform" {
		t.Errorf("expected Team 'Platform', got '%s'", eve.Team)
	}
	if len(eve.AdditionalTeams) != 2 {
		t.Errorf("expected 2 additional teams, got %d", len(eve.AdditionalTeams))
	}
	if eve.NewRole != "Sr TPM" {
		t.Errorf("expected NewRole 'Sr TPM', got '%s'", eve.NewRole)
	}
	if eve.NewTeam != "Infra" {
		t.Errorf("expected NewTeam 'Infra', got '%s'", eve.NewTeam)
	}
}

func findByName(people []Person, name string) *Person {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}
