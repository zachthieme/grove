# Smart Column Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-infer spreadsheet column mappings on upload; when inference is low confidence, show a mapping UI pre-filled with best guesses for the user to correct.

**Architecture:** New `InferMapping` function on the backend matches headers to app fields via exact, synonym, and fuzzy tiers. Upload handler returns either auto-loaded org data or a mapping proposal. A new `/api/upload/confirm` endpoint accepts user-corrected mappings. `BuildPeople` gains a `BuildPeopleWithMapping` variant. Frontend gets a `ColumnMappingModal` component.

**Tech Stack:** Go net/http, React, TypeScript, CSS modules

**Spec:** `docs/superpowers/specs/2026-03-21-column-mapping-design.md`

---

## File Structure

### Backend (new)

| File | Responsibility |
|------|---------------|
| `internal/api/infer.go` | `InferMapping(headers)` function — three-tier matching (exact, synonym, fuzzy), returns `map[string]MappedColumn` |
| `internal/api/infer_test.go` | Tests for all matching tiers and edge cases |

### Backend (modified)

| File | Changes |
|------|---------|
| `internal/api/model.go` | Add `MappedColumn` and `UploadResponse` types |
| `internal/api/service.go` | Add `pendingFile`/`pendingFilename` fields; refactor `Upload` to run inference; add `ConfirmMapping` method |
| `internal/api/service_test.go` | Tests for pending file flow, ConfirmMapping |
| `internal/api/handlers.go` | Refactor `handleUpload` for new response; add `handleConfirmMapping` and route |
| `internal/api/handlers_test.go` | Update upload test; add confirm-mapping tests |
| `internal/parser/parser.go` | Add `BuildPeopleWithMapping(header, dataRows, mapping)` function |
| `internal/parser/parser_test.go` | Test BuildPeopleWithMapping |

### Frontend (new)

| File | Responsibility |
|------|---------------|
| `web/src/components/ColumnMappingModal.tsx` | Modal overlay for mapping columns to app fields |
| `web/src/components/ColumnMappingModal.module.css` | Modal styling |

### Frontend (modified)

| File | Changes |
|------|---------|
| `web/src/api/types.ts` | Add `MappedColumn`, `UploadResponse` types |
| `web/src/api/client.ts` | Update `uploadFile` return type; add `confirmMapping` |
| `web/src/store/OrgContext.tsx` | Handle both upload response shapes; add pending mapping state; `confirmMapping`/`cancelMapping` actions |
| `web/src/App.tsx` | Render ColumnMappingModal when mapping is pending |

---

## Task 1: Backend — InferMapping Function

**Files:**
- Create: `internal/api/infer.go`
- Create: `internal/api/infer_test.go`
- Modify: `internal/api/model.go` — add `MappedColumn` type

The core inference logic, independent of the rest of the system.

- [ ] **Step 1: Add MappedColumn type to model.go**

```go
// Add to internal/api/model.go
type MappedColumn struct {
	Column     string `json:"column"`
	Confidence string `json:"confidence"` // "high", "medium", "none"
}
```

- [ ] **Step 2: Write failing tests for InferMapping**

