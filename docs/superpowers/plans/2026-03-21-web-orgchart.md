# Web Org Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based interactive org chart tool as a single Go binary with an embedded React frontend, supporting file upload, three view modes, drag-and-drop editing, change tracking, and export.

**Architecture:** Go `net/http` backend with REST API serving an embedded React/TypeScript SPA. The backend reuses the existing CSV/XLSX parser, introduces an API-specific model with stable UUIDs, and manages two org snapshots (original + working) in memory. The frontend uses d3-hierarchy for tree layout, dnd-kit for drag-and-drop, and CSS modules for styling.

**Tech Stack:** Go 1.25, React 19, TypeScript, Vite, d3-hierarchy, dnd-kit, html-to-image, excelize, CSS modules

**Spec:** `docs/superpowers/specs/2026-03-21-web-orgchart-design.md`

---

## File Structure

### Go Backend (new files)

| File | Responsibility |
|------|---------------|
| `internal/api/model.go` | API-specific `Person` struct with UUID `Id` and `ManagerId` fields; `OrgState` holding original + working slices |
| `internal/api/convert.go` | Converts `model.Org` → API `[]Person` (assigns UUIDs, resolves name→ID manager refs) |
| `internal/api/convert_test.go` | Tests for conversion layer |
| `internal/api/service.go` | `OrgService` struct: holds original + working state, exposes `Upload`, `Move`, `Update`, `Add`, `Delete` methods |
| `internal/api/service_test.go` | Tests for all service mutations |
| `internal/api/handlers.go` | HTTP handler functions: upload, get org, mutate, export |
| `internal/api/handlers_test.go` | HTTP handler tests using `httptest` |
| `internal/api/export.go` | Serializes `[]Person` back to CSV/XLSX bytes |
| `internal/api/export_test.go` | Round-trip export tests |
| `cmd/serve.go` | `serve` subcommand: starts HTTP server, serves embedded SPA + API |
| `embed.go` | `//go:embed web/dist` directive |
| `Makefile` | Build targets: `frontend`, `build`, `dev` |

### React Frontend (all new, under `web/`)

| File | Responsibility |
|------|---------------|
| `web/package.json` | Dependencies: react, d3-hierarchy, dnd-kit, html-to-image |
| `web/vite.config.ts` | Vite config with proxy to Go API in dev mode |
| `web/tsconfig.json` | TypeScript config |
| `web/index.html` | SPA entry point |
| `web/src/main.tsx` | React root mount |
| `web/src/App.tsx` | App shell: toolbar, main area, sidebar slot |
| `web/src/App.module.css` | App shell layout styles |
| `web/src/api/client.ts` | Typed fetch wrappers for all API endpoints |
| `web/src/api/types.ts` | TypeScript types mirroring API model (`Person`, `OrgData`, mutations) |
| `web/src/store/OrgContext.tsx` | React context: original + working org, dispatch mutations, loading state |
| `web/src/hooks/useOrgDiff.ts` | Compares original vs working by ID, returns change annotations per person |
| `web/src/components/Toolbar.tsx` | View tabs, upload button, view toggle, add person, export dropdown |
| `web/src/components/Toolbar.module.css` | Toolbar styles |
| `web/src/components/PersonNode.tsx` | Reusable person card component (used in tree + column views) |
| `web/src/components/PersonNode.module.css` | Node styles including annotation classes (added, moved, reorg, hiring, ghost) |
| `web/src/components/DetailSidebar.tsx` | Right sidebar: edit form, change annotations, save/cancel |
| `web/src/components/DetailSidebar.module.css` | Sidebar styles |
| `web/src/components/UnparentedBar.tsx` | Persistent notification bar for unparented people |
| `web/src/components/UploadPrompt.tsx` | Initial upload screen shown when no org is loaded |
| `web/src/views/TreeView.tsx` | Tree layout using d3-hierarchy, positioned DOM nodes, SVG edges |
| `web/src/views/TreeView.module.css` | Tree view styles |
| `web/src/views/ColumnView.tsx` | CSS grid columns per team, indented hierarchy within |
| `web/src/views/ColumnView.module.css` | Column view styles |
| `web/src/views/HeadcountView.tsx` | Team cards with discipline counts |
| `web/src/views/HeadcountView.module.css` | Headcount view styles |
| `web/src/hooks/useDragDrop.ts` | dnd-kit setup, handles drop logic (move mutations) |
| `web/src/hooks/useExport.ts` | Triggers PNG/SVG capture via html-to-image, data export via API |
| `web/src/hooks/useZoomPan.ts` | CSS transform-based zoom/pan for tree view |

---

## Task 1: Build Infrastructure

**Files:**
- Create: `Makefile`
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/App.module.css`
- Create: `embed.go`

This task sets up the build pipeline: Vite project, Makefile, go:embed, and a minimal React app that renders "Org Chart" on screen. No API yet — just proving the frontend builds and embeds.

- [ ] **Step 1: Initialize the Vite/React project**

```bash
cd web && npm create vite@latest . -- --template react-ts
```

Accept the defaults. This creates `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, and `src/` boilerplate.

- [ ] **Step 2: Clean up Vite boilerplate**

Remove `src/App.css`, `src/index.css`, `src/assets/`, and the counter logic from `App.tsx`. Replace `App.tsx` with:

```tsx
// web/src/App.tsx
import styles from './App.module.css'

export default function App() {
  return (
    <div className={styles.app}>
      <header className={styles.toolbar}>Org Chart</header>
      <main className={styles.main}>Upload a file to get started</main>
    </div>
  )
}
```

```css
/* web/src/App.module.css */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  font-weight: 600;
}

.main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}
```

Update `src/main.tsx` to remove the default CSS import:

```tsx
// web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Configure Vite for dev proxy**

```ts
// web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
})
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd web && npm install && npm run build
```

Expected: `web/dist/` directory with `index.html` and JS/CSS assets.

- [ ] **Step 5: Create embed.go**

```go
// embed.go
package main

import "embed"

//go:embed web/dist
var frontendFS embed.FS
```

- [ ] **Step 6: Create Makefile**

```makefile
# Makefile
.PHONY: frontend build dev clean

frontend:
	cd web && npm run build

build: frontend
	go build -o orgchart .

dev:
	@echo "Starting dev servers..."
	@cd web && npm run dev &
	@go run . serve --dev
	@wait

clean:
	rm -rf web/dist orgchart
```

- [ ] **Step 7: Verify `go build` compiles with embedded assets**

```bash
make build
```

Expected: produces `orgchart` binary without errors. The binary won't serve the frontend yet (no `serve` command) — that's Task 5.

- [ ] **Step 8: Add `web/dist` and `web/node_modules` to .gitignore**

Append to existing `.gitignore`:

```
web/dist/
web/node_modules/
```

- [ ] **Step 9: Commit**

```bash
jj describe -m "feat: add build infrastructure — Vite, Makefile, go:embed"
```

---

## Task 2: API Model + Conversion Layer

**Files:**
- Create: `internal/api/model.go`
- Create: `internal/api/convert.go`
- Create: `internal/api/convert_test.go`

Introduces the web-specific `Person` struct with stable UUIDs and the conversion from the existing `model.Org`.

- [ ] **Step 1: Write the failing test for conversion**

```go
// internal/api/convert_test.go
package api

