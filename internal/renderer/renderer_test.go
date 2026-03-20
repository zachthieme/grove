package renderer

import (
	"strings"
	"testing"

	"github.com/zach/orgchart/internal/views"
)

func TestRender_Empty(t *testing.T) {
	vm := views.ViewModel{}
	result := Render(vm)
	if !strings.HasPrefix(result, "flowchart TD") {
		t.Errorf("expected flowchart TD prefix, got: %s", result)
	}
}

func TestRender_SubgraphsAndEdges(t *testing.T) {
	vm := views.ViewModel{
		Subgraphs: []views.Subgraph{
			{
				Label: "Platform",
				Nodes: []views.Node{
					{ID: "alice", Label: `Alice<br/><i>Engineer</i>`},
					{ID: "bob", Label: `Bob<br/><i>Engineer</i>`},
				},
			},
		},
		FreeNodes: []views.Node{
			{ID: "mike", Label: `Mike<br/><i>VP</i>`},
		},
		Edges: []views.Edge{
			{From: "mike", To: "alice", Dotted: false},
			{From: "tpm", To: "alice", Dotted: true},
		},
		ClassDefs: []string{
			"classDef hiring stroke-dasharray: 5 5, stroke: #60a5fa",
		},
	}

	result := Render(vm)

	checks := []string{
		"flowchart TD",
		"subgraph Platform",
		`alice["Alice<br/><i>Engineer</i>"]`,
		"end",
		`mike["Mike<br/><i>VP</i>"]`,
		"mike --> alice",
		"tpm -.-> alice",
		"classDef hiring",
	}
	for _, check := range checks {
		if !strings.Contains(result, check) {
			t.Errorf("expected output to contain %q\nGot:\n%s", check, result)
		}
	}
}

func TestRender_NodeWithClass(t *testing.T) {
	vm := views.ViewModel{
		FreeNodes: []views.Node{
			{ID: "open_1", Label: "Open - Engineer", Class: "hiring"},
		},
	}
	result := Render(vm)
	if !strings.Contains(result, `open_1["Open - Engineer"]:::hiring`) {
		t.Errorf("expected node with class, got:\n%s", result)
	}
}
