package parser

import (
	"testing"
)

func TestParseCSV_Simple(t *testing.T) {
	org, err := Parse("../../testdata/simple.csv")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 3 {
		t.Errorf("expected 3 people, got %d", len(org.People))
	}
	if org.ByName["Alice"] == nil {
		t.Error("expected Alice in org")
	}
	if org.ByName["Bob"].Manager != "Alice" {
		t.Errorf("expected Bob's manager to be Alice, got '%s'", org.ByName["Bob"].Manager)
	}
}

func TestParseCSV_CrossTeam(t *testing.T) {
	org, err := Parse("../../testdata/crossteam.csv")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	eve := org.ByName["Eve"]
	if eve == nil {
		t.Fatal("expected Eve in org")
	}
	if len(eve.AdditionalTeams) != 2 {
		t.Errorf("expected 2 additional teams, got %d", len(eve.AdditionalTeams))
	}
	if eve.AdditionalTeams[0] != "Search" {
		t.Errorf("expected first additional team to be Search, got '%s'", eve.AdditionalTeams[0])
	}

	open := org.ByName["Open - Sr Engineer"]
	if open == nil {
		t.Fatal("expected open position in org")
	}
	if open.Status != "Hiring" {
		t.Errorf("expected Hiring status, got '%s'", open.Status)
	}
}

func TestParse_UnsupportedExtension(t *testing.T) {
	_, err := Parse("file.json")
	if err == nil {
		t.Fatal("expected error for unsupported extension")
	}
}