import (
	"testing"

	"github.com/zach/orgchart/internal/model"
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/api/ -v
```

Expected: compilation error — `api` package doesn't exist yet.

- [ ] **Step 3: Create the API model**

```go
// internal/api/model.go
package api

// Person is the web API representation of an org member.
// Uses stable UUID IDs instead of name-based references.
type Person struct {
	Id              string   `json:"id"`
	Name            string   `json:"name"`
	Role            string   `json:"role"`
	Discipline      string   `json:"discipline"`
	ManagerId       string   `json:"managerId"`
	Team            string   `json:"team"`
	AdditionalTeams []string `json:"additionalTeams"`
	Status          string   `json:"status"`
	NewRole         string   `json:"newRole,omitempty"`
	NewTeam         string   `json:"newTeam,omitempty"`
}

// OrgData is the JSON payload sent to the frontend.
type OrgData struct {
	Original []Person `json:"original"`
	Working  []Person `json:"working"`
}
```

- [ ] **Step 4: Implement conversion**

```go
// internal/api/convert.go
package api

import (
	"github.com/google/uuid"
	"github.com/zach/orgchart/internal/model"
)

// ConvertOrg converts a model.Org into a slice of API Persons with stable UUIDs.
func ConvertOrg(org *model.Org) []Person {
	nameToID := make(map[string]string, len(org.People))
	for _, p := range org.People {
		nameToID[p.Name] = uuid.NewString()
	}

	result := make([]Person, len(org.People))
	for i, p := range org.People {
		result[i] = Person{
			Id:              nameToID[p.Name],
			Name:            p.Name,
			Role:            p.Role,
			Discipline:      p.Discipline,
			ManagerId:       nameToID[p.Manager], // empty string if manager not found (root)
			Team:            p.Team,
			AdditionalTeams: p.AdditionalTeams,
			Status:          p.Status,
			NewRole:         p.NewRole,
			NewTeam:         p.NewTeam,
		}
	}
	return result
}
```

- [ ] **Step 5: Add `google/uuid` dependency**

```bash
go get github.com/google/uuid
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
go test ./internal/api/ -v
```

Expected: both tests PASS.

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: add API model and model.Org → API conversion with UUIDs"
```

---

## Task 3: Org Service (State + Mutations)

**Files:**
- Create: `internal/api/service.go`
- Create: `internal/api/service_test.go`

The `OrgService` holds original + working state and implements all four mutations: move, update, add, delete.

- [ ] **Step 1: Write failing test for Upload**

```go
// internal/api/service_test.go
package api

import (
	"testing"
)

func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService()
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	if err := svc.Upload("test.csv", csv); err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	return svc
}

func TestOrgService_Upload(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	if data == nil {
		t.Fatal("expected org data after upload")
	}
	if len(data.Original) != 3 {
		t.Errorf("expected 3 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(data.Working))
	}
	// Original and working should have same IDs but be independent copies
	if data.Original[0].Id != data.Working[0].Id {
		t.Error("expected original and working to share IDs")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/api/ -run TestOrgService -v
```

Expected: compilation error — `OrgService` not defined.

- [ ] **Step 3: Implement OrgService with Upload and GetOrg**

```go
// internal/api/service.go
package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"github.com/zach/orgchart/internal/model"
	"github.com/zach/orgchart/internal/parser"
)

type OrgService struct {
	mu       sync.RWMutex
	original []Person
	working  []Person
}

func NewOrgService() *OrgService {
	return &OrgService{}
}

// Upload parses a CSV or XLSX file from bytes and initializes both snapshots.
func (s *OrgService) Upload(filename string, data []byte) error {
	org, err := parseBytes(filename, data)
	if err != nil {
		return fmt.Errorf("parsing file: %w", err)
	}

	people := ConvertOrg(org)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.original = people
	s.working = deepCopyPeople(people)
	return nil
}

// GetOrg returns both snapshots. Returns nil if no org is loaded.
func (s *OrgService) GetOrg() *OrgData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.original == nil {
		return nil
	}
	return &OrgData{
		Original: s.original,
		Working:  s.working,
	}
}

// GetWorking returns just the working copy.
func (s *OrgService) GetWorking() []Person {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.working
}

func (s *OrgService) findWorking(id string) (int, *Person) {
	for i := range s.working {
		if s.working[i].Id == id {
			return i, &s.working[i]
		}
	}
	return -1, nil
}

// Move changes a person's manager and/or team.
func (s *OrgService) Move(personId, newManagerId, newTeam string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return fmt.Errorf("person %s not found", personId)
	}
	if newManagerId != "" {
		if _, mgr := s.findWorking(newManagerId); mgr == nil {
			return fmt.Errorf("manager %s not found", newManagerId)
		}
	}
	p.ManagerId = newManagerId
	if newTeam != "" {
		p.Team = newTeam
	}
	return nil
}

// Update edits fields on a person.
func (s *OrgService) Update(personId string, fields map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return fmt.Errorf("person %s not found", personId)
	}
	for k, v := range fields {
		switch k {
		case "name":
			p.Name = v
		case "role":
			p.Role = v
		case "discipline":
			p.Discipline = v
		case "team":
			p.Team = v
		case "status":
			p.Status = v
		case "managerId":
			p.ManagerId = v
		case "newRole":
			p.NewRole = v
		case "newTeam":
			p.NewTeam = v
		}
	}
	return nil
}

// Add creates a new person in the working copy.
func (s *OrgService) Add(p Person) Person {
	s.mu.Lock()
	defer s.mu.Unlock()
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	return p
}

// Delete removes a person. Their direct reports become unparented (managerId = "").
func (s *OrgService) Delete(personId string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx, _ := s.findWorking(personId)
	if idx == -1 {
		return fmt.Errorf("person %s not found", personId)
	}
	// Unparent direct reports
	for i := range s.working {
		if s.working[i].ManagerId == personId {
			s.working[i].ManagerId = ""
		}
	}
	// Remove the person
	s.working = append(s.working[:idx], s.working[idx+1:]...)
	return nil
}

func deepCopyPeople(src []Person) []Person {
	dst := make([]Person, len(src))
	for i, p := range src {
		dst[i] = p
		if p.AdditionalTeams != nil {
			dst[i].AdditionalTeams = make([]string, len(p.AdditionalTeams))
			copy(dst[i].AdditionalTeams, p.AdditionalTeams)
		}
	}
	return dst
}

// parseBytes parses CSV or XLSX from in-memory bytes using the existing parser infrastructure.
func parseBytes(filename string, data []byte) (*model.Org, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".csv":
		return parseBytesCSV(data)
	case ".xlsx":
		return parseBytesXLSX(data)
	default:
		return nil, fmt.Errorf("unsupported file format '%s'", ext)
	}
}

func parseBytesCSV(data []byte) (*model.Org, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("reading CSV: %w", err)
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("CSV must have a header row and at least one data row")
	}
	return parser.BuildPeople(records[0], records[1:])
}

func parseBytesXLSX(data []byte) (*model.Org, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("opening xlsx: %w", err)
	}
	defer f.Close()
	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("reading rows: %w", err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("xlsx must have a header row and at least one data row")
	}
	return parser.BuildPeople(rows[0], rows[1:])
}
```

**Important:** This requires exporting `BuildPeople` from the parser package. Rename `buildPeople` → `BuildPeople` in `internal/parser/parser.go`.

- [ ] **Step 4: Export `buildPeople` in parser**

In `internal/parser/parser.go`, rename `buildPeople` to `BuildPeople`. Also update the two callers (`csv.go` and `xlsx.go`) to use `BuildPeople`.

- [ ] **Step 5: Run upload test**

```bash
go test ./internal/api/ -run TestOrgService_Upload -v
```

Expected: PASS.

- [ ] **Step 6: Write failing tests for mutations**

Add to `internal/api/service_test.go`:

```go
func TestOrgService_Move(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	err := svc.Move(carol.Id, alice.Id, "Eng")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}

	working := svc.GetWorking()
	updated := findById(working, carol.Id)
	if updated.ManagerId != alice.Id {
		t.Errorf("expected Carol's manager to be Alice, got %s", updated.ManagerId)
	}
	if updated.Team != "Eng" {
		t.Errorf("expected Carol's team to be Eng, got %s", updated.Team)
	}

	// Original should be unchanged
	origCarol := findByName(svc.GetOrg().Original, "Carol")
	if origCarol.Team == "Eng" {
		t.Error("expected original Carol to still be on Platform")
	}
}

func TestOrgService_Update(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	err := svc.Update(bob.Id, map[string]string{"role": "Senior Engineer", "discipline": "SRE"})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	working := svc.GetWorking()
	updated := findById(working, bob.Id)
	if updated.Role != "Senior Engineer" {
		t.Errorf("expected role 'Senior Engineer', got '%s'", updated.Role)
	}
	if updated.Discipline != "SRE" {
		t.Errorf("expected discipline 'SRE', got '%s'", updated.Discipline)
	}
}

func TestOrgService_Add(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")

	added := svc.Add(Person{
		Name: "Dave", Role: "Engineer", Discipline: "Eng",
		ManagerId: alice.Id, Team: "Eng", Status: "Active",
	})

	if added.Id == "" {
		t.Error("expected added person to have an ID")
	}

	working := svc.GetWorking()
	if len(working) != 4 {
		t.Errorf("expected 4 people, got %d", len(working))
	}
}

func TestOrgService_Delete(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	err := svc.Delete(bob.Id)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	working := svc.GetWorking()
	if len(working) != 2 {
		t.Errorf("expected 2 people, got %d", len(working))
	}

	// Carol should be unparented
	updatedCarol := findById(working, carol.Id)
	if updatedCarol == nil {
		t.Fatal("expected Carol to still exist")
	}
	if updatedCarol.ManagerId != "" {
		t.Errorf("expected Carol to be unparented, got managerId %s", updatedCarol.ManagerId)
	}
}

func findById(people []Person, id string) *Person {
	for i := range people {
		if people[i].Id == id {
			return &people[i]
		}
	}
	return nil
}
```

- [ ] **Step 7: Run all service tests**

```bash
go test ./internal/api/ -v
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
jj describe -m "feat: add OrgService with upload, state management, and mutations"
```

---

## Task 4: HTTP Handlers

**Files:**
- Create: `internal/api/handlers.go`
- Create: `internal/api/handlers_test.go`
- Create: `cmd/serve.go`

REST API endpoints and the `serve` CLI subcommand.

- [ ] **Step 1: Write failing test for upload handler**

```go
// internal/api/handlers_test.go
package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUploadHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "test.csv")
	part.Write([]byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n"))
	writer.Close()

	req := httptest.NewRequest("POST", "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var data OrgData
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(data.Original) != 1 {
		t.Errorf("expected 1 person, got %d", len(data.Original))
	}
}

func TestGetOrgHandler_Empty(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

	req := httptest.NewRequest("GET", "/api/org", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

func TestMoveHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

	// Upload first
	uploadCSV(t, handler)

	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	payload := fmt.Sprintf(`{"personId":"%s","newManagerId":"%s","newTeam":"Eng"}`, bob.Id, alice.Id)
	req := httptest.NewRequest("POST", "/api/move", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func uploadCSV(t *testing.T, handler http.Handler) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "test.csv")
	part.Write([]byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"))
	writer.Close()

	req := httptest.NewRequest("POST", "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload failed: %d %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/api/ -run TestUploadHandler -v
```

Expected: compilation error — `NewRouter` not defined.

- [ ] **Step 3: Implement handlers and router**

```go
// internal/api/handlers.go
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func NewRouter(svc *OrgService) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/upload", handleUpload(svc))
	mux.HandleFunc("GET /api/org", handleGetOrg(svc))
	mux.HandleFunc("POST /api/move", handleMove(svc))
	mux.HandleFunc("POST /api/update", handleUpdate(svc))
	mux.HandleFunc("POST /api/add", handleAdd(svc))
	mux.HandleFunc("POST /api/delete", handleDelete(svc))
	mux.HandleFunc("GET /api/export/{format}", handleExport(svc))
	return mux
}

func handleUpload(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "missing file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "reading file", http.StatusInternalServerError)
			return
		}

		if err := svc.Upload(header.Filename, data); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		writeJSON(w, svc.GetOrg())
	}
}

func handleGetOrg(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := svc.GetOrg()
		if data == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, data)
	}
}

func handleMove(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonId    string `json:"personId"`
			NewManagerId string `json:"newManagerId"`
			NewTeam     string `json:"newTeam"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := svc.Move(req.PersonId, req.NewManagerId, req.NewTeam); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, svc.GetWorking())
	}
}

