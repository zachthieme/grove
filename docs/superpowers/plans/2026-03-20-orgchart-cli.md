# Orgchart CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Go CLI that reads spreadsheets and outputs mermaid org chart diagrams with people and headcount views.

**Architecture:** Pipeline: CLI (cobra) → parser (csv/xlsx) → model (Org) → views (people/headcount) → renderer (mermaid string) → output (stdout/file). Each stage is a separate package under `internal/`.

**Tech Stack:** Go 1.25, cobra (CLI), excelize (xlsx), stdlib encoding/csv

**Spec:** `docs/superpowers/specs/2026-03-20-orgchart-cli-design.md`

---

## File Structure

```
orgchart/
├── main.go                          # Entry point, calls cmd.Execute()
├── go.mod
├── cmd/
│   ├── root.go                      # Cobra root command, version info
│   ├── people.go                    # "people" subcommand
│   └── headcount.go                 # "headcount" subcommand
├── internal/
│   ├── model/
│   │   ├── model.go                 # Person, Org structs, NewOrg(), NodeID()
│   │   └── model_test.go           # Validation, lookups, ID generation tests
│   ├── parser/
│   │   ├── parser.go                # Parse() dispatches to CSV or XLSX by extension
│   │   ├── csv.go                   # parseCSV() implementation
│   │   ├── xlsx.go                  # parseXLSX() implementation
│   │   └── parser_test.go          # Parser tests using testdata/
│   ├── views/
│   │   ├── viewmodel.go            # Node, Edge, Subgraph, ViewModel types
│   │   ├── people.go               # PeopleView(*Org) → ViewModel
│   │   ├── people_test.go
│   │   ├── headcount.go            # HeadcountView(*Org) → ViewModel
│   │   └── headcount_test.go
│   └── renderer/
│       ├── renderer.go             # Render(ViewModel) → string
│       └── renderer_test.go
└── testdata/
    ├── simple.csv                   # Basic org for testing
    └── crossteam.csv               # Org with cross-team, hiring, multiple roots
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `go.mod`, `main.go`, `cmd/root.go`

- [ ] **Step 1: Initialize Go module**

```bash
cd /home/zach/code/orgs
go mod init github.com/zach/orgchart
```

- [ ] **Step 2: Create main.go**

```go
package main

import "github.com/zach/orgchart/cmd"

func main() {
	cmd.Execute()
}
```

- [ ] **Step 3: Create cmd/root.go**

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "orgchart",
	Short: "Generate mermaid org charts from spreadsheets",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

- [ ] **Step 4: Install cobra dependency and verify it compiles**

```bash
go get github.com/spf13/cobra
go build ./...
```

Expected: no errors, binary compiles.

- [ ] **Step 5: Commit**

```bash
git add main.go go.mod go.sum cmd/
git commit -m "scaffold: init Go module with cobra root command"
```

---

### Task 2: Data Model — Person and Org Structs

**Files:**
- Create: `internal/model/model.go`, `internal/model/model_test.go`

- [ ] **Step 1: Write failing test — NewOrg builds correct lookups**

Create `internal/model/model_test.go`:

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/model/ -v
```

Expected: FAIL — `NewOrg` not defined.

- [ ] **Step 3: Implement Person, Org, and NewOrg**

Create `internal/model/model.go`:

