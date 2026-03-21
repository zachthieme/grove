package views

const (
	classHiring    = "hiring"
	classDefHiring = "classDef hiring stroke-dasharray: 5 5, stroke: #60a5fa"
)

type Node struct {
	ID    string
	Label string
	Class string
}

type Edge struct {
	From   string
	To     string
	Dotted bool
}

type Subgraph struct {
	Label string
	Nodes []Node
}

type ViewModel struct {
	Subgraphs []Subgraph
	FreeNodes []Node
	Edges     []Edge
	ClassDefs []string
}