func handleUpdate(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonId string            `json:"personId"`
			Fields   map[string]string `json:"fields"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := svc.Update(req.PersonId, req.Fields); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, svc.GetWorking())
	}
}

func handleAdd(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p Person
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		svc.Add(p)
		writeJSON(w, svc.GetWorking())
	}
}

func handleDelete(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			PersonId string `json:"personId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := svc.Delete(req.PersonId); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, svc.GetWorking())
	}
}

func handleExport(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		format := r.PathValue("format")
		working := svc.GetWorking()
		if working == nil {
			http.Error(w, "no org loaded", http.StatusBadRequest)
			return
		}
		switch format {
		case "csv":
			data, err := ExportCSV(working)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/csv")
			w.Header().Set("Content-Disposition", "attachment; filename=orgchart.csv")
			w.Write(data)
		case "xlsx":
			data, err := ExportXLSX(working)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
			w.Header().Set("Content-Disposition", "attachment; filename=orgchart.xlsx")
			w.Write(data)
		default:
			http.Error(w, fmt.Sprintf("unsupported format: %s", format), http.StatusBadRequest)
		}
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
```

Note: `handleExport` references `ExportCSV` and `ExportXLSX` which will be implemented in Task 5 (Export). For now, create stubs so the code compiles:

```go
// internal/api/export.go
package api

func ExportCSV(people []Person) ([]byte, error) {
	return nil, fmt.Errorf("not implemented")
}

func ExportXLSX(people []Person) ([]byte, error) {
	return nil, fmt.Errorf("not implemented")
}
```

- [ ] **Step 4: Add the missing `fmt` import to handlers_test.go**

The test file uses `fmt.Sprintf` — ensure the import is present.

- [ ] **Step 5: Run handler tests**

```bash
go test ./internal/api/ -run "TestUploadHandler|TestGetOrg|TestMove" -v
```

Expected: all PASS.

- [ ] **Step 6: Create the `serve` command**

```go
// cmd/serve.go
package cmd

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"

	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/api"
)

var (
	servePort int
	serveDev  bool
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the web UI server",
	RunE: func(cmd *cobra.Command, args []string) error {
		svc := api.NewOrgService()
		mux := http.NewServeMux()

		// Mount API routes
		apiRouter := api.NewRouter(svc)
		mux.Handle("/api/", apiRouter)

		// Serve frontend
		if !serveDev {
			frontendFS, err := getFrontendFS()
			if err != nil {
				return fmt.Errorf("loading frontend: %w", err)
			}
			mux.Handle("/", http.FileServer(http.FS(frontendFS)))
		}

		addr := fmt.Sprintf(":%d", servePort)
		fmt.Fprintf(os.Stderr, "Listening on http://localhost%s\n", addr)
		return http.ListenAndServe(addr, mux)
	},
}

func init() {
	serveCmd.Flags().IntVarP(&servePort, "port", "p", 8080, "port to listen on")
	serveCmd.Flags().BoolVar(&serveDev, "dev", false, "dev mode (frontend served by Vite)")
	rootCmd.AddCommand(serveCmd)
}
```

This references a `getFrontendFS()` function that needs to live in `embed.go` to access the embedded FS. Update `embed.go`:

```go
// embed.go
package main

import (
	"embed"
	"io/fs"
)

//go:embed web/dist
var frontendDist embed.FS

func getFrontendFS() (fs.FS, error) {
	return fs.Sub(frontendDist, "web/dist")
}
```

Since `getFrontendFS` is in `main` package but `cmd/serve.go` is in `cmd` package, we need to inject it. Update `cmd/serve.go` to accept a function parameter, and `main.go` to wire it:

```go
// cmd/serve.go — update the package-level var and init
var GetFrontendFS func() (fs.FS, error)
```

```go
// main.go
package main

import "github.com/zach/orgchart/cmd"

func main() {
	cmd.GetFrontendFS = getFrontendFS
	cmd.Execute()
}
```

- [ ] **Step 7: Verify the full build works**

```bash
make build
```

Expected: compiles successfully.

- [ ] **Step 8: Smoke test the server**

```bash
./orgchart serve &
sleep 1
curl -s http://localhost:8080/ | head -5
kill %1
```

Expected: returns HTML content from the embedded Vite build.

- [ ] **Step 9: Run all tests**

```bash
go test ./... -v
```

Expected: all tests pass (existing + new).

- [ ] **Step 10: Commit**

```bash
jj describe -m "feat: add HTTP API handlers and serve command"
```

---

## Task 5: Data Export (CSV/XLSX)

**Files:**
- Modify: `internal/api/export.go` (replace stubs)
- Create: `internal/api/export_test.go`

Implements round-trip export: API `[]Person` → CSV or XLSX bytes.

- [ ] **Step 1: Write failing test for CSV export**

```go
// internal/api/export_test.go
package api

import (
	"encoding/csv"
	"bytes"
	"testing"
)

