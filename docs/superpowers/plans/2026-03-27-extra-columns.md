# Extra Columns Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist unmapped spreadsheet columns through the entire Grove pipeline so they survive import → export round-trips, and display them as read-only columns in the table view.

**Architecture:** Add `Extra map[string]string` to both `model.Person` and `api.Person`. The parser collects unmapped columns into this map. Export appends extra headers/values after the standard columns. The frontend computes extra column definitions dynamically from loaded people and renders them read-only in the table view.

**Tech Stack:** Go (backend model/parser/export), TypeScript/React (frontend table view), vitest (frontend tests), Go testing (backend tests)

---

### Task 1: Add Extra field to model.Person and parser

**Files:**
- Modify: `internal/model/model.go:29-46`
- Modify: `internal/parser/parser.go:15-100`
- Test: `internal/parser/parser_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/parser/parser_test.go`:

```go
func TestBuildPeopleWithMapping_ExtraColumns(t *testing.T) {
	t.Parallel()
	header := []string{"Full Name", "Job Title", "Dept", "CostCenter", "Location"}
	rows := [][]string{
		{"Alice", "VP", "Engineering", "CC001", "NYC"},
		{"Bob", "Engineer", "Platform", "CC002", ""},
	}
	mapping := map[string]string{
		"name": "Full Name", "role": "Job Title", "team": "Dept",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Fatalf("expected 2 people, got %d", len(org.People))
	}

	// Alice should have both extra columns
	if org.People[0].Extra == nil {
		t.Fatal("expected Extra map for Alice, got nil")
	}
	if org.People[0].Extra["CostCenter"] != "CC001" {
		t.Errorf("expected CostCenter=CC001, got %q", org.People[0].Extra["CostCenter"])
	}
	if org.People[0].Extra["Location"] != "NYC" {
		t.Errorf("expected Location=NYC, got %q", org.People[0].Extra["Location"])
	}

	// Bob should have CostCenter but not Location (empty values are skipped)
	if org.People[1].Extra == nil {
		t.Fatal("expected Extra map for Bob, got nil")
	}
	if org.People[1].Extra["CostCenter"] != "CC002" {
		t.Errorf("expected CostCenter=CC002, got %q", org.People[1].Extra["CostCenter"])
	}
	if _, ok := org.People[1].Extra["Location"]; ok {
		t.Error("expected Location to be absent for Bob (empty value)")
	}
}

func TestBuildPeopleWithMapping_NoExtraColumns(t *testing.T) {
	t.Parallel()
	header := []string{"Full Name", "Job Title"}
	rows := [][]string{{"Alice", "VP"}}
	mapping := map[string]string{
		"name": "Full Name", "role": "Job Title",
	}

	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.People[0].Extra != nil {
		t.Errorf("expected nil Extra when all columns mapped, got %v", org.People[0].Extra)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/parser/ -run TestBuildPeopleWithMapping_ExtraColumns -v`
Expected: FAIL — `model.Person` has no field `Extra`

- [ ] **Step 3: Add Extra field to model.Person**

In `internal/model/model.go`, add after `Private bool` (line 45):

```go
	Extra           map[string]string // unmapped spreadsheet columns, keyed by original header name
```

- [ ] **Step 4: Run test to verify it still fails**