```go
// internal/api/infer_test.go
package api

import "testing"

func TestInferMapping_ExactMatch(t *testing.T) {
	headers := []string{"Name", "Role", "Discipline", "Manager", "Team", "Status"}
	m := InferMapping(headers)

	checks := map[string]struct{ col, conf string }{
		"name":       {"Name", "high"},
		"role":       {"Role", "high"},
		"discipline": {"Discipline", "high"},
		"manager":    {"Manager", "high"},
		"team":       {"Team", "high"},
		"status":     {"Status", "high"},
	}
	for field, want := range checks {
		got := m[field]
		if got.Column != want.col {
			t.Errorf("%s: expected column %q, got %q", field, want.col, got.Column)
		}
		if got.Confidence != want.conf {
			t.Errorf("%s: expected confidence %q, got %q", field, want.conf, got.Confidence)
		}
	}
}

func TestInferMapping_SynonymMatch(t *testing.T) {
	headers := []string{"Full Name", "Job Title", "Department", "Reports To", "Function", "Employee Status"}
	m := InferMapping(headers)

	if m["name"].Column != "Full Name" || m["name"].Confidence != "high" {
		t.Errorf("name: got %+v", m["name"])
	}
	if m["role"].Column != "Job Title" || m["role"].Confidence != "high" {
		t.Errorf("role: got %+v", m["role"])
	}
	if m["team"].Column != "Department" || m["team"].Confidence != "high" {
		t.Errorf("team: got %+v", m["team"])
	}
	if m["manager"].Column != "Reports To" || m["manager"].Confidence != "high" {
		t.Errorf("manager: got %+v", m["manager"])
	}
	if m["discipline"].Column != "Function" || m["discipline"].Confidence != "high" {
		t.Errorf("discipline: got %+v", m["discipline"])
	}
	if m["status"].Column != "Employee Status" || m["status"].Confidence != "high" {
		t.Errorf("status: got %+v", m["status"])
	}
}

func TestInferMapping_FuzzyMatch(t *testing.T) {
	headers := []string{"employee_name", "role_title", "team_dept", "current_status"}
	m := InferMapping(headers)

	if m["name"].Column != "employee_name" || m["name"].Confidence != "medium" {
		t.Errorf("name: got %+v", m["name"])
	}
	if m["role"].Column != "role_title" || m["role"].Confidence != "medium" {
		t.Errorf("role: got %+v", m["role"])
	}
	if m["team"].Column != "team_dept" || m["team"].Confidence != "medium" {
		t.Errorf("team: got %+v", m["team"])
	}
	if m["status"].Column != "current_status" || m["status"].Confidence != "medium" {
		t.Errorf("status: got %+v", m["status"])
	}
}

func TestInferMapping_Unmatched(t *testing.T) {
	headers := []string{"foo", "bar", "baz"}
	m := InferMapping(headers)

	for _, field := range []string{"name", "role", "discipline", "team", "status"} {
		if m[field].Confidence != "none" {
			t.Errorf("%s: expected none confidence, got %q", field, m[field].Confidence)
		}
	}
}

func TestInferMapping_CaseInsensitive(t *testing.T) {
	headers := []string{"NAME", "ROLE", "discipline", "Team", "STATUS"}
	m := InferMapping(headers)

	for _, field := range []string{"name", "role", "discipline", "team", "status"} {
		if m[field].Confidence != "high" {
			t.Errorf("%s: expected high confidence, got %q", field, m[field].Confidence)
		}
	}
}

func TestAllRequiredHigh(t *testing.T) {
	headers := []string{"Name", "Role", "Discipline", "Team", "Status"}
	m := InferMapping(headers)
	if !AllRequiredHigh(m) {
		t.Error("expected all required to be high")
	}

	headers2 := []string{"Full Name", "Title", "Dept"}
	m2 := InferMapping(headers2)
	if AllRequiredHigh(m2) {
		t.Error("expected not all required high (missing discipline, status)")
	}
}
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
go test ./internal/api/ -run "TestInferMapping\|TestAllRequired" -v
```

- [ ] **Step 4: Implement InferMapping**