func TestExportCSV_RoundTrip(t *testing.T) {
	input := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"

	svc := NewOrgService()
	if err := svc.Upload("test.csv", []byte(input)); err != nil {
		t.Fatalf("upload: %v", err)
	}

	data, err := ExportCSV(svc.GetWorking())
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("parsing exported CSV: %v", err)
	}

	// Header + 2 data rows
	if len(records) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(records))
	}

	// Check header
	expectedHeaders := []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status"}
	for i, h := range expectedHeaders {
		if records[0][i] != h {
			t.Errorf("header[%d]: expected %s, got %s", i, h, records[0][i])
		}
	}

	// Check Alice's row — manager should be empty since she's a root
	if records[1][0] != "Alice" {
		t.Errorf("expected first data row to be Alice, got %s", records[1][0])
	}
	if records[1][3] != "" {
		t.Errorf("expected Alice's manager to be empty, got '%s'", records[1][3])
	}

	// Check Bob's row — manager should be "Alice" (name, not ID)
	if records[2][3] != "Alice" {
		t.Errorf("expected Bob's manager to be 'Alice', got '%s'", records[2][3])
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/api/ -run TestExportCSV -v
```

Expected: FAIL — stub returns "not implemented".

- [ ] **Step 3: Implement CSV export**

Replace the stub in `internal/api/export.go`:

```go
// internal/api/export.go
package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status"}

// ExportCSV serializes people to CSV bytes. Manager IDs are resolved back to names.
func ExportCSV(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Write(exportHeaders)

	for _, p := range people {
		w.Write(personToRow(p, idToName))
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("writing CSV: %w", err)
	}
	return buf.Bytes(), nil
}

// ExportXLSX serializes people to XLSX bytes.
func ExportXLSX(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)

	f := excelize.NewFile()
	sheet := "Sheet1"
	for i, h := range exportHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	for rowIdx, p := range people {
		row := personToRow(p, idToName)
		for colIdx, val := range row {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			f.SetCellValue(sheet, cell, val)
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("writing XLSX: %w", err)
	}
	return buf.Bytes(), nil
}

func buildIDToName(people []Person) map[string]string {
	m := make(map[string]string, len(people))
	for _, p := range people {
		m[p.Id] = p.Name
	}
	return m
}

func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId] // empty string if not found (root)
	return []string{
		p.Name,
		p.Role,
		p.Discipline,
		managerName,
		p.Team,
		strings.Join(p.AdditionalTeams, ","),
		p.Status,
	}
}
```

- [ ] **Step 4: Run export tests**

```bash
go test ./internal/api/ -run TestExport -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add CSV and XLSX export with name-based manager resolution"
```

---

## Task 6: Frontend API Client + Types + Org Store

**Files:**
- Create: `web/src/api/types.ts`
- Create: `web/src/api/client.ts`
- Create: `web/src/store/OrgContext.tsx`
- Create: `web/src/components/UploadPrompt.tsx`
- Modify: `web/src/App.tsx`

Sets up the TypeScript types, API client, React context for org state, and the file upload flow.

- [ ] **Step 1: Install additional dependencies**

```bash
cd web && npm install d3-hierarchy @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities html-to-image && npm install -D @types/d3-hierarchy
```

- [ ] **Step 2: Create TypeScript types**

```ts
// web/src/api/types.ts
export interface Person {
  id: string
  name: string
  role: string
  discipline: string
  managerId: string
  team: string
  additionalTeams: string[]
  status: 'Active' | 'Hiring' | 'Open' | 'Transfer'
  newRole?: string
  newTeam?: string
}

export interface OrgData {
  original: Person[]
  working: Person[]
}

export interface MovePayload {
  personId: string
  newManagerId: string
  newTeam: string
}

export interface UpdatePayload {
  personId: string
  fields: Record<string, string>
}

export interface DeletePayload {
  personId: string
}
```

- [ ] **Step 3: Create API client**

```ts
// web/src/api/client.ts
import type { OrgData, Person, MovePayload, UpdatePayload, DeletePayload } from './types'

const BASE = '/api'

