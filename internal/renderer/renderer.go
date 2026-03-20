package renderer

import (
	"fmt"
	"strings"

	"github.com/zach/orgchart/internal/views"
)

func Render(vm views.ViewModel) string {
	var b strings.Builder
	b.WriteString("flowchart TD\n")

	for _, sg := range vm.Subgraphs {
		fmt.Fprintf(&b, "    subgraph %s\n", sg.Label)
		for _, n := range sg.Nodes {
			b.WriteString("        ")
			writeNode(&b, n)
			b.WriteString("\n")
		}
		b.WriteString("    end\n")
	}

	for _, n := range vm.FreeNodes {
		b.WriteString("    ")
		writeNode(&b, n)
		b.WriteString("\n")
	}

	for _, e := range vm.Edges {
		if e.Dotted {
			fmt.Fprintf(&b, "    %s -.-> %s\n", e.From, e.To)
		} else {
			fmt.Fprintf(&b, "    %s --> %s\n", e.From, e.To)
		}
	}

	for _, cd := range vm.ClassDefs {
		fmt.Fprintf(&b, "    %s\n", cd)
	}

	return b.String()
}

func writeNode(b *strings.Builder, n views.Node) {
	fmt.Fprintf(b, `%s["%s"]`, n.ID, n.Label)
	if n.Class != "" {
		fmt.Fprintf(b, ":::%s", n.Class)
	}
}