```go
// internal/api/infer.go
package api

import "strings"

// App field names (lowercase keys used in mapping)
var appFields = []string{
	"name", "role", "discipline", "manager", "team", "status",
	"additionalTeams", "newRole", "newTeam",
}

var requiredFields = []string{"name", "role", "discipline", "team", "status"}

// Exact match: lowercase field name → header (case-insensitive)
var exactNames = map[string]string{
	"name": "name", "role": "role", "discipline": "discipline",
	"manager": "manager", "team": "team", "status": "status",
	"additional teams": "additionalTeams", "new role": "newRole", "new team": "newTeam",
}

// Synonyms: lowercase synonym → app field
var synonyms = map[string]string{
	"full name": "name", "person": "name", "employee": "name", "employee name": "name",
	"title": "role", "job title": "role", "position": "role",
	"function": "discipline", "job family": "discipline", "job function": "discipline",
	"reports to": "manager", "supervisor": "manager", "manager name": "manager", "reporting to": "manager",
	"department": "team", "group": "team", "org": "team", "organization": "team",
	"employment status": "status", "employee status": "status",
	"other teams": "additionalTeams", "secondary teams": "additionalTeams",
	"future role": "newRole", "planned role": "newRole",
	"future team": "newTeam", "planned team": "newTeam",
}

// Fuzzy keywords: substring → app field (checked in order, longer field names first to avoid ambiguity)
var fuzzyKeywords = []struct {
	keyword string
	field   string
}{
	{"discipline", "discipline"},
	{"additional", "additionalTeams"},
	{"manager", "manager"},
	{"status", "status"},
	{"name", "name"},
	{"role", "role"},
	{"team", "team"},
}

func InferMapping(headers []string) map[string]MappedColumn {
	result := make(map[string]MappedColumn)
	for _, f := range appFields {
		result[f] = MappedColumn{Column: "", Confidence: "none"}
	}

	assigned := make(map[string]bool) // track which app fields are already mapped

	// Pass 1: exact match
	for _, h := range headers {
		norm := strings.TrimSpace(strings.ToLower(h))
		if field, ok := exactNames[norm]; ok && !assigned[field] {
			result[field] = MappedColumn{Column: h, Confidence: "high"}
			assigned[field] = true
		}
	}

	// Pass 2: synonym match
	for _, h := range headers {
		norm := strings.TrimSpace(strings.ToLower(h))
		if field, ok := synonyms[norm]; ok && !assigned[field] {
			result[field] = MappedColumn{Column: h, Confidence: "high"}
			assigned[field] = true
		}
	}

	// Pass 3: fuzzy (substring containment)
	for _, h := range headers {
		norm := strings.ToLower(h)
		for _, fk := range fuzzyKeywords {
			if !assigned[fk.field] && strings.Contains(norm, fk.keyword) {
				result[fk.field] = MappedColumn{Column: h, Confidence: "medium"}
				assigned[fk.field] = true
				break
			}
		}
	}

	return result
}

func AllRequiredHigh(m map[string]MappedColumn) bool {
	for _, f := range requiredFields {
		if m[f].Confidence != "high" {
			return false
		}
	}
	return true
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
go test ./internal/api/ -run "TestInferMapping\|TestAllRequired" -v
```

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: add InferMapping with exact, synonym, and fuzzy matching"
```

---

## Task 2: Backend — BuildPeopleWithMapping

**Files:**
- Modify: `internal/parser/parser.go`
- Modify: `internal/parser/parser_test.go`

Add a variant of `BuildPeople` that accepts an explicit column mapping instead of matching by header name.

- [ ] **Step 1: Write failing test**

```go
// Add to internal/parser/parser_test.go
func TestBuildPeopleWithMapping(t *testing.T) {
	header := []string{"Full Name", "Job Title", "Dept", "Supervisor", "Function", "State"}
	rows := [][]string{
		{"Alice", "VP", "Engineering", "", "Eng", "Active"},
		{"Bob", "Engineer", "Platform", "Alice", "Eng", "Active"},
	}
	mapping := map[string]string{
		"name":       "Full Name",
		"role":       "Job Title",
		"discipline": "Function",
		"manager":    "Supervisor",
		"team":       "Dept",
		"status":     "State",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Fatalf("expected 2 people, got %d", len(org.People))
	}
	if org.People[0].Name != "Alice" {
		t.Errorf("expected Alice, got %s", org.People[0].Name)
	}
	if org.People[1].Manager != "Alice" {
		t.Errorf("expected Bob's manager to be Alice, got %s", org.People[1].Manager)
	}
	if org.People[0].Team != "Engineering" {
		t.Errorf("expected team Engineering, got %s", org.People[0].Team)
	}
}
```

- [ ] **Step 2: Implement BuildPeopleWithMapping**

Add to `internal/parser/parser.go`:

```go
// BuildPeopleWithMapping is like BuildPeople but uses an explicit column mapping
// instead of matching by header name. The mapping keys are lowercase app field names
// ("name", "role", etc.), values are the actual header strings from the spreadsheet.
func BuildPeopleWithMapping(header []string, dataRows [][]string, mapping map[string]string) (*model.Org, error) {
	// Build column index from the mapping
	headerIndex := make(map[string]int)
	for i, h := range header {
		headerIndex[h] = i
	}

	cols := make(map[string]int)
	for field, headerName := range mapping {
		if headerName == "" {
			continue
		}
		if idx, ok := headerIndex[headerName]; ok {
			cols[field] = idx
		}
	}

	required := []string{"name", "role", "discipline", "team", "status"}
	for _, r := range required {
		if _, ok := cols[r]; !ok {
			return nil, fmt.Errorf("required field '%s' is not mapped to a column", r)
		}
	}

	var people []model.Person
	for _, row := range dataRows {
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
			NewRole:    get("newRole"),
			NewTeam:    get("newTeam"),
		}

		raw := get("additionalTeams")
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

- [ ] **Step 3: Run tests**

```bash
go test ./internal/parser/ -v
```

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: add BuildPeopleWithMapping for custom column mappings"
```

---

## Task 3: Backend — Service + Handler Changes

**Files:**
- Modify: `internal/api/model.go` — add `UploadResponse` type
- Modify: `internal/api/service.go` — add pending file fields, refactor Upload, add ConfirmMapping
- Modify: `internal/api/service_test.go` — test new flows
- Modify: `internal/api/handlers.go` — refactor handleUpload, add handleConfirmMapping
- Modify: `internal/api/handlers_test.go` — update tests

- [ ] **Step 1: Add UploadResponse to model.go**

```go
type UploadResponse struct {
	Status  string                  `json:"status"` // "ready" or "needs_mapping"
	OrgData *OrgData                `json:"orgData,omitempty"`
	Headers []string                `json:"headers,omitempty"`
	Mapping map[string]MappedColumn `json:"mapping,omitempty"`
	Preview [][]string              `json:"preview,omitempty"`
}
```

- [ ] **Step 2: Write failing service tests**

```go
func TestOrgService_Upload_AutoProceed(t *testing.T) {
	svc := NewOrgService()
	// Standard headers — should auto-proceed
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload("test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != "ready" {
		t.Errorf("expected status 'ready', got '%s'", resp.Status)
	}
	if resp.OrgData == nil || len(resp.OrgData.Original) != 1 {
		t.Error("expected org data with 1 person")
	}
}

func TestOrgService_Upload_NeedsMapping(t *testing.T) {
	svc := NewOrgService()
	// Non-standard headers — should need mapping
	csv := []byte("Full Name,Job Title,Dept\nAlice,VP,Engineering\n")
	resp, err := svc.Upload("test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Errorf("expected 'needs_mapping', got '%s'", resp.Status)
	}
	if len(resp.Headers) != 3 {
		t.Errorf("expected 3 headers, got %d", len(resp.Headers))
	}
	if resp.Mapping["name"].Column != "Full Name" {
		t.Errorf("expected name mapped to 'Full Name', got '%s'", resp.Mapping["name"].Column)
	}
	if len(resp.Preview) != 2 { // header + 1 data row
		t.Errorf("expected 2 preview rows, got %d", len(resp.Preview))
	}
}

func TestOrgService_ConfirmMapping(t *testing.T) {
	svc := NewOrgService()
	csv := []byte("Full Name,Job Title,Dept,Boss,Function,State\nAlice,VP,Eng,,Eng,Active\nBob,Engineer,Platform,Alice,Eng,Active\n")
	svc.Upload("test.csv", csv)

	mapping := map[string]string{
		"name": "Full Name", "role": "Job Title", "discipline": "Function",
		"manager": "Boss", "team": "Dept", "status": "State",
	}
	orgData, err := svc.ConfirmMapping(mapping)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 people, got %d", len(orgData.Original))
	}
}