```go
package model

import "fmt"

type Person struct {
	Name            string
	Role            string
	Discipline      string
	Manager         string
	Team            string
	AdditionalTeams []string
	Status          string
}

type Org struct {
	People    []Person
	ByName    map[string]*Person
	ByTeam    map[string][]*Person
	ByManager map[string][]*Person
	Roots     []*Person
}

func NewOrg(people []Person) (*Org, error) {
	org := &Org{
		People:    people,
		ByName:    make(map[string]*Person),
		ByTeam:    make(map[string][]*Person),
		ByManager: make(map[string][]*Person),
	}

	// Index by name
	for i := range org.People {
		p := &org.People[i]
		if _, exists := org.ByName[p.Name]; exists {
			return nil, fmt.Errorf("duplicate name '%s'", p.Name)
		}
		org.ByName[p.Name] = p
	}

	// Build team and manager indexes, validate refs
	for i := range org.People {
		p := &org.People[i]
		org.ByTeam[p.Team] = append(org.ByTeam[p.Team], p)

		if p.Manager == "" {
			org.Roots = append(org.Roots, p)
		} else {
			if _, exists := org.ByName[p.Manager]; !exists {
				return nil, fmt.Errorf("manager '%s' not found (referenced by '%s')", p.Manager, p.Name)
			}
			org.ByManager[p.Manager] = append(org.ByManager[p.Manager], p)
		}
	}

	return org, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
go test ./internal/model/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/model/
git commit -m "feat: add Person/Org data model with NewOrg constructor"
```

---

### Task 3: Data Model — Validation

**Files:**
- Modify: `internal/model/model.go`
- Modify: `internal/model/model_test.go`

- [ ] **Step 1: Write failing tests for validation cases**

Append to `internal/model/model_test.go`:

```go
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
```

- [ ] **Step 2: Run tests to verify failures**

```bash
go test ./internal/model/ -v -run "Circular|InvalidStatus|MissingRequired"
```

Expected: FAIL — circular detection, status validation, and required field checks not yet implemented.

- [ ] **Step 3: Add validation to NewOrg**

Add these checks to `NewOrg` in `internal/model/model.go`, after the existing logic:

1. **Required field validation** — check before indexing:

```go
// At the start of NewOrg, before indexing
validStatuses := map[string]bool{"Active": true, "Hiring": true, "Open": true}
for i, p := range people {
	row := i + 2 // 1-indexed, skip header
	if p.Name == "" {
		return nil, fmt.Errorf("row %d: missing 'Name'", row)
	}
	if p.Role == "" {
		return nil, fmt.Errorf("row %d: missing 'Role'", row)
	}
	if p.Discipline == "" {
		return nil, fmt.Errorf("row %d: missing 'Discipline'", row)
	}
	if p.Team == "" {
		return nil, fmt.Errorf("row %d: missing 'Team'", row)
	}
	if p.Status == "" {
		return nil, fmt.Errorf("row %d: missing 'Status'", row)
	}
	if !validStatuses[p.Status] {
		return nil, fmt.Errorf("row %d: status must be Active, Hiring, or Open (got '%s')", row, p.Status)
	}
}
```

2. **Circular detection** — add after building all indexes:

```go
// Detect circular reporting
for i := range org.People {
	p := &org.People[i]
	if p.Manager == "" {
		continue
	}
	visited := map[string]bool{p.Name: true}
	current := p.Manager
	for current != "" {
		if visited[current] {
			return nil, fmt.Errorf("circular reporting chain detected involving '%s'", current)
		}
		visited[current] = true
		mgr := org.ByName[current]
		current = mgr.Manager
	}
}
```

- [ ] **Step 4: Run all model tests**

```bash
go test ./internal/model/ -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/model/
git commit -m "feat: add validation — required fields, status, duplicates, cycles"
```

---

### Task 4: Node ID Generation

**Files:**
- Modify: `internal/model/model.go`
- Modify: `internal/model/model_test.go`

- [ ] **Step 1: Write failing tests for NodeID**

Append to `internal/model/model_test.go`:

```go
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
	id2 := ids.ID("Jane  Smith") // double space, same after normalization
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/model/ -v -run "NodeID|OpenID"
```

Expected: FAIL — `NewIDGenerator` not defined.

- [ ] **Step 3: Implement IDGenerator**

Add to `internal/model/model.go`:

```go
import (
	"regexp"
	"strings"
)

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9_]`)

type IDGenerator struct {
	seen    map[string]int
	openSeq int
}

