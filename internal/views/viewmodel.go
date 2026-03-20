package views

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