func TestOrgService_ConfirmMapping_NoPending(t *testing.T) {
	svc := NewOrgService()
	_, err := svc.ConfirmMapping(map[string]string{"name": "Name"})
	if err == nil {
		t.Error("expected error when no file pending")
	}
}
```

- [ ] **Step 3: Refactor OrgService**

Add fields:
```go
pendingFile     []byte
pendingFilename string
```

Change `Upload` signature to `Upload(filename string, data []byte) (*UploadResponse, error)`:
1. Extract headers from the file (CSV: read first row; XLSX: read first row of first sheet).
2. Run `InferMapping(headers)`.
3. If `AllRequiredHigh(mapping)`: parse with standard BuildPeople, load org, clear pending, return `{status: "ready", orgData: ...}`.
4. Otherwise: store data as pending, extract preview (header + first 3 data rows), return `{status: "needs_mapping", headers, mapping, preview}`.

Add `ConfirmMapping(mapping map[string]string) (*OrgData, error)`:
1. If no pending file, return error.
2. Extract header + data rows from pending file.
3. Call `parser.BuildPeopleWithMapping(header, rows, mapping)`.
4. Convert to API model, store as original + working, clear pending, return OrgData.

Add helper `extractRows(filename string, data []byte) ([]string, [][]string, error)` to extract header and data rows from CSV/XLSX bytes without parsing into model.

- [ ] **Step 4: Update handlers**

Refactor `handleUpload` — the service now returns `*UploadResponse`, so just serialize it:
```go
func handleUpload(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "missing file field", http.StatusBadRequest)
			return
		}
		defer file.Close()

		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "reading file", http.StatusInternalServerError)
			return
		}

		resp, err := svc.Upload(header.Filename, data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		writeJSON(w, http.StatusOK, resp)
	}
}
```

Add new handler and route:
```go
mux.HandleFunc("POST /api/upload/confirm", handleConfirmMapping(svc))