func NewIDGenerator() *IDGenerator {
	return &IDGenerator{seen: make(map[string]int)}
}

func (g *IDGenerator) ID(name string) string {
	base := strings.ToLower(name)
	base = strings.ReplaceAll(base, " ", "_")
	base = nonAlphaNum.ReplaceAllString(base, "")
	// collapse multiple underscores
	for strings.Contains(base, "__") {
		base = strings.ReplaceAll(base, "__", "_")
	}
	base = strings.Trim(base, "_")

	g.seen[base]++
	if g.seen[base] == 1 {
		return base
	}
	return fmt.Sprintf("%s_%d", base, g.seen[base])
}

func (g *IDGenerator) OpenID() string {
	g.openSeq++
	return fmt.Sprintf("open_%d", g.openSeq)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/model/ -v -run "NodeID|OpenID"
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/model/
git commit -m "feat: add node ID generation with collision handling"
```

---

### Task 5: CSV Parser

**Files:**
- Create: `internal/parser/parser.go`, `internal/parser/csv.go`, `internal/parser/parser_test.go`
- Create: `testdata/simple.csv`, `testdata/crossteam.csv`

- [ ] **Step 1: Create test fixture files**

Create `testdata/simple.csv`:

```csv
Name,Role,Discipline,Manager,Team,Additional Teams,Status
Alice,VP Engineering,Engineering,,Eng,,Active
Bob,Senior Engineer,Engineering,Alice,Platform,,Active
Carol,Engineer,Engineering,Bob,Platform,,Active
```

Create `testdata/crossteam.csv`:

```csv
Name,Role,Discipline,Manager,Team,Additional Teams,Status
Alice,VP Engineering,Engineering,,Eng,,Active
Bob,Tech Lead,Engineering,Alice,Platform,,Active
Carol,Engineer,Engineering,Bob,Platform,,Active
Dave,Tech Lead,Engineering,Alice,Search,,Active
Eve,TPM,TPM,Alice,Platform,"Search,Infra",Active
Open - Sr Engineer,Sr Engineer,Engineering,Bob,Platform,,Hiring
```

- [ ] **Step 2: Write failing test for CSV parsing**

Create `internal/parser/parser_test.go`:

```go
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
go test ./internal/parser/ -v
```

Expected: FAIL — `Parse` not defined.

- [ ] **Step 4: Implement parser**

Create `internal/parser/parser.go`:

```go
package parser

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func Parse(path string) (*model.Org, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv":
		return parseCSV(path)
	case ".xlsx":
		return parseXLSX(path)
	default:
		return nil, fmt.Errorf("unsupported file format '%s' (expected .csv or .xlsx)", ext)
	}
}
```

Create `internal/parser/csv.go`:

```go
package parser

import (
	"encoding/csv"
	"fmt"
	"os"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func parseCSV(path string) (*model.Org, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("reading CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV file must have a header row and at least one data row")
	}

	// Parse header to find column indexes
	header := records[0]
	cols := make(map[string]int)
	for i, h := range header {
		cols[strings.TrimSpace(strings.ToLower(h))] = i
	}

	required := []string{"name", "role", "discipline", "team", "status"}
	for _, r := range required {
		if _, ok := cols[r]; !ok {
			return nil, fmt.Errorf("missing required column '%s' in header", r)
		}
	}

	var people []model.Person
	for _, row := range records[1:] {
		p := model.Person{
			Name:       strings.TrimSpace(row[cols["name"]]),
			Role:       strings.TrimSpace(row[cols["role"]]),
			Discipline: strings.TrimSpace(row[cols["discipline"]]),
			Team:       strings.TrimSpace(row[cols["team"]]),
			Status:     strings.TrimSpace(row[cols["status"]]),
		}

		if idx, ok := cols["manager"]; ok && idx < len(row) {
			p.Manager = strings.TrimSpace(row[idx])
		}

		if idx, ok := cols["additional teams"]; ok && idx < len(row) {
			raw := strings.TrimSpace(row[idx])
			if raw != "" {
				for _, t := range strings.Split(raw, ",") {
					t = strings.TrimSpace(t)
					if t != "" {
						p.AdditionalTeams = append(p.AdditionalTeams, t)
					}
				}
			}
		}

		people = append(people, p)
	}

	return model.NewOrg(people)
}
```

Create `internal/parser/xlsx.go` (stub for now — full implementation in Task 8):

```go
package parser