export async function uploadFile(file: File): Promise<OrgData> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getOrg(): Promise<OrgData | null> {
  const res = await fetch(`${BASE}/org`)
  if (res.status === 204) return null
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function movePerson(payload: MovePayload): Promise<Person[]> {
  const res = await fetch(`${BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updatePerson(payload: UpdatePayload): Promise<Person[]> {
  const res = await fetch(`${BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function addPerson(person: Omit<Person, 'id'>): Promise<Person[]> {
  const res = await fetch(`${BASE}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(person),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deletePerson(payload: DeletePayload): Promise<Person[]> {
  const res = await fetch(`${BASE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function exportDataUrl(format: 'csv' | 'xlsx'): string {
  return `${BASE}/export/${format}`
}
```

- [ ] **Step 4: Create OrgContext**

```tsx
// web/src/store/OrgContext.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Person, OrgData } from '../api/types'
import * as api from '../api/client'

export type ViewMode = 'tree' | 'columns' | 'headcount'
export type DataView = 'original' | 'working' | 'diff'

interface OrgContextValue {
  original: Person[]
  working: Person[]
  loaded: boolean
  viewMode: ViewMode
  dataView: DataView
  selectedId: string | null
  setViewMode: (mode: ViewMode) => void
  setDataView: (view: DataView) => void
  setSelectedId: (id: string | null) => void
  upload: (file: File) => Promise<void>
  move: (personId: string, newManagerId: string, newTeam: string) => Promise<void>
  update: (personId: string, fields: Record<string, string>) => Promise<void>
  add: (person: Omit<Person, 'id'>) => Promise<void>
  remove: (personId: string) => Promise<void>
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({ children }: { children: ReactNode }) {
  const [original, setOriginal] = useState<Person[]>([])
  const [working, setWorking] = useState<Person[]>([])
  const [loaded, setLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [dataView, setDataView] = useState<DataView>('working')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const upload = useCallback(async (file: File) => {
    const data = await api.uploadFile(file)
    setOriginal(data.original)
    setWorking(data.working)
    setLoaded(true)
  }, [])

  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string) => {
    const updated = await api.movePerson({ personId, newManagerId, newTeam })
    setWorking(updated)
  }, [])

  const update = useCallback(async (personId: string, fields: Record<string, string>) => {
    const updated = await api.updatePerson({ personId, fields })
    setWorking(updated)
  }, [])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    const updated = await api.addPerson(person)
    setWorking(updated)
  }, [])

  const remove = useCallback(async (personId: string) => {
    const updated = await api.deletePerson({ personId })
    setWorking(updated)
    if (selectedId === personId) setSelectedId(null)
  }, [selectedId])

  return (
    <OrgContext.Provider value={{
      original, working, loaded,
      viewMode, dataView, selectedId,
      setViewMode, setDataView, setSelectedId,
      upload, move, update, add, remove,
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
```

- [ ] **Step 5: Create UploadPrompt component**

```tsx
// web/src/components/UploadPrompt.tsx
import { useOrg } from '../store/OrgContext'
import { useCallback } from 'react'

export default function UploadPrompt() {
  const { upload } = useOrg()

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await upload(file)
  }, [upload])

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ marginBottom: 16, color: '#888' }}>Upload a CSV or XLSX file to get started</p>
      <label style={{
        padding: '8px 20px', background: '#2563eb', color: 'white',
        borderRadius: 6, cursor: 'pointer', fontSize: 14,
      }}>
        Choose File
        <input type="file" accept=".csv,.xlsx" onChange={handleChange} style={{ display: 'none' }} />
      </label>
    </div>
  )
}
```

- [ ] **Step 6: Update App.tsx to use OrgProvider and show UploadPrompt**

```tsx
// web/src/App.tsx
import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import UploadPrompt from './components/UploadPrompt'

function AppContent() {
  const { loaded } = useOrg()

  if (!loaded) {
    return (
      <div className={styles.app}>
        <header className={styles.toolbar}>Org Chart</header>
        <main className={styles.main}>
          <UploadPrompt />
        </main>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <header className={styles.toolbar}>Org Chart — loaded</header>
      <main className={styles.main}>
        View placeholder
      </main>
    </div>
  )
}

export default function App() {
  return (
    <OrgProvider>
      <AppContent />
    </OrgProvider>
  )
}
```

- [ ] **Step 7: Update main.tsx**

```tsx
// web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Verify frontend builds**

```bash
cd web && npm run build
```

Expected: builds successfully into `web/dist/`.

- [ ] **Step 9: End-to-end smoke test**

```bash
make build && ./orgchart serve &
sleep 1
curl -s http://localhost:8080/ | grep -q "Org Chart"
echo "Frontend OK"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/org
echo " (expect 204)"
kill %1
```

Expected: "Frontend OK" and "204".

- [ ] **Step 10: Commit**

```bash
jj describe -m "feat: add frontend API client, org store, and upload flow"
```

---

## Task 7: Toolbar + Headcount View

**Files:**
- Create: `web/src/components/Toolbar.tsx`
- Create: `web/src/components/Toolbar.module.css`
- Create: `web/src/views/HeadcountView.tsx`
- Create: `web/src/views/HeadcountView.module.css`
- Modify: `web/src/App.tsx`

Starting with the simplest view (headcount is read-only, no DnD) to validate the full pipeline end-to-end.

- [ ] **Step 1: Create Toolbar component**

```tsx
// web/src/components/Toolbar.tsx
import { useOrg, type ViewMode, type DataView } from '../store/OrgContext'
import { useCallback } from 'react'
import styles from './Toolbar.module.css'

export default function Toolbar() {
  const { viewMode, setViewMode, dataView, setDataView, upload } = useOrg()

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await upload(file)
  }, [upload])

  const viewModes: { key: ViewMode; label: string }[] = [
    { key: 'tree', label: 'Tree' },
    { key: 'columns', label: 'Columns' },
    { key: 'headcount', label: 'Headcount' },
  ]

  const dataViews: { key: DataView; label: string }[] = [
    { key: 'original', label: 'Original' },
    { key: 'working', label: 'Working' },
    { key: 'diff', label: 'Diff' },
  ]

  return (
    <header className={styles.toolbar}>
      <span className={styles.title}>Org Chart</span>

      <label className={styles.uploadBtn}>
        Upload
        <input type="file" accept=".csv,.xlsx" onChange={handleUpload} hidden />
      </label>

      <div className={styles.tabs}>
        {viewModes.map(({ key, label }) => (
          <button
            key={key}
            className={viewMode === key ? styles.active : ''}
            onClick={() => setViewMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.tabs}>
        {dataViews.map(({ key, label }) => (
          <button
            key={key}
            className={dataView === key ? styles.active : ''}
            onClick={() => setDataView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.spacer} />

      <a href="/api/export/csv" className={styles.exportBtn}>CSV</a>
      <a href="/api/export/xlsx" className={styles.exportBtn}>XLSX</a>
    </header>
  )
}
```

```css
/* web/src/components/Toolbar.module.css */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  flex-shrink: 0;
}

.title {
  font-weight: 600;
  margin-right: 8px;
}

.uploadBtn {
  padding: 4px 12px;
  background: #2563eb;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.tabs {
  display: flex;
  gap: 2px;
  background: #e5e7eb;
  border-radius: 4px;
  padding: 2px;
}

.tabs button {
  padding: 4px 12px;
  border: none;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
}

.tabs .active {
  background: white;
  font-weight: 500;
}

.spacer {
  flex: 1;
}

.exportBtn {
  padding: 4px 10px;
  font-size: 13px;
  color: #374151;
  text-decoration: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.exportBtn:hover {
  background: #f3f4f6;
}
```

- [ ] **Step 2: Create HeadcountView**

```tsx
// web/src/views/HeadcountView.tsx
import { useMemo } from 'react'
import type { Person } from '../api/types'
import styles from './HeadcountView.module.css'

interface Props {
  people: Person[]
}

interface TeamCount {
  team: string
  disciplines: { name: string; count: number }[]
  hiring: number
  transfer: number
  total: number
}

export default function HeadcountView({ people }: Props) {
  const teams = useMemo(() => {
    const teamOrder: string[] = []
    const teamSet = new Set<string>()
    const teamMap = new Map<string, Person[]>()

    for (const p of people) {
      if (!teamSet.has(p.team)) {
        teamSet.add(p.team)
        teamOrder.push(p.team)
      }
      const list = teamMap.get(p.team) ?? []
      list.push(p)
      teamMap.set(p.team, list)
    }

    return teamOrder.map((team): TeamCount => {
      const members = teamMap.get(team) ?? []
      const discCounts = new Map<string, number>()
      let hiring = 0
      let transfer = 0

      for (const p of members) {
        if (p.status === 'Active') {
          discCounts.set(p.discipline, (discCounts.get(p.discipline) ?? 0) + 1)
        } else if (p.status === 'Transfer') {
          transfer++
        } else {
          hiring++
        }
      }

      const disciplines = [...discCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({ name, count }))

      return { team, disciplines, hiring, transfer, total: members.length }
    })
  }, [people])

  return (
    <div className={styles.container}>
      {teams.map((t) => (
        <div key={t.team} className={styles.card}>
          <h3 className={styles.teamName}>{t.team}</h3>
          {t.disciplines.map((d) => (
            <div key={d.name} className={styles.row}>{d.name}: {d.count}</div>
          ))}
          {t.hiring > 0 && <div className={styles.hiring}>Hiring: {t.hiring}</div>}
          {t.transfer > 0 && <div className={styles.transfer}>Transfer: {t.transfer}</div>}
          <div className={styles.total}>Total: {t.total}</div>
        </div>
      ))}
    </div>
  )
}
```

```css
/* web/src/views/HeadcountView.module.css */
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 24px;
  align-content: flex-start;
}

.card {
  border: 2px solid #60a5fa;
  border-radius: 8px;
  padding: 16px;
  min-width: 160px;
}

.teamName {
  margin: 0 0 12px;
  font-size: 15px;
}

.row {
  font-size: 14px;
  margin-bottom: 4px;
}

.hiring {
  font-size: 14px;
  color: #3b82f6;
}

.transfer {
  font-size: 14px;
  color: #f59e0b;
}

.total {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
  font-weight: 600;
  font-size: 14px;
}
```

- [ ] **Step 3: Wire into App.tsx**

```tsx
// web/src/App.tsx
import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import Toolbar from './components/Toolbar'
import UploadPrompt from './components/UploadPrompt'
import HeadcountView from './views/HeadcountView'

function AppContent() {
  const { loaded, working, original, viewMode, dataView } = useOrg()

  if (!loaded) {
    return (
      <div className={styles.app}>
        <header className={styles.toolbar}>Org Chart</header>
        <main className={styles.main}>
          <UploadPrompt />
        </main>
      </div>
    )
  }

  const people = dataView === 'original' ? original : working

  return (
    <div className={styles.app}>
      <Toolbar />
      <main className={styles.main}>
        {viewMode === 'headcount' && <HeadcountView people={people} />}
        {viewMode === 'tree' && <div style={{ padding: 24, color: '#888' }}>Tree view — coming next</div>}
        {viewMode === 'columns' && <div style={{ padding: 24, color: '#888' }}>Column view — coming next</div>}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <OrgProvider>
      <AppContent />
    </OrgProvider>
  )
}
```

- [ ] **Step 4: Verify build**

```bash
cd web && npm run build
```

Expected: builds successfully.

- [ ] **Step 5: Manual smoke test**

```bash
make build && ./orgchart serve
```

Open browser, upload `testdata/crossteam.csv`, switch to Headcount tab. Verify team cards render with correct discipline counts.

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: add toolbar, headcount view, end-to-end upload flow"
```

---

## Task 8: Tree View

**Files:**
- Create: `web/src/views/TreeView.tsx`
- Create: `web/src/views/TreeView.module.css`
- Create: `web/src/components/PersonNode.tsx`
- Create: `web/src/components/PersonNode.module.css`
- Create: `web/src/hooks/useZoomPan.ts`
- Modify: `web/src/App.tsx`

The tree view uses d3-hierarchy for layout math, renders DOM nodes, and draws SVG edges.

- [ ] **Step 1: Create PersonNode component**

```tsx
// web/src/components/PersonNode.tsx
import styles from './PersonNode.module.css'
import type { Person } from '../api/types'

interface Props {
  person: Person
  selected?: boolean
  onClick?: () => void
}

export default function PersonNode({ person, selected, onClick }: Props) {
  const isHiring = person.status === 'Hiring' || person.status === 'Open'
  const isTransfer = person.status === 'Transfer'

  const classNames = [
    styles.node,
    selected && styles.selected,
    isHiring && styles.hiring,
    isTransfer && styles.transfer,
  ].filter(Boolean).join(' ')

  const prefix = isHiring ? '\u{1F535} ' : isTransfer ? '\u{1F7E1} ' : ''

  return (
    <div className={classNames} onClick={onClick}>
      <div className={styles.name}>{prefix}{person.name}</div>
      <div className={styles.role}>{person.role || 'TBD'}</div>
    </div>
  )
}
```

```css
/* web/src/components/PersonNode.module.css */
.node {
  padding: 8px 14px;
  border: 2px solid #60a5fa;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  text-align: center;
  min-width: 120px;
  user-select: none;
}

.node:hover {
  border-color: #3b82f6;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37,99,235,0.3);
}

.hiring {
  border-style: dashed;
}

.transfer {
  border-style: dashed;
  border-color: #f59e0b;
}

.name {
  font-weight: 500;
  font-size: 14px;
}

.role {
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}
```

- [ ] **Step 2: Create useZoomPan hook**

```ts
// web/src/hooks/useZoomPan.ts
import { useState, useCallback, useRef, type WheelEvent, type MouseEvent } from 'react'

interface Transform {
  x: number
  y: number
  scale: number
}

export function useZoomPan() {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setTransform((t) => ({
      ...t,
      scale: Math.min(3, Math.max(0.2, t.scale * delta)),
    }))
  }, [])

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  const style = {
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    transformOrigin: '0 0',
  }

  return { style, handlers: { onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave: onMouseUp } }
}
```

- [ ] **Step 3: Create TreeView**

```tsx
// web/src/views/TreeView.tsx
import { useMemo } from 'react'
import { hierarchy, tree } from 'd3-hierarchy'
import type { Person } from '../api/types'
import PersonNode from '../components/PersonNode'
import { useZoomPan } from '../hooks/useZoomPan'
import styles from './TreeView.module.css'

interface Props {
  people: Person[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface TreeNode {
  person: Person
  children: TreeNode[]
}

const NODE_WIDTH = 160
const NODE_HEIGHT = 70
const NODE_GAP_X = 40
const NODE_GAP_Y = 80

export default function TreeView({ people, selectedId, onSelect }: Props) {
  const { style: zoomStyle, handlers } = useZoomPan()

  const { nodes, links, width, height } = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]))
    const childrenMap = new Map<string, Person[]>()
    const roots: Person[] = []

    for (const p of people) {
      if (!p.managerId || !byId.has(p.managerId)) {
        roots.push(p)
      } else {
        const list = childrenMap.get(p.managerId) ?? []
        list.push(p)
        childrenMap.set(p.managerId, list)
      }
    }

    function buildTree(person: Person): TreeNode {
      const children = (childrenMap.get(person.id) ?? []).map(buildTree)
      return { person, children }
    }

    // Create a virtual root if multiple roots
    const virtualRoot: TreeNode = {
      person: { id: '__root__', name: '', role: '', discipline: '', managerId: '', team: '', additionalTeams: [], status: 'Active' },
      children: roots.map(buildTree),
    }

    const root = hierarchy(virtualRoot, (d) => d.children)
    const treeLayout = tree<TreeNode>().nodeSize([NODE_WIDTH + NODE_GAP_X, NODE_HEIGHT + NODE_GAP_Y])
    treeLayout(root)

    const nodes = root.descendants().filter((d) => d.data.person.id !== '__root__')
    const links = root.links().filter((l) => l.source.data.person.id !== '__root__')

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      if (n.x! < minX) minX = n.x!
      if (n.x! > maxX) maxX = n.x!
      if (n.y! > maxY) maxY = n.y!
    }

    const width = maxX - minX + NODE_WIDTH + 100
    const height = maxY + NODE_HEIGHT + 100

    // Offset so nothing is negative
    const offsetX = -minX + 50
    for (const n of root.descendants()) {
      n.x = (n.x ?? 0) + offsetX
    }

    return { nodes, links, width, height }
  }, [people])

  return (
    <div className={styles.container} {...handlers}>
      <div style={zoomStyle}>
        <svg className={styles.edges} width={width} height={height}>
          {links.map((link, i) => (
            <line
              key={i}
              x1={link.source.x!}
              y1={link.source.y! + NODE_HEIGHT / 2}
              x2={link.target.x!}
              y2={link.target.y! - NODE_HEIGHT / 2 + 10}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        {nodes.map((node) => (
          <div
            key={node.data.person.id}
            className={styles.nodeWrapper}
            style={{
              left: node.x! - NODE_WIDTH / 2,
              top: node.y! - NODE_HEIGHT / 2,
              width: NODE_WIDTH,
            }}
          >
            <PersonNode
              person={node.data.person}
              selected={node.data.person.id === selectedId}
              onClick={() => onSelect(node.data.person.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

```css
/* web/src/views/TreeView.module.css */
.container {
  flex: 1;
  overflow: hidden;
  position: relative;
  cursor: grab;
}

.container:active {
  cursor: grabbing;
}

.edges {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.nodeWrapper {
  position: absolute;
}
```

- [ ] **Step 4: Wire TreeView into App.tsx**

Update the `viewMode === 'tree'` branch in `App.tsx`:

```tsx
{viewMode === 'tree' && (
  <TreeView people={people} selectedId={selectedId} onSelect={setSelectedId} />
)}
```

Add the import: `import TreeView from './views/TreeView'`

- [ ] **Step 5: Verify build**

```bash
cd web && npm run build
```

Expected: builds successfully.

- [ ] **Step 6: Manual smoke test**

```bash
make build && ./orgchart serve
```

Upload `testdata/crossteam.csv`, verify tree renders with nodes positioned in hierarchy. Zoom/pan with scroll wheel and mouse drag. Click a node to select it.

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: add tree view with d3-hierarchy layout, zoom, and pan"
```

---

## Task 9: Compact Column View

**Files:**
- Create: `web/src/views/ColumnView.tsx`
- Create: `web/src/views/ColumnView.module.css`
- Modify: `web/src/App.tsx`

Each team as a CSS grid column with hierarchy preserved via indentation.

- [ ] **Step 1: Create ColumnView**

```tsx
// web/src/views/ColumnView.tsx
import { useMemo } from 'react'
import type { Person } from '../api/types'
import PersonNode from '../components/PersonNode'
import styles from './ColumnView.module.css'

interface Props {
  people: Person[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface IndentedPerson {
  person: Person
  depth: number
}

export default function ColumnView({ people, selectedId, onSelect }: Props) {
  const teams = useMemo(() => {
    const teamOrder: string[] = []
    const teamSet = new Set<string>()
    const teamMembers = new Map<string, Person[]>()
    const childrenMap = new Map<string, Person[]>()

    for (const p of people) {
      if (!teamSet.has(p.team)) {
        teamSet.add(p.team)
        teamOrder.push(p.team)
      }
      const list = teamMembers.get(p.team) ?? []
      list.push(p)
      teamMembers.set(p.team, list)

      if (p.managerId) {
        const children = childrenMap.get(p.managerId) ?? []
        children.push(p)
        childrenMap.set(p.managerId, children)
      }
    }

    return teamOrder.map((team) => {
      const members = teamMembers.get(team) ?? []
      const memberIds = new Set(members.map((m) => m.id))

      // Find roots within this team (no manager or manager not in this team)
      const roots = members.filter(
        (m) => !m.managerId || !memberIds.has(m.managerId)
      )

      const ordered: IndentedPerson[] = []
      function walk(person: Person, depth: number) {
        ordered.push({ person, depth })
        const children = (childrenMap.get(person.id) ?? [])
          .filter((c) => memberIds.has(c.id))
        for (const child of children) {
          walk(child, depth + 1)
        }
      }
      for (const root of roots) {
        walk(root, 0)
      }

      return { team, people: ordered }
    })
  }, [people])

  return (
    <div className={styles.container}>
      {teams.map(({ team, people: ordered }) => (
        <div key={team} className={styles.column}>
          <div className={styles.header}>{team}</div>
          {ordered.map(({ person, depth }) => (
            <div
              key={person.id}
              className={styles.row}
              style={{ paddingLeft: depth * 20 + 8 }}
            >
              <PersonNode
                person={person}
                selected={person.id === selectedId}
                onClick={() => onSelect(person.id)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

```css
/* web/src/views/ColumnView.module.css */
.container {
  display: flex;
  gap: 16px;
  padding: 24px;
  overflow-x: auto;
  align-items: flex-start;
}

.column {
  min-width: 180px;
  flex-shrink: 0;
}

.header {
  font-weight: 600;
  font-size: 14px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 2px solid #60a5fa;
}

.row {
  margin-bottom: 6px;
}
```

- [ ] **Step 2: Wire into App.tsx**

Replace the `viewMode === 'columns'` placeholder:

```tsx
{viewMode === 'columns' && (
  <ColumnView people={people} selectedId={selectedId} onSelect={setSelectedId} />
)}
```

Add import: `import ColumnView from './views/ColumnView'`

- [ ] **Step 3: Verify build and smoke test**

```bash
cd web && npm run build && cd .. && make build && ./orgchart serve
```

Upload CSV, switch to Columns tab. Verify teams appear as columns, people indented by hierarchy.

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: add compact column view with hierarchical indentation"
```

---

## Task 10: Detail Sidebar + Add/Delete

**Files:**
- Create: `web/src/components/DetailSidebar.tsx`
- Create: `web/src/components/DetailSidebar.module.css`
- Create: `web/src/components/UnparentedBar.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.module.css`

Click-to-edit sidebar, add person, delete person, and the unparented notification bar.

- [ ] **Step 1: Create DetailSidebar**

```tsx
// web/src/components/DetailSidebar.tsx
import { useState, useEffect } from 'react'
import { useOrg } from '../store/OrgContext'
import type { Person } from '../api/types'
import styles from './DetailSidebar.module.css'

export default function DetailSidebar() {
  const { working, selectedId, setSelectedId, update, remove, add } = useOrg()
  const [isAdding, setIsAdding] = useState(false)
  const person = working.find((p) => p.id === selectedId) ?? null

  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (person) {
      setForm({
        name: person.name,
        role: person.role,
        discipline: person.discipline,
        team: person.team,
        status: person.status,
      })
      setIsAdding(false)
    }
  }, [person])

  const handleChange = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSave = async () => {
    if (isAdding) {
      await add({
        name: form.name || 'New Person',
        role: form.role || '',
        discipline: form.discipline || '',
        managerId: '',
        team: form.team || 'Unassigned',
        additionalTeams: [],
        status: (form.status as Person['status']) || 'Active',
      })
      setIsAdding(false)
      setSelectedId(null)
    } else if (person) {
      await update(person.id, form)
    }
  }

  const handleDelete = async () => {
    if (!person) return
    const reports = working.filter((p) => p.managerId === person.id)
    const msg = reports.length > 0
      ? `Remove ${person.name}? Their ${reports.length} report(s) will become unassigned.`
      : `Remove ${person.name}?`
    if (confirm(msg)) {
      await remove(person.id)
    }
  }

  const startAdd = () => {
    setSelectedId(null)
    setIsAdding(true)
    setForm({ name: '', role: '', discipline: '', team: '', status: 'Active' })
  }

  if (!person && !isAdding) {
    return (
      <aside className={styles.sidebar}>
        <div className={styles.empty}>
          <p>Click a person to edit</p>
          <button className={styles.addBtn} onClick={startAdd}>+ Add Person</button>
        </div>
      </aside>
    )
  }

  const fields = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'discipline', label: 'Discipline' },
    { key: 'team', label: 'Team' },
    { key: 'status', label: 'Status' },
  ]

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3>{isAdding ? 'Add Person' : 'Edit Person'}</h3>
        <button className={styles.closeBtn} onClick={() => { setSelectedId(null); setIsAdding(false) }}>×</button>
      </div>
      <div className={styles.form}>
        {fields.map(({ key, label }) => (
          <label key={key} className={styles.field}>
            <span>{label}</span>
            <input
              value={form[key] ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <button className={styles.saveBtn} onClick={handleSave}>
          {isAdding ? 'Add' : 'Save'}
        </button>
        {!isAdding && (
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
        )}
      </div>
    </aside>
  )
}
```

```css
/* web/src/components/DetailSidebar.module.css */
.sidebar {
  width: 280px;
  border-left: 1px solid #e0e0e0;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
}

.empty {
  padding: 24px 16px;
  color: #888;
  text-align: center;
}

.addBtn {
  margin-top: 12px;
  padding: 6px 14px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.header h3 {
  margin: 0;
  font-size: 15px;
}

.closeBtn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #888;
}

.form {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  color: #555;
}

.field input {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
}

.actions {
  padding: 12px 16px;
  display: flex;
  gap: 8px;
}

.saveBtn {
  flex: 1;
  padding: 6px 0;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.deleteBtn {
  padding: 6px 12px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

- [ ] **Step 2: Create UnparentedBar**

```tsx
// web/src/components/UnparentedBar.tsx
import { useMemo } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './DetailSidebar.module.css'

export default function UnparentedBar() {
  const { working, setSelectedId } = useOrg()

  const unparented = useMemo(
    () => working.filter((p) => !p.managerId && working.some((other) => other.id !== p.id)),
    [working],
  )

  // Only show if there are unparented people who aren't the only person
  // A more precise check: people who have no manager AND are not expected roots
  // For now, show all people with empty managerId
  const orphans = useMemo(
    () => working.filter((p) => !p.managerId),
    [working],
  )

  if (orphans.length <= 1) return null

  return (
    <div style={{
      padding: '6px 16px', background: '#fef3c7', borderBottom: '1px solid #fcd34d',
      fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    }}>
      <strong>{orphans.length} root/unparented people:</strong>
      {orphans.map((p) => (
        <button
          key={p.id}
          onClick={() => setSelectedId(p.id)}
          style={{
            background: 'none', border: '1px solid #d97706', borderRadius: 3,
            padding: '1px 6px', cursor: 'pointer', fontSize: 12,
          }}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx layout**

Update `App.tsx` to include the sidebar and unparented bar:

```tsx
// Updated App.tsx
import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import Toolbar from './components/Toolbar'
import UploadPrompt from './components/UploadPrompt'
import DetailSidebar from './components/DetailSidebar'
import UnparentedBar from './components/UnparentedBar'
import HeadcountView from './views/HeadcountView'
import TreeView from './views/TreeView'
import ColumnView from './views/ColumnView'

function AppContent() {
  const { loaded, working, original, viewMode, dataView, selectedId, setSelectedId } = useOrg()

  if (!loaded) {
    return (
      <div className={styles.app}>
        <header className={styles.toolbar}>Org Chart</header>
        <main className={styles.main}>
          <UploadPrompt />
        </main>
      </div>
    )
  }

  const people = dataView === 'original' ? original : working

  return (
    <div className={styles.app}>
      <Toolbar />
      <UnparentedBar />
      <div className={styles.body}>
        <main className={styles.main}>
          {viewMode === 'headcount' && <HeadcountView people={people} />}
          {viewMode === 'tree' && (
            <TreeView people={people} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {viewMode === 'columns' && (
            <ColumnView people={people} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </main>
        <DetailSidebar />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <OrgProvider>
      <AppContent />
    </OrgProvider>
  )
}
```

Update `App.module.css` to add the body layout:

```css
/* web/src/App.module.css */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  font-weight: 600;
  flex-shrink: 0;
}

.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main {
  flex: 1;
  overflow: auto;
}
```

- [ ] **Step 4: Verify build and smoke test**

```bash
cd web && npm run build && cd .. && make build && ./orgchart serve
```

Upload a CSV. Click a node — sidebar opens with edit fields. Edit a name, click Save. Add a new person. Delete someone and verify the unparented bar appears.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add detail sidebar, add/delete person, unparented tracking"
```

---

## Task 11: Change Detection + Diff Mode

**Files:**
- Create: `web/src/hooks/useOrgDiff.ts`
- Modify: `web/src/components/PersonNode.tsx`
- Modify: `web/src/components/PersonNode.module.css`
- Modify: `web/src/views/TreeView.tsx`
- Modify: `web/src/views/ColumnView.tsx`

Automatic diff computation and visual annotations on nodes.

- [ ] **Step 1: Create useOrgDiff hook**

```ts
// web/src/hooks/useOrgDiff.ts
import { useMemo } from 'react'
import type { Person } from '../api/types'

export type ChangeType = 'added' | 'removed' | 'reporting' | 'title' | 'reorg'

export interface PersonChange {
  types: Set<ChangeType>
}

export function useOrgDiff(original: Person[], working: Person[]): Map<string, PersonChange> {
  return useMemo(() => {
    const changes = new Map<string, PersonChange>()
    const origById = new Map(original.map((p) => [p.id, p]))
    const workById = new Map(working.map((p) => [p.id, p]))

    // Check working people against original
    for (const w of working) {
      const o = origById.get(w.id)
      const types = new Set<ChangeType>()

      if (!o) {
        types.add('added')
      } else {
        if (w.managerId !== o.managerId) types.add('reporting')
        if (w.role !== o.role || w.discipline !== o.discipline) types.add('title')
        if (w.team !== o.team) types.add('reorg')
      }

      if (types.size > 0) {
        changes.set(w.id, { types })
      }
    }

    // Check for removed people
    for (const o of original) {
      if (!workById.has(o.id)) {
        changes.set(o.id, { types: new Set(['removed']) })
      }
    }

    return changes
  }, [original, working])
}
```

- [ ] **Step 2: Update PersonNode to accept change annotations**

Add `changes` prop to `PersonNode`:

```tsx
// web/src/components/PersonNode.tsx — updated
import styles from './PersonNode.module.css'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'

interface Props {
  person: Person
  selected?: boolean
  ghost?: boolean
  changes?: PersonChange
  onClick?: () => void
}

export default function PersonNode({ person, selected, ghost, changes, onClick }: Props) {
  const isHiring = person.status === 'Hiring' || person.status === 'Open'
  const isTransfer = person.status === 'Transfer'

  const classNames = [
    styles.node,
    selected && styles.selected,
    isHiring && styles.hiring,
    isTransfer && styles.transfer,
    ghost && styles.ghost,
    changes?.types.has('added') && styles.added,
    changes?.types.has('reporting') && styles.reporting,
    changes?.types.has('title') && styles.titleChange,
    changes?.types.has('reorg') && styles.reorg,
  ].filter(Boolean).join(' ')

  const prefix = isHiring ? '\u{1F535} ' : isTransfer ? '\u{1F7E1} ' : ''

  return (
    <div className={classNames} onClick={onClick}>
      <div className={styles.name}>{prefix}{person.name}</div>
      <div className={styles.role}>{person.role || 'TBD'}</div>
    </div>
  )
}
```

Add annotation styles to `PersonNode.module.css`:

```css
/* Append to PersonNode.module.css */
.added {
  border-color: #22c55e;
  background: #f0fdf4;
}

.reporting {
  border-color: #f97316;
  background: #fff7ed;
}

.titleChange {
  border-color: #3b82f6;
  background: #eff6ff;
}

.reorg {
  border-color: #eab308;
  background: #fefce8;
}

.ghost {
  opacity: 0.4;
  border-style: dashed;
  text-decoration: line-through;
}
```

- [ ] **Step 3: Wire diff into views**

Update `App.tsx` to compute and pass changes. In `AppContent`:

```tsx
import { useOrgDiff } from './hooks/useOrgDiff'

// Inside AppContent:
const changes = useOrgDiff(original, working)
const showChanges = dataView === 'diff'

// Build ghost people for diff mode (removed from working)
const ghostPeople = showChanges
  ? original.filter((o) => !working.find((w) => w.id === o.id))
  : []
```

Pass `changes` and `showChanges` props to TreeView and ColumnView. Each view passes `changes={showChanges ? changes.get(person.id) : undefined}` to `PersonNode`.

For ghost nodes in diff mode, append `ghostPeople` to the `people` array passed to views, with a `ghost` flag.

- [ ] **Step 4: Verify build and test diff mode**

```bash
cd web && npm run build && cd .. && make build && ./orgchart serve
```

Upload CSV, make some edits (change someone's team, delete someone), then switch to Diff view. Verify:
- Changed nodes show colored borders
- Deleted people appear as ghost nodes (faded, strikethrough)
- Original view shows unedited data

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add change detection, diff annotations, and ghost nodes"
```

---

## Task 12: Drag-and-Drop (Tree View)

**Files:**
- Create: `web/src/hooks/useDragDrop.ts`
- Modify: `web/src/views/TreeView.tsx`
- Modify: `web/src/components/PersonNode.tsx`

Integrates dnd-kit for single-node drag-and-drop in the tree view. Drop a node onto another node to change its manager.

- [ ] **Step 1: Create useDragDrop hook**

```ts
// web/src/hooks/useDragDrop.ts
import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useOrg } from '../store/OrgContext'

export function useDragDrop() {
  const { move, working } = useOrg()

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const targetId = over.id as string
    const target = working.find((p) => p.id === targetId)
    if (!target) return

    await move(draggedId, targetId, target.team)
  }, [move, working])

  return { onDragEnd }
}
```

- [ ] **Step 2: Make PersonNode draggable and droppable**

Wrap PersonNode usage in TreeView with dnd-kit's `useDraggable` and `useDroppable`. Create a wrapper component:

```tsx
// In TreeView.tsx, add DraggableNode wrapper
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import { useDragDrop } from '../hooks/useDragDrop'

function DraggableNode({ person, selected, changes, onSelect }: {
  person: Person
  selected: boolean
  changes?: PersonChange
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: person.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: person.id })

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0.5 : 1,
        outline: isOver ? '2px solid #22c55e' : 'none',
        borderRadius: 6,
      }}
    >
      <PersonNode
        person={person}
        selected={selected}
        changes={changes}
        onClick={onSelect}
      />
    </div>
  )
}
```

Wrap the tree content in `<DndContext onDragEnd={onDragEnd}>`.

- [ ] **Step 3: Add shift+drag for subtree**

Extend the drag data to include a `subtree` flag. When shift is held during drag start, collect all descendants and pass them as a group. On drop, move the root person and all descendants maintain their relative structure — only the root's `managerId` changes.

In `useDragDrop`, check `event.active.data.current?.subtree` and batch-move all people in the subtree by updating only the root person's manager.

- [ ] **Step 4: Verify build and test**

```bash
cd web && npm run build && cd .. && make build && ./orgchart serve
```

Upload CSV, drag a node onto another node. Verify the reporting line changes. Try shift+drag to move a subtree.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add drag-and-drop in tree view (single node + subtree)"
```

---

## Task 13: Drag-and-Drop (Column View)

**Files:**
- Modify: `web/src/views/ColumnView.tsx`

Adds dnd-kit to the column view: drag between columns to change team, drag onto a person within a column to change manager.

- [ ] **Step 1: Wrap ColumnView in DndContext**

Similar to TreeView, wrap each person in a draggable/droppable wrapper. Also make team headers droppable targets.

When a person is dropped:
- Onto a person in a **different column** → change team and manager
- Onto a person in the **same column** → change manager only
- Onto a **team header** → change team, clear manager (becomes root of that team)

- [ ] **Step 2: Add team header drag for moving entire teams**

Make team headers draggable. When a team header is dropped onto another team's column, all members of the dragged team get their team field updated.

- [ ] **Step 3: Test**

Upload CSV, switch to Columns view. Drag a person between columns. Drag within a column. Drag a team header.

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: add drag-and-drop in column view"
```

---

## Task 14: Image Export + Export Dropdown

**Files:**
- Create: `web/src/hooks/useExport.ts`
- Modify: `web/src/components/Toolbar.tsx`

PNG/SVG export via html-to-image (client-side) and data export links (server-side, already wired).

- [ ] **Step 1: Create useExport hook**

```ts
// web/src/hooks/useExport.ts
import { useCallback } from 'react'
import { toPng, toSvg } from 'html-to-image'

export function useExport(mainRef: React.RefObject<HTMLElement | null>) {
  const exportPng = useCallback(async () => {
    if (!mainRef.current) return
    const dataUrl = await toPng(mainRef.current, { backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = 'orgchart.png'
    link.href = dataUrl
    link.click()
  }, [mainRef])

  const exportSvg = useCallback(async () => {
    if (!mainRef.current) return
    const dataUrl = await toSvg(mainRef.current, { backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = 'orgchart.svg'
    link.href = dataUrl
    link.click()
  }, [mainRef])

  return { exportPng, exportSvg }
}
```

- [ ] **Step 2: Add ref to main area in App.tsx**

```tsx
const mainRef = useRef<HTMLElement>(null)
// ...
<main className={styles.main} ref={mainRef}>
```

Pass `mainRef` to Toolbar (or use context).

- [ ] **Step 3: Update Toolbar with export dropdown**

Replace the static export links with buttons that call `useExport` for PNG/SVG and use anchor links for CSV/XLSX.

- [ ] **Step 4: Test all four export types**

Upload CSV, make edits, export as PNG, SVG, CSV, XLSX. Verify:
- PNG/SVG capture the current view
- CSV/XLSX contain the working data with name-based manager references

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add PNG/SVG/CSV/XLSX export"
```

---

## Task 15: Integration Testing + Polish

**Files:**
- Modify: `integration_test.go` (add web API tests)

End-to-end test of the upload → mutate → export round-trip via the HTTP API.

- [ ] **Step 1: Write integration test for API round-trip**

```go
// Add to integration_test.go
func TestIntegration_WebAPI_RoundTrip(t *testing.T) {
	svc := api.NewOrgService()
	handler := api.NewRouter(svc)

	// Upload
	csvData := readFile(t, "testdata/simple.csv")
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "simple.csv")
	part.Write(csvData)
	writer.Close()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}

	var data api.OrgData
	json.NewDecoder(rec.Body).Decode(&data)
	if len(data.Working) != 3 {
		t.Fatalf("expected 3 people, got %d", len(data.Working))
	}

	// Update a person's role
	bob := findAPIByName(data.Working, "Bob")
	payload := fmt.Sprintf(`{"personId":"%s","fields":{"role":"Staff Engineer"}}`, bob.Id)
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/update", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("update: %d %s", rec.Code, rec.Body.String())
	}

	// Export CSV
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/export/csv", nil)
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("export: %d", rec.Code)
	}

	exported := rec.Body.String()
	if !strings.Contains(exported, "Staff Engineer") {
		t.Error("expected exported CSV to contain updated role")
	}
	if !strings.Contains(exported, "Alice") {
		t.Error("expected exported CSV to contain Alice")
	}
}
```

- [ ] **Step 2: Run integration tests**

```bash
go test -run TestIntegration_WebAPI -v
```

Expected: PASS.

- [ ] **Step 3: Run all tests (existing + new)**

```bash
go test ./... -v
```

Expected: all pass. Existing CLI tests are unaffected.

- [ ] **Step 4: Final build verification**

```bash
make clean && make build
./orgchart serve &
sleep 1
curl -s http://localhost:8080/api/org -w "%{http_code}" | tail -1  # expect 204
kill %1
./orgchart people testdata/simple.csv | head -1  # expect "flowchart TD" — CLI still works
```

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add web API integration tests, verify full round-trip"
```

---

## Summary

| Task | What it delivers | Key files |
|------|-----------------|-----------|
| 1 | Build infrastructure (Vite, Makefile, go:embed) | `Makefile`, `embed.go`, `web/` scaffold |
| 2 | API model + UUID conversion | `internal/api/model.go`, `convert.go` |
| 3 | Org service (state + 4 mutations) | `internal/api/service.go` |
| 4 | HTTP handlers + serve command | `internal/api/handlers.go`, `cmd/serve.go` |
| 5 | CSV/XLSX export | `internal/api/export.go` |
| 6 | Frontend types, API client, org store, upload UI | `web/src/api/`, `web/src/store/` |
| 7 | Toolbar + headcount view (first end-to-end view) | `web/src/components/Toolbar.tsx`, `views/HeadcountView.tsx` |
| 8 | Tree view (d3-hierarchy, zoom/pan) | `web/src/views/TreeView.tsx` |
| 9 | Compact column view | `web/src/views/ColumnView.tsx` |
| 10 | Detail sidebar, add/delete, unparented bar | `web/src/components/DetailSidebar.tsx` |
| 11 | Change detection + diff mode + ghost nodes | `web/src/hooks/useOrgDiff.ts` |
| 12 | Drag-and-drop (tree view) | `web/src/hooks/useDragDrop.ts` |
| 13 | Drag-and-drop (column view) | `web/src/views/ColumnView.tsx` |
| 14 | Image + data export UI | `web/src/hooks/useExport.ts` |
| 15 | Integration tests + polish | `integration_test.go` |