func handleConfirmMapping(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Mapping map[string]string `json:"mapping"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		orgData, err := svc.ConfirmMapping(req.Mapping)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, orgData)
	}
}
```

- [ ] **Step 5: Update existing tests**

The existing `TestUploadHandler` and `uploadCSV` helper expect the old response shape (direct `OrgData`). Update them for the new `UploadResponse` shape:
- `uploadCSV` should decode `UploadResponse`, check `Status == "ready"`, return `resp.OrgData`.
- `TestUploadHandler` should verify `status: "ready"`.
- The existing `TestOrgService_Upload` in service_test.go also needs updating — it currently calls `svc.Upload(...)` expecting just an error. Update to handle the new return type.
- Similarly, `newTestService` helper calls `svc.Upload` — update it.

- [ ] **Step 6: Run all tests**

```bash
go test ./... -v
```

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: smart upload with inference, pending file, and confirm-mapping endpoint"
```

---

## Task 4: Frontend — API Client + Context + Modal

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/store/OrgContext.tsx`
- Create: `web/src/components/ColumnMappingModal.tsx`
- Create: `web/src/components/ColumnMappingModal.module.css`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Update types.ts**

```ts
export interface MappedColumn {
  column: string
  confidence: 'high' | 'medium' | 'none'
}

export interface UploadResponse {
  status: 'ready' | 'needs_mapping'
  orgData?: OrgData
  headers?: string[]
  mapping?: Record<string, MappedColumn>
  preview?: string[][]
}
```

- [ ] **Step 2: Update client.ts**

Change `uploadFile` return type:
```ts
export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  return json<UploadResponse>(resp)
}

export async function confirmMapping(mapping: Record<string, string>): Promise<OrgData> {
  const resp = await fetch(`${BASE}/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  })
  return json<OrgData>(resp)
}
```

- [ ] **Step 3: Update OrgContext**

Add pending mapping state:
```ts
// In OrgState:
pendingMapping: {
  headers: string[]
  mapping: Record<string, MappedColumn>
  preview: string[][]
} | null
```

Update `upload` action:
```ts
const upload = useCallback(async (file: File) => {
  const resp = await api.uploadFile(file)
  if (resp.status === 'ready' && resp.orgData) {
    setState((s) => ({
      ...s,
      original: resp.orgData!.original,
      working: resp.orgData!.working,
      recycled: [],
      loaded: true,
      pendingMapping: null,
    }))
  } else if (resp.status === 'needs_mapping') {
    setState((s) => ({
      ...s,
      pendingMapping: {
        headers: resp.headers!,
        mapping: resp.mapping!,
        preview: resp.preview!,
      },
    }))
  }
}, [])
```

Add `confirmMapping` and `cancelMapping` actions:
```ts
const confirmMapping = useCallback(async (mapping: Record<string, string>) => {
  const data = await api.confirmMapping(mapping)
  setState((s) => ({
    ...s,
    original: data.original,
    working: data.working,
    recycled: [],
    loaded: true,
    pendingMapping: null,
  }))
}, [])