import (
	"fmt"

	"github.com/zach/orgchart/internal/model"
)

func parseXLSX(path string) (*model.Org, error) {
	return nil, fmt.Errorf("xlsx parsing not yet implemented")
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
go test ./internal/parser/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/parser/ testdata/
git commit -m "feat: add CSV parser with column detection"
```

---

### Task 6: View Model Types and Mermaid Renderer

**Files:**
- Create: `internal/views/viewmodel.go`
- Create: `internal/renderer/renderer.go`, `internal/renderer/renderer_test.go`

- [ ] **Step 1: Create view model types**

Create `internal/views/viewmodel.go`:

```go
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
```

- [ ] **Step 2: Write failing test for renderer**

Create `internal/renderer/renderer_test.go`:

```go
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
go test ./internal/renderer/ -v
```

Expected: FAIL — `Render` not defined.

- [ ] **Step 4: Implement renderer**

Create `internal/renderer/renderer.go`:

```go
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
go test ./internal/renderer/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/views/viewmodel.go internal/renderer/
git commit -m "feat: add view model types and mermaid renderer"
```

---

### Task 7: People View

**Files:**
- Create: `internal/views/people.go`, `internal/views/people_test.go`

- [ ] **Step 1: Write failing test — simple org**

Create `internal/views/people_test.go`:

```go
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

	// Should have 2 subgraphs (Eng, Platform)
	if len(vm.Subgraphs) != 2 {
		t.Errorf("expected 2 subgraphs, got %d", len(vm.Subgraphs))
	}

	// Should have reporting edge Alice -> Bob
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

	// Should have dotted edge for Eve's cross-team link to Search
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

	// Should have a hiring classDef
	hasClassDef := false
	for _, cd := range vm.ClassDefs {
		if cd != "" {
			hasClassDef = true
		}
	}
	if !hasClassDef {
		t.Error("expected hiring classDef")
	}

	// Should have a node with hiring class
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/views/ -v
```

Expected: FAIL — `PeopleView` not defined.

- [ ] **Step 3: Implement PeopleView**

Create `internal/views/people.go`:

```go
package views

import (
	"fmt"

	"github.com/zach/orgchart/internal/model"
)

func PeopleView(org *model.Org) ViewModel {
	ids := model.NewIDGenerator()
	vm := ViewModel{}

	// Map person name → node ID
	nameToID := make(map[string]string)
	hasHiring := false

	// Collect all teams (including additional teams)
	teamOrder := []string{}
	teamSet := make(map[string]bool)
	for i := range org.People {
		p := &org.People[i]
		if !teamSet[p.Team] {
			teamSet[p.Team] = true
			teamOrder = append(teamOrder, p.Team)
		}
		for _, at := range p.AdditionalTeams {
			if !teamSet[at] {
				teamSet[at] = true
				teamOrder = append(teamOrder, at)
			}
		}
	}

	// Generate IDs for everyone
	for i := range org.People {
		p := &org.People[i]
		if p.Status == "Hiring" || p.Status == "Open" {
			nameToID[p.Name] = ids.OpenID()
		} else {
			nameToID[p.Name] = ids.ID(p.Name)
		}
	}

	// Build subgraphs — one per team
	for _, team := range teamOrder {
		sg := Subgraph{Label: team}
		members := org.ByTeam[team]
		for _, p := range members {
			nodeClass := ""
			if p.Status == "Hiring" || p.Status == "Open" {
				nodeClass = "hiring"
				hasHiring = true
			}
			sg.Nodes = append(sg.Nodes, Node{
				ID:    nameToID[p.Name],
				Label: fmt.Sprintf("%s<br/><i>%s</i>", p.Name, p.Role),
				Class: nodeClass,
			})
		}
		if len(sg.Nodes) > 0 {
			vm.Subgraphs = append(vm.Subgraphs, sg)
		}
	}

	// Reporting edges
	for i := range org.People {
		p := &org.People[i]
		if p.Manager == "" {
			continue
		}
		vm.Edges = append(vm.Edges, Edge{
			From:   nameToID[p.Manager],
			To:     nameToID[p.Name],
			Dotted: false,
		})
	}

	// Cross-team dotted edges — link person to first node in target team subgraph
	for i := range org.People {
		p := &org.People[i]
		for _, at := range p.AdditionalTeams {
			targetMembers := org.ByTeam[at]
			if len(targetMembers) > 0 {
				vm.Edges = append(vm.Edges, Edge{
					From:   nameToID[p.Name],
					To:     nameToID[targetMembers[0].Name],
					Dotted: true,
				})
			}
		}
	}

	if hasHiring {
		vm.ClassDefs = append(vm.ClassDefs, "classDef hiring stroke-dasharray: 5 5, stroke: #60a5fa")
	}

	return vm
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/views/ -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/views/people.go internal/views/people_test.go
git commit -m "feat: add people view — names, roles, cross-team edges"
```

---

### Task 8: Headcount View

**Files:**
- Create: `internal/views/headcount.go`, `internal/views/headcount_test.go`

- [ ] **Step 1: Write failing tests**

Create `internal/views/headcount_test.go`:

```go
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

	// Platform subgraph should have Engineering: 2 and Design: 1
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

	// Should have hiring nodes
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/views/ -v -run "Headcount"
```

Expected: FAIL — `HeadcountView` not defined.

- [ ] **Step 3: Implement HeadcountView**

Create `internal/views/headcount.go`:

```go
package views

import (
	"fmt"
	"sort"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func HeadcountView(org *model.Org) ViewModel {
	vm := ViewModel{}
	hasHiring := false

	// Collect teams in order
	teamOrder := []string{}
	teamSet := make(map[string]bool)
	for i := range org.People {
		p := &org.People[i]
		if !teamSet[p.Team] {
			teamSet[p.Team] = true
			teamOrder = append(teamOrder, p.Team)
		}
	}

	// Track cross-team people
	var crossTeamPeople []*model.Person
	idCounter := 0

	for _, team := range teamOrder {
		members := org.ByTeam[team]

		// Count active by discipline
		activeCounts := make(map[string]int)
		hiringCount := 0

		for _, p := range members {
			if p.Status == "Active" {
				activeCounts[p.Discipline]++
			} else {
				hiringCount++
			}

			if len(p.AdditionalTeams) > 0 {
				// Check if already tracked
				alreadyTracked := false
				for _, ct := range crossTeamPeople {
					if ct.Name == p.Name {
						alreadyTracked = true
						break
					}
				}
				if !alreadyTracked {
					crossTeamPeople = append(crossTeamPeople, p)
				}
			}
		}

		sg := Subgraph{Label: team}

		// Sort disciplines for deterministic output
		disciplines := make([]string, 0, len(activeCounts))
		for d := range activeCounts {
			disciplines = append(disciplines, d)
		}
		sort.Strings(disciplines)

		for _, d := range disciplines {
			idCounter++
			sg.Nodes = append(sg.Nodes, Node{
				ID:    fmt.Sprintf("n_%d", idCounter),
				Label: fmt.Sprintf("%s: %d", d, activeCounts[d]),
			})
		}

		if hiringCount > 0 {
			hasHiring = true
			idCounter++
			sg.Nodes = append(sg.Nodes, Node{
				ID:    fmt.Sprintf("n_%d", idCounter),
				Label: fmt.Sprintf("Hiring: %d", hiringCount),
				Class: "hiring",
			})
		}

		if len(sg.Nodes) > 0 {
			vm.Subgraphs = append(vm.Subgraphs, sg)
		}
	}

	// Cross-team subgraph
	if len(crossTeamPeople) > 0 {
		sg := Subgraph{Label: "Cross-Team"}
		// Group by discipline
		discPeople := make(map[string][]*model.Person)
		for _, p := range crossTeamPeople {
			discPeople[p.Discipline] = append(discPeople[p.Discipline], p)
		}

		disciplines := make([]string, 0, len(discPeople))
		for d := range discPeople {
			disciplines = append(disciplines, d)
		}
		sort.Strings(disciplines)

		for _, d := range disciplines {
			people := discPeople[d]
			// Collect all teams these people span
			var allTeams []string
			teamsSeen := make(map[string]bool)
			for _, p := range people {
				if !teamsSeen[p.Team] {
					teamsSeen[p.Team] = true
					allTeams = append(allTeams, p.Team)
				}
				for _, at := range p.AdditionalTeams {
					if !teamsSeen[at] {
						teamsSeen[at] = true
						allTeams = append(allTeams, at)
					}
				}
			}
			idCounter++
			sg.Nodes = append(sg.Nodes, Node{
				ID:    fmt.Sprintf("n_%d", idCounter),
				Label: fmt.Sprintf("%s: %d<br/><i>%s</i>", d, len(people), strings.Join(allTeams, ", ")),
			})
		}
		vm.Subgraphs = append(vm.Subgraphs, sg)
	}

	if hasHiring {
		vm.ClassDefs = append(vm.ClassDefs, "classDef hiring stroke-dasharray: 5 5, stroke: #60a5fa")
	}

	return vm
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/views/ -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/views/headcount.go internal/views/headcount_test.go
git commit -m "feat: add headcount view — discipline counts per team"
```

---

### Task 9: XLSX Parser

**Files:**
- Modify: `internal/parser/xlsx.go`
- Modify: `internal/parser/parser_test.go`
- Create: `testdata/simple.xlsx` (generated programmatically in test)

- [ ] **Step 1: Install excelize dependency**

```bash
go get github.com/xuri/excelize/v2
```

- [ ] **Step 2: Write failing test for XLSX parsing**

Add a test helper that creates an xlsx file, then parses it. Append to `internal/parser/parser_test.go`:

```go
import (
	"os"
	"path/filepath"

	"github.com/xuri/excelize/v2"
)

func TestParseXLSX_Simple(t *testing.T) {
	// Create a temporary xlsx file
	dir := t.TempDir()
	path := filepath.Join(dir, "test.xlsx")

	f := excelize.NewFile()
	sheet := "Sheet1"
	headers := []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	row := []string{"Alice", "VP", "Engineering", "", "Eng", "", "Active"}
	for i, v := range row {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		f.SetCellValue(sheet, cell, v)
	}
	row2 := []string{"Bob", "Engineer", "Engineering", "Alice", "Platform", "", "Active"}
	for i, v := range row2 {
		cell, _ := excelize.CoordinatesToCellName(i+1, 3)
		f.SetCellValue(sheet, cell, v)
	}
	if err := f.SaveAs(path); err != nil {
		t.Fatalf("failed to create test xlsx: %v", err)
	}

	org, err := Parse(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Errorf("expected 2 people, got %d", len(org.People))
	}
	if org.ByName["Alice"] == nil {
		t.Error("expected Alice in org")
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
go test ./internal/parser/ -v -run "XLSX"
```

Expected: FAIL — "xlsx parsing not yet implemented".

- [ ] **Step 4: Implement parseXLSX**

Replace `internal/parser/xlsx.go`:

```go
package parser

import (
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
	"github.com/zach/orgchart/internal/model"
)

func parseXLSX(path string) (*model.Org, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, fmt.Errorf("opening xlsx: %w", err)
	}
	defer f.Close()

	// Use first sheet
	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("reading rows: %w", err)
	}

	if len(rows) < 2 {
		return nil, fmt.Errorf("xlsx must have a header row and at least one data row")
	}

	// Parse header
	header := rows[0]
	cols := make(map[string]int)
	for i, h := range header {
		cols[strings.TrimSpace(strings.ToLower(h))] = i
	}

	required := []string{"name", "role", "discipline", "team", "status"}
	for _, r := range required {
		if _, ok := cols[r]; !ok {
			return nil, fmt.Errorf("missing required column '%s' in header", r)
		}
	}

	var people []model.Person
	for _, row := range rows[1:] {
		get := func(col string) string {
			idx, ok := cols[col]
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		p := model.Person{
			Name:       get("name"),
			Role:       get("role"),
			Discipline: get("discipline"),
			Manager:    get("manager"),
			Team:       get("team"),
			Status:     get("status"),
		}

		raw := get("additional teams")
		if raw != "" {
			for _, t := range strings.Split(raw, ",") {
				t = strings.TrimSpace(t)
				if t != "" {
					p.AdditionalTeams = append(p.AdditionalTeams, t)
				}
			}
		}

		people = append(people, p)
	}

	return model.NewOrg(people)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
go test ./internal/parser/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/parser/ go.mod go.sum
git commit -m "feat: add XLSX parser using excelize"
```

---

### Task 10: CLI Commands — People and Headcount

**Files:**
- Create: `cmd/people.go`, `cmd/headcount.go`
- Modify: `main.go` (if needed)

- [ ] **Step 1: Implement shared run logic and people command**

Create `cmd/people.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/parser"
	"github.com/zach/orgchart/internal/renderer"
	"github.com/zach/orgchart/internal/views"
)

var peopleOutput string

var peopleCmd = &cobra.Command{
	Use:   "people <file>",
	Short: "Generate org chart with names and roles",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := parser.Parse(args[0])
		if err != nil {
			return err
		}
		vm := views.PeopleView(org)
		result := renderer.Render(vm)
		return writeOutput(result, peopleOutput)
	},
}

func init() {
	peopleCmd.Flags().StringVarP(&peopleOutput, "output", "o", "", "output file path")
	rootCmd.AddCommand(peopleCmd)
}

func writeOutput(content, outputPath string) error {
	if outputPath == "" {
		fmt.Print(content)
		return nil
	}
	return os.WriteFile(outputPath, []byte(content), 0644)
}
```

- [ ] **Step 2: Implement headcount command**

Create `cmd/headcount.go`:

```go
package cmd

import (
	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/parser"
	"github.com/zach/orgchart/internal/renderer"
	"github.com/zach/orgchart/internal/views"
)

var headcountOutput string

var headcountCmd = &cobra.Command{
	Use:   "headcount <file>",
	Short: "Generate org chart with discipline counts",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := parser.Parse(args[0])
		if err != nil {
			return err
		}
		vm := views.HeadcountView(org)
		result := renderer.Render(vm)
		return writeOutput(result, headcountOutput)
	},
}

func init() {
	headcountCmd.Flags().StringVarP(&headcountOutput, "output", "o", "", "output file path")
	rootCmd.AddCommand(headcountCmd)
}
```

- [ ] **Step 3: Build and test manually**

```bash
go build -o orgchart .
./orgchart people testdata/crossteam.csv
./orgchart headcount testdata/crossteam.csv
```

Expected: mermaid output printed to stdout for both commands.

- [ ] **Step 4: Test -o flag**

```bash
./orgchart people testdata/crossteam.csv -o /tmp/people.md
cat /tmp/people.md
./orgchart headcount testdata/crossteam.csv -o /tmp/headcount.md
cat /tmp/headcount.md
```

Expected: files written with mermaid content.

- [ ] **Step 5: Test error cases**

```bash
./orgchart people nonexistent.csv 2>&1; echo "exit: $?"
./orgchart people testdata/simple.csv --bad-flag 2>&1; echo "exit: $?"
```

Expected: error messages to stderr, non-zero exit codes.

- [ ] **Step 6: Commit**

```bash
git add cmd/ main.go
git commit -m "feat: add people and headcount CLI subcommands"
```

---

### Task 11: Integration Test

**Files:**
- Create: `integration_test.go`

- [ ] **Step 1: Write integration test**

Create `integration_test.go` in the project root:

```go
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestIntegration_PeopleCSV(t *testing.T) {
	binary := buildBinary(t)
	out, err := exec.Command(binary, "people", "testdata/crossteam.csv").CombinedOutput()
	if err != nil {
		t.Fatalf("command failed: %v\nOutput: %s", err, out)
	}

	output := string(out)
	checks := []string{
		"flowchart TD",
		"subgraph",
		"Alice",
		"Eve",
		"-.->", // cross-team dotted edge
		"classDef hiring",
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("expected output to contain %q\nGot:\n%s", check, output)
		}
	}
}

func TestIntegration_HeadcountCSV(t *testing.T) {
	binary := buildBinary(t)
	out, err := exec.Command(binary, "headcount", "testdata/crossteam.csv").CombinedOutput()
	if err != nil {
		t.Fatalf("command failed: %v\nOutput: %s", err, out)
	}

	output := string(out)
	checks := []string{
		"flowchart TD",
		"Engineering:",
		"Cross-Team",
		"TPM:",
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("expected output to contain %q\nGot:\n%s", check, output)
		}
	}
}

func TestIntegration_OutputFile(t *testing.T) {
	binary := buildBinary(t)
	dir := t.TempDir()
	outPath := filepath.Join(dir, "output.md")

	err := exec.Command(binary, "people", "testdata/simple.csv", "-o", outPath).Run()
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read output: %v", err)
	}
	if !strings.Contains(string(data), "flowchart TD") {
		t.Error("expected output file to contain mermaid content")
	}
}

