package api

import (
	"testing"

	"github.com/zachthieme/grove/internal/model"
)

// Scenarios: EXPORT-005
func TestConvertOrg_AssignsIDs(t *testing.T) {
	t.Parallel()
	people := []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "Active"}},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Role: "Engineer", Discipline: "Eng", Team: "Platform", Status: "Active"}, Manager: "Alice"},
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

// Scenarios: EXPORT-005
func TestConvertOrg_PreservesFields(t *testing.T) {
	t.Parallel()
	people := []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Eve", Role: "TPM", Discipline: "TPM", Team: "Platform",
			AdditionalTeams: []string{"Search", "Infra"}, Status: "Active",
			NewRole: "Sr TPM", NewTeam: "Infra"}},
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

func findByName(people []OrgNode, name string) *OrgNode {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}

func TestConvertOrg_PreservesExtra(t *testing.T) {
	t.Parallel()
	org := &model.Org{
		People: []model.OrgNode{
			{
				OrgNodeFields: model.OrgNodeFields{
					Name: "Alice", Role: "VP", Discipline: "Eng", Team: "T", Status: "Active",
					Extra: map[string]string{"CostCenter": "CC001", "Location": "NYC"},
				},
			},
			{
				OrgNodeFields: model.OrgNodeFields{
					Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active",
				},
			},
		},
	}

	people := ConvertOrg(org)
	if len(people) != 2 {
		t.Fatalf("expected 2 people, got %d", len(people))
	}

	if people[0].Extra == nil {
		t.Fatal("expected Extra on Alice, got nil")
	}
	if people[0].Extra["CostCenter"] != "CC001" {
		t.Errorf("expected CostCenter=CC001, got %q", people[0].Extra["CostCenter"])
	}
	if people[0].Extra["Location"] != "NYC" {
		t.Errorf("expected Location=NYC, got %q", people[0].Extra["Location"])
	}

	if people[1].Extra != nil {
		t.Errorf("expected nil Extra on Bob, got %v", people[1].Extra)
	}
}