const cancelMapping = useCallback(() => {
  setState((s) => ({ ...s, pendingMapping: null }))
}, [])
```

Export these in the context value and interfaces.

- [ ] **Step 4: Create ColumnMappingModal**

```tsx
// web/src/components/ColumnMappingModal.tsx
```

A modal overlay with:
- Title "Map Your Columns"
- For each app field (Name*, Role*, Discipline*, Manager, Team*, Status*, Additional Teams, New Role, New Team):
  - Label (asterisk for required)
  - `<select>` with options: "— unmapped —" + all headers
  - Pre-selected from the inferred mapping
  - Confidence dot: green (high), yellow (medium), red (none + required)
- Preview table: shows header + first 2-3 data rows, columns reordered by current mapping
- "Load" button (disabled until all required fields mapped)
- "Cancel" button

State: local `mapping` state initialized from props `mapping`, updated as user changes dropdowns.

On "Load": call `confirmMapping(mapping)` from context.
On "Cancel": call `cancelMapping()` from context.

- [ ] **Step 5: Create ColumnMappingModal.module.css**

Modal overlay (fixed position, centered, semi-transparent backdrop), form layout for field rows, preview table styling.

- [ ] **Step 6: Wire into App.tsx**

```tsx
import ColumnMappingModal from './components/ColumnMappingModal'

// In AppContent, get pendingMapping from context:
const { pendingMapping, confirmMapping, cancelMapping } = useOrg()

// Render modal when pending:
{pendingMapping && (
  <ColumnMappingModal
    headers={pendingMapping.headers}
    mapping={pendingMapping.mapping}
    preview={pendingMapping.preview}
    onConfirm={confirmMapping}
    onCancel={cancelMapping}
  />
)}
```

- [ ] **Step 7: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 8: Verify `make build` and manual test**

```bash
make build && ./orgchart serve
```

Test with standard CSV (should auto-load) and a CSV with non-standard headers (should show mapping modal).

- [ ] **Step 9: Commit**

```bash
jj describe -m "feat: add column mapping modal and smart upload flow"
```

---

## Summary

| Task | What it delivers | Key files |
|------|-----------------|-----------|
| 1 | InferMapping function (exact/synonym/fuzzy) | `infer.go`, `infer_test.go` |
| 2 | BuildPeopleWithMapping parser variant | `parser.go`, `parser_test.go` |
| 3 | Service + handler refactor (pending file, confirm endpoint) | `service.go`, `handlers.go` + tests |
| 4 | Frontend modal, API client, context updates | `ColumnMappingModal.tsx`, `client.ts`, `OrgContext.tsx`, `App.tsx` |
