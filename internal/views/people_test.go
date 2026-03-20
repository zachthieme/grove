package views

import (
	"testing"

	"github.com/zach/orgchart/internal/model"
)

func testOrg(t *testing.T, people []model.Person) *model.Org {
	t.Helper()
	org, err := model.NewOrg(people)
	if err != nil {
		t.Fatalf("failed to create org: %v", err)
	}
	return org
}

func TestPeopleView_SimpleOrg(t *testing.T) {
	org := testOrg(t, []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Engineering", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Bob", Role: "Engineer", Discipline: "Engineering", Manager: "Alice", Team: "Platform", Status: "Active"},
	})

	vm := PeopleView(org)

	// Alice is root → FreeNode, Bob in Platform subgraph
	if len(vm.Subgraphs) != 1 {
		t.Errorf("expected 1 subgraph (Platform), got %d", len(vm.Subgraphs))
	}
	if len(vm.FreeNodes) != 1 {
		t.Errorf("expected 1 free node (Alice), got %d", len(vm.FreeNodes))
	}

	found := false
	for _, e := range vm.Edges {
		if e.From != "" && e.To != "" && !e.Dotted {
			found = true
		}
	}
	if !found {
		t.Error("expected at least one solid reporting edge")
	}
}

func TestPeopleView_CrossTeam(t *testing.T) {
	org := testOrg(t, []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Eve", Role: "TPM", Discipline: "TPM", Manager: "Alice", Team: "Platform", AdditionalTeams: []string{"Search"}, Status: "Active"},
		{Name: "Bob", Role: "Lead", Discipline: "Eng", Manager: "Alice", Team: "Search", Status: "Active"},
	})

	vm := PeopleView(org)

	dottedFound := false
	for _, e := range vm.Edges {
		if e.Dotted {
			dottedFound = true
		}
	}
	if !dottedFound {
		t.Error("expected dotted edge for cross-team ownership")
	}
}

func TestPeopleView_HiringNode(t *testing.T) {
	org := testOrg(t, []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Open - Sr Eng", Role: "Sr Engineer", Discipline: "Eng", Manager: "Alice", Team: "Eng", Status: "Hiring"},
	})

	vm := PeopleView(org)

	hasClassDef := false
	for _, cd := range vm.ClassDefs {
		if cd != "" {
			hasClassDef = true
		}
	}
	if !hasClassDef {
		t.Error("expected hiring classDef")
	}

	hiringFound := false
	for _, sg := range vm.Subgraphs {
		for _, n := range sg.Nodes {
			if n.Class == "hiring" {
				hiringFound = true
			}
		}
	}
	if !hiringFound {
		t.Error("expected a node with 'hiring' class")
	}
}