func TestIntegration_InvalidFile(t *testing.T) {
	binary := buildBinary(t)
	err := exec.Command(binary, "people", "nonexistent.csv").Run()
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func buildBinary(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	binary := filepath.Join(dir, "orgchart")
	cmd := exec.Command("go", "build", "-o", binary, ".")
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to build: %v\n%s", err, out)
	}
	return binary
}
```

- [ ] **Step 2: Run integration tests**

```bash
go test -v -run "Integration" .
```

Expected: all PASS.

- [ ] **Step 3: Run full test suite**

```bash
go test ./... -v
```

Expected: all tests pass across all packages.

- [ ] **Step 4: Commit**

```bash
git add integration_test.go
git commit -m "test: add integration tests for CLI end-to-end"
```

---

### Task 12: Clean Up and Final Build

**Files:**
- Modify: any remaining cleanup

- [ ] **Step 1: Run go vet and verify no issues**

```bash
go vet ./...
```

Expected: no issues.

- [ ] **Step 2: Build final binary**

```bash
go build -o orgchart .
```

- [ ] **Step 3: Manual smoke test with both views**

```bash
./orgchart people testdata/crossteam.csv
echo "---"
./orgchart headcount testdata/crossteam.csv
```

Verify the output looks correct — proper subgraphs, edges, class definitions.

- [ ] **Step 4: Clean up binary from repo root**

```bash
echo "orgchart" >> .gitignore
```

- [ ] **Step 5: Final commit**

```bash
git add .gitignore
git commit -m "chore: add built binary to gitignore"
```