Run: `go test ./internal/parser/ -run TestBuildPeopleWithMapping_ExtraColumns -v`
Expected: FAIL — Extra is nil (parser doesn't populate it yet)

- [ ] **Step 5: Implement extra column collection in parser**

In `internal/parser/parser.go`, add this block after the `cols` loop (after line 30) and before the `// Validate` comment:

```go
	// Identify extra (unmapped) column indices.
	consumedIndices := make(map[int]bool, len(cols))
	for _, idx := range cols {
		consumedIndices[idx] = true
	}
	type extraCol struct {
		name string
		idx  int
	}
	var extraCols []extraCol
	for i, h := range header {
		h = strings.TrimSpace(h)
		if h != "" && !consumedIndices[i] {
			extraCols = append(extraCols, extraCol{name: h, idx: i})
		}
	}
```

Then inside the row loop, after the `p.AdditionalTeams` block (after the closing `}` on line 94) and before `people = append(people, p)`:

```go
		// Collect extra columns.
		for _, ec := range extraCols {
			if ec.idx < len(row) {
				val := strings.TrimSpace(row[ec.idx])
				if val != "" {
					if p.Extra == nil {
						p.Extra = make(map[string]string)
					}
					p.Extra[ec.name] = val
				}
			}
		}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./internal/parser/ -v`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```
jj describe -m "feat: add Extra field to model.Person and collect unmapped columns in parser"
jj new
```

---

### Task 2: Add Extra field to api.Person and wire through convert

**Files:**
- Modify: `internal/api/model.go:3-22`
- Modify: `internal/api/convert.go:52-70`
- Modify: `internal/api/contract_test.go:40-67`

- [ ] **Step 1: Update the contract test**

In `internal/api/contract_test.go`, add `"extra"` to the `expected` slice in `TestContractPersonFields` (line 43-62). Insert it alphabetically after `"employmentType"`:

```go
	expected := []string{
		"additionalTeams",
		"discipline",
		"employmentType",
		"extra",
		"id",
		"level",
		"managerId",
		"name",
		"newRole",
		"newTeam",
		"pod",
		"private",
		"privateNote",
		"publicNote",
		"role",
		"sortIndex",
		"status",
		"team",
		"warning",
	}
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `go test ./internal/api/ -run TestContractPersonFields -v`
Expected: FAIL — `extra` not found in JSON fields

- [ ] **Step 3: Add Extra field to api.Person**

In `internal/api/model.go`, add after `Private` (line 21):

```go
	Extra           map[string]string `json:"extra,omitempty"`
```

- [ ] **Step 4: Run contract test to verify it passes**

Run: `go test ./internal/api/ -run TestContractPersonFields -v`
Expected: PASS

- [ ] **Step 5: Wire Extra through ConvertOrgWithIDMap**

In `internal/api/convert.go`, add `Extra: p.Extra,` inside the `Person{}` literal (after line 69, the `Private` line):

```go
			Extra:           p.Extra,
```

- [ ] **Step 6: Write a convert test**

Add to a new test or in an existing test file — add to `internal/api/convert_test.go` (create if needed):

```go
package api

import (
	"testing"

	"github.com/zachthieme/grove/internal/model"
)

func TestConvertOrg_PreservesExtra(t *testing.T) {
	t.Parallel()
	org := &model.Org{
		People: []model.Person{
			{
				Name: "Alice", Role: "VP", Discipline: "Eng", Team: "T", Status: "Active",
				Extra: map[string]string{"CostCenter": "CC001", "Location": "NYC"},
			},
			{
				Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active",
			},
		},
	}

	people := ConvertOrg(org)
	if len(people) != 2 {
		t.Fatalf("expected 2 people, got %d", len(people))
	}

	if people[0].Extra == nil {
		t.Fatal("expected Extra on Alice, got nil")
	}
	if people[0].Extra["CostCenter"] != "CC001" {
		t.Errorf("expected CostCenter=CC001, got %q", people[0].Extra["CostCenter"])
	}
	if people[0].Extra["Location"] != "NYC" {
		t.Errorf("expected Location=NYC, got %q", people[0].Extra["Location"])
	}

	if people[1].Extra != nil {
		t.Errorf("expected nil Extra on Bob, got %v", people[1].Extra)
	}
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `go test ./internal/api/ -v -count=1`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```
jj describe -m "feat: add Extra field to api.Person and wire through convert"
jj new
```

---

### Task 3: Export extra columns in CSV and XLSX

**Files:**
- Modify: `internal/api/export.go:13-119`
- Test: `internal/api/export_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/api/export_test.go`:

```go
func TestExportCSV_IncludesExtraColumns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active",
			Extra: map[string]string{"CostCenter": "CC001", "Location": "NYC"}},
		{Id: "2", Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active",
			Extra: map[string]string{"CostCenter": "CC002"}},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")

	// Extra headers should appear after standard headers, sorted alphabetically
	if !strings.Contains(lines[0], "CostCenter") {
		t.Errorf("expected header to contain CostCenter, got: %s", lines[0])
	}
	if !strings.Contains(lines[0], "Location") {
		t.Errorf("expected header to contain Location, got: %s", lines[0])
	}

	// Verify CostCenter comes before Location (alphabetical)
	ccIdx := strings.Index(lines[0], "CostCenter")
	locIdx := strings.Index(lines[0], "Location")
	if ccIdx > locIdx {
		t.Errorf("expected CostCenter before Location in headers")
	}

	// Alice's row should have CC001 and NYC
	if !strings.Contains(lines[1], "CC001") {
		t.Errorf("expected Alice row to contain CC001, got: %s", lines[1])
	}
	if !strings.Contains(lines[1], "NYC") {
		t.Errorf("expected Alice row to contain NYC, got: %s", lines[1])
	}

	// Bob's row should have CC002 but empty Location
	if !strings.Contains(lines[2], "CC002") {
		t.Errorf("expected Bob row to contain CC002, got: %s", lines[2])
	}
}

func TestExportCSV_NoExtraColumns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active"},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")

	// Header count should match standard exportHeaders (15 columns)
	r := csv.NewReader(strings.NewReader(lines[0]))
	fields, _ := r.Read()
	if len(fields) != len(exportHeaders) {
		t.Errorf("expected %d headers, got %d", len(exportHeaders), len(fields))
	}
}
```

Add `"encoding/csv"` to the imports at the top of the test file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesExtraColumns -v`
Expected: FAIL — extra columns not in output

- [ ] **Step 3: Implement extra columns in export**

Add a helper function in `internal/api/export.go` (before `ExportCSV`):

```go
// collectExtraKeys returns the sorted union of all Extra map keys across people.
func collectExtraKeys(people []Person) []string {
	seen := make(map[string]bool)
	for _, p := range people {
		for k := range p.Extra {
			seen[k] = true
		}
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
```

Add `"sort"` to the imports.

Update `ExportCSV` to:

```go
func ExportCSV(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	extraKeys := collectExtraKeys(people)
	headers := append(append([]string{}, exportHeaders...), extraKeys...)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(headers); err != nil {
		return nil, fmt.Errorf("writing CSV headers: %w", err)
	}
	for _, p := range people {
		if err := w.Write(personToRowWithExtra(p, idToName, extraKeys)); err != nil {
			return nil, fmt.Errorf("writing CSV row: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("writing CSV: %w", err)
	}
	return buf.Bytes(), nil
}
```

Update `ExportXLSX` similarly:

```go
func ExportXLSX(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	extraKeys := collectExtraKeys(people)
	headers := append(append([]string{}, exportHeaders...), extraKeys...)
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	sheet := "Sheet1"
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return nil, fmt.Errorf("setting header cell: %w", err)
		}
	}
	for rowIdx, p := range people {
		row := personToRowWithExtra(p, idToName, extraKeys)
		for colIdx, val := range row {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			if err := f.SetCellValue(sheet, cell, val); err != nil {
				return nil, fmt.Errorf("setting cell value: %w", err)
			}
		}
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("writing XLSX: %w", err)
	}
	return buf.Bytes(), nil
}
```

Add `personToRowWithExtra` that extends the existing `personToRow`:

```go
func personToRowWithExtra(p Person, idToName map[string]string, extraKeys []string) []string {
	row := personToRow(p, idToName)
	for _, k := range extraKeys {
		row = append(row, p.Extra[k])
	}
	return row
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/api/ -run TestExport -v`
Expected: ALL PASS

- [ ] **Step 5: Run all Go tests**

Run: `go test ./...`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```
jj describe -m "feat: export extra columns in CSV and XLSX"
jj new
```

---

### Task 4: Add extra field to frontend Person type and display in table view

**Files:**
- Modify: `web/src/api/types.ts:1-20`
- Modify: `web/src/views/tableColumns.ts:12-19`
- Modify: `web/src/views/TableView.tsx:6,144,260-278`

- [ ] **Step 1: Add extra to Person type**

In `web/src/api/types.ts`, add after line 19 (`private?: boolean`):

```ts
  extra?: Record<string, string>
```

- [ ] **Step 2: Add getExtraValue helper to tableColumns.ts**

In `web/src/views/tableColumns.ts`, add after the `getPersonValue` function:

```ts
export function getExtraValue(person: Person, extraKey: string): string {
  return person.extra?.[extraKey] ?? ''
}

export function buildExtraColumns(people: Person[]): ColumnDef[] {
  const keys = new Set<string>()
  for (const p of people) {
    if (p.extra) {
      for (const k of Object.keys(p.extra)) keys.add(k)
    }
  }
  return [...keys].sort().map(key => ({
    key: `extra:${key}`,
    label: key,
    cellType: 'text' as CellType,
    width: '120px',
  }))
}
```

- [ ] **Step 3: Update getPersonValue to handle extra: prefix**

In `web/src/views/tableColumns.ts`, update `getPersonValue`:

```ts
export function getPersonValue(person: Person, key: string): string {
  if (key.startsWith('extra:')) {
    return person.extra?.[key.slice(6)] ?? ''
  }
  switch (key) {
    case 'level': return person.level ? String(person.level) : ''
    case 'additionalTeams': return (person.additionalTeams ?? []).join(', ')
    case 'private': return person.private ? 'true' : 'false'
    default: return (person as unknown as Record<string, unknown>)[key] as string ?? ''
  }
}
```

- [ ] **Step 4: Wire extra columns into TableView**

In `web/src/views/TableView.tsx`, add import for `buildExtraColumns`:

```ts
import { TABLE_COLUMNS, getPersonValue, buildExtraColumns } from './tableColumns'
```

Add a `useMemo` for extra columns after the existing `managers` memo (around line 68):

```ts
  const extraColumns = useMemo(() => buildExtraColumns(people), [people])
  const allColumns = useMemo(() => [...TABLE_COLUMNS, ...extraColumns], [extraColumns])
```

Update `visibleColumns` to use `allColumns`:

```ts
  const visibleColumns = useMemo(() => allColumns.filter(c => !hiddenCols.has(c.key)), [hiddenCols, allColumns])
```

Update the column toggle dropdown to use `allColumns` instead of `TABLE_COLUMNS`:

```ts
          {showColToggle && (
            <div className={styles.colToggleDropdown}>
              {allColumns.map(col => (
```

Update the paste handler's `headerLabels` to use `allColumns`:

```ts
      const headerLabels = new Set(allColumns.flatMap(c => [c.key.toLowerCase(), c.label.toLowerCase()]))
```

- [ ] **Step 5: Force extra columns to be read-only in TableRow**

In `web/src/views/TableRow.tsx`, update the `TableCell` render to force `readOnly` for extra columns:

```ts
      {columns.map((col, i) => (
        <TableCell
          key={col.key}
          value={getPersonValue(person, col.key)}
          cellType={col.cellType}
          readOnly={readOnly || col.key.startsWith('extra:')}
          options={getDropdownOptions(col.key, managers)}
          onSave={async (v) => onUpdate(person.id, col.key, v)}
          onTab={(shift) => handleTab(i, shift)}
          cellRef={(el) => { cellRefs.current[i] = el }}
        />
      ))}
```

- [ ] **Step 6: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: Some golden tests may fail due to new column structure. If so, update goldens:
Run: `cd web && npm test -- --run -u`

- [ ] **Step 7: Verify all tests pass**

Run: `cd web && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```
jj describe -m "feat: display extra columns as read-only in table view"
jj new
```

---

### Task 5: End-to-end round-trip test

**Files:**
- Test: `internal/api/export_test.go`

- [ ] **Step 1: Write a round-trip test**

Add to `internal/api/export_test.go`:

```go
func TestExportCSV_RoundTrip_ExtraColumns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Id: "1", Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Engineering", Status: "Active",
			Extra: map[string]string{"CostCenter": "CC001", "Location": "NYC", "StartDate": "2020-01-15"}},
		{Id: "2", Name: "Bob", Role: "Engineer", Discipline: "Eng", Team: "Platform", Status: "Active", ManagerId: "1",
			Extra: map[string]string{"CostCenter": "CC002", "Location": "SF"}},
	}

	// Export
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}

	// Re-import via parser
	r := csv.NewReader(bytes.NewReader(data))
	allRows, err := r.ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	header := allRows[0]
	dataRows := allRows[1:]

	mapping := InferMapping(header)
	simpleMapping := make(map[string]string, len(mapping))
	for field, mc := range mapping {
		simpleMapping[field] = mc.Column
	}

	org, err := parser.BuildPeopleWithMapping(header, dataRows, simpleMapping)
	if err != nil {
		t.Fatal(err)
	}

	// Verify extra columns survived the round-trip
	if org.People[0].Extra == nil {
		t.Fatal("expected Extra on Alice after round-trip")
	}
	if org.People[0].Extra["CostCenter"] != "CC001" {
		t.Errorf("CostCenter: got %q, want CC001", org.People[0].Extra["CostCenter"])
	}
	if org.People[0].Extra["Location"] != "NYC" {
		t.Errorf("Location: got %q, want NYC", org.People[0].Extra["Location"])
	}
	if org.People[0].Extra["StartDate"] != "2020-01-15" {
		t.Errorf("StartDate: got %q, want 2020-01-15", org.People[0].Extra["StartDate"])
	}

	if org.People[1].Extra["CostCenter"] != "CC002" {
		t.Errorf("Bob CostCenter: got %q, want CC002", org.People[1].Extra["CostCenter"])
	}
	if org.People[1].Extra["Location"] != "SF" {
		t.Errorf("Bob Location: got %q, want SF", org.People[1].Extra["Location"])
	}
	if _, ok := org.People[1].Extra["StartDate"]; ok {
		t.Error("expected StartDate absent for Bob")
	}
}
```

Add `"bytes"`, `"encoding/csv"`, and the parser import to the test file imports if not present:

```go
import (
	"bytes"
	"encoding/csv"
	// ... existing imports ...

	"github.com/zachthieme/grove/internal/parser"
)
```

- [ ] **Step 2: Run the test**

Run: `go test ./internal/api/ -run TestExportCSV_RoundTrip_ExtraColumns -v`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `go test ./... && cd web && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```
jj describe -m "test: add round-trip test for extra column preservation"
jj new
```

---

### Task 6: Final push

- [ ] **Step 1: Move bookmark and push**

```
jj bookmark set main -r @-
jj git push
```
