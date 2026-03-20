package views

import (
	"strings"
	"testing"

	"github.com/zach/orgchart/internal/model"
)

func TestHeadcountView_Counts(t *testing.T) {
	org := testOrg(t, []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Engineering", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Bob", Role: "Eng", Discipline: "Engineering", Manager: "Alice", Team: "Platform", Status: "Active"},
		{Name: "Carol", Role: "Eng", Discipline: "Engineering", Manager: "Alice", Team: "Platform", Status: "Active"},
		{Name: "Dave", Role: "Designer", Discipline: "Design", Manager: "Alice", Team: "Platform", Status: "Active"},
	})

	vm := HeadcountView(org)

	var platformSG *Subgraph
	for i, sg := range vm.Subgraphs {
		if sg.Label == "Platform" {
			platformSG = &vm.Subgraphs[i]
			break
		}
	}
	if platformSG == nil {
		t.Fatal("expected Platform subgraph")
	}

	foundEng := false
	foundDesign := false
	for _, n := range platformSG.Nodes {
		if strings.Contains(n.Label, "Engineering: 2") {
			foundEng = true
		}
		if strings.Contains(n.Label, "Design: 1") {
			foundDesign = true
		}
	}
	if !foundEng {
		t.Error("expected 'Engineering: 2' node in Platform")
	}
	if !foundDesign {
		t.Error("expected 'Design: 1' node in Platform")
	}
}

func TestHeadcountView_HiringCount(t *testing.T) {
	org := testOrg(t, []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Open - Eng 1", Role: "Engineer", Discipline: "Engineering", Manager: "Alice", Team: "Eng", Status: "Hiring"},
		{Name: "Open - Eng 2", Role: "Engineer", Discipline: "Engineering", Manager: "Alice", Team: "Eng", Status: "Open"},
	})

	vm := HeadcountView(org)

	hiringFound := false
	for _, sg := range vm.Subgraphs {
		for _, n := range sg.Nodes {
			if n.Class == "hiring" {
				hiringFound = true
			}
		}
	}
	if !hiringFound {
		t.Error("expected hiring node")
	}
}

func TestHeadcountView_CrossTeamSection(t *testing.T) {
	org := testOrg(t, []model.Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Eve", Role: "TPM", Discipline: "TPM", Manager: "Alice", Team: "Platform", AdditionalTeams: []string{"Search"}, Status: "Active"},
		{Name: "Bob", Role: "Eng", Discipline: "Eng", Manager: "Alice", Team: "Search", Status: "Active"},
	})

	vm := HeadcountView(org)

	crossTeamFound := false
	for _, sg := range vm.Subgraphs {
		if sg.Label == "Cross-Team" {
			crossTeamFound = true
			if len(sg.Nodes) != 1 {
				t.Errorf("expected 1 cross-team node, got %d", len(sg.Nodes))
			}
		}
	}
	if !crossTeamFound {
		t.Error("expected Cross-Team subgraph")
	}
}
