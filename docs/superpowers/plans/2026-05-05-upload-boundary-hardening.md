# Upload Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure CSVs with minimal/sparse data upload successfully without crashing the frontend — only `name` is required, all other fields can be blank, and rows can have fewer columns than the header.

**Architecture:** Fix at the Go boundary (nil slices → empty arrays, ragged CSV acceptance) plus targeted frontend defensive guards for fields that TypeScript types declare as non-optional but can arrive as `null` from Go's JSON serialization.

**Tech Stack:** Go (csv.Reader, JSON serialization), TypeScript/React (null coalescing guards)

---

### Task 1: Accept ragged CSV rows

**Files:**
- Modify: `internal/org/service.go:61-71`
- Test: `internal/org/import_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/org/import_test.go`:

```go
func TestUpload_RaggedCSV(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	// Row 2 has fewer fields than header (3 vs 5)
	csv := "Name,Role,Team,Manager,Level\nAlice,VP,Eng,Bob,29\nCarol,SWE\nDave,,,Alice,\n"
	data, err := svc.Upload(context.Background(), "ragged.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if data.Status != "ready" {
		t.Fatalf("expected ready, got %s", data.Status)
	}
	// Carol should exist with empty fields
	var carol *apitypes.OrgNode
	for i := range data.OrgData.Working {
		if data.OrgData.Working[i].Name == "Carol" {
			carol = &data.OrgData.Working[i]
			break
		}
	}
	if carol == nil {
		t.Fatal("Carol not found in working set")
	}
	if carol.Role != "SWE" {
		t.Errorf("expected role SWE, got %q", carol.Role)
	}
	if carol.Team != "" {
		t.Errorf("expected empty team, got %q", carol.Team)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/org/ -run TestUpload_RaggedCSV -v -count=1`
Expected: FAIL with "reading CSV: record on line 3: wrong number of fields"

- [ ] **Step 3: Implement the fix**

In `internal/org/service.go`, set `FieldsPerRecord = -1` to accept variable-length rows:

```go
func extractRowsCSV(data []byte) ([]string, [][]string, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	reader.FieldsPerRecord = -1 // accept ragged rows
	records, err := reader.ReadAll()
	if err != nil {
		return nil, nil, ErrValidation("reading CSV: %v", err)
	}
	if len(records) < 2 {
		return nil, nil, ErrValidation("CSV must have a header and at least one data row")
	}
	return records[0], records[1:], nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/org/ -run TestUpload_RaggedCSV -v -count=1`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `go test ./... -count=1`
Expected: All pass (the parser's `get()` function already guards against short rows with `idx >= len(row)`)

- [ ] **Step 6: Commit**

```bash
jj describe -m "fix(upload): accept ragged CSV rows with fewer columns than header

Set csv.Reader.FieldsPerRecord = -1 so rows with fewer fields than
the header are accepted (missing trailing fields treated as empty).
The parser's get() function already guards idx >= len(row)."
```

---

### Task 2: Normalize nil slices in deepCopyNodes

**Files:**
- Modify: `internal/org/service.go:225-235`
- Test: `internal/org/service_test.go` (or nearest test file)

- [ ] **Step 1: Write the failing test**

Add to `internal/org/import_test.go`:

```go
func TestUpload_NilAdditionalTeamsBecomesEmptyArray(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	// CSV has no additionalTeams column — field will be nil in Go
	csv := "Name,Role\nAlice,VP\n"
	resp, err := svc.Upload(context.Background(), "minimal.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	for _, p := range resp.OrgData.Working {
		if p.AdditionalTeams == nil {
			t.Errorf("person %q has nil AdditionalTeams, want empty slice", p.Name)
		}
	}
	for _, p := range resp.OrgData.Original {
		if p.AdditionalTeams == nil {
			t.Errorf("original person %q has nil AdditionalTeams, want empty slice", p.Name)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/org/ -run TestUpload_NilAdditionalTeamsBecomesEmptyArray -v -count=1`
Expected: FAIL with "person \"Alice\" has nil AdditionalTeams, want empty slice"

- [ ] **Step 3: Implement the fix**

Modify `deepCopyNodes` in `internal/org/service.go` to always ensure `AdditionalTeams` is non-nil:

```go
func deepCopyNodes(src []apitypes.OrgNode) []apitypes.OrgNode {
	dst := make([]apitypes.OrgNode, len(src))
	for i, p := range src {
		dst[i] = p
		if p.AdditionalTeams != nil {
			dst[i].AdditionalTeams = make([]string, len(p.AdditionalTeams))
			copy(dst[i].AdditionalTeams, p.AdditionalTeams)
		} else {
			dst[i].AdditionalTeams = []string{}
		}
	}
	return dst
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/org/ -run TestUpload_NilAdditionalTeamsBecomesEmptyArray -v -count=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "fix(api): normalize nil AdditionalTeams to empty slice in deepCopyNodes

Go nil slices serialize as JSON null, crashing frontend code that
calls .length or .map() on the field. deepCopyNodes is the single
egress point for all OrgNode responses."
```

---

### Task 3: Normalize nil Pods slice in pod.Copy

**Files:**
- Modify: `internal/pod/helpers.go:128-135`
- Test: `internal/pod/helpers_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/pod/helpers_test.go`:

```go
func TestCopy_NilReturnsEmptySlice(t *testing.T) {
	result := Copy(nil)
	if result == nil {
		t.Fatal("Copy(nil) returned nil, want empty slice")
	}
	if len(result) != 0 {
		t.Fatalf("expected empty slice, got len %d", len(result))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/pod/ -run TestCopy_NilReturnsEmptySlice -v -count=1`
Expected: FAIL with "Copy(nil) returned nil, want empty slice"

- [ ] **Step 3: Implement the fix**

In `internal/pod/helpers.go`:

```go
func Copy(src []apitypes.Pod) []apitypes.Pod {
	if src == nil {
		return []apitypes.Pod{}
	}
	dst := make([]apitypes.Pod, len(src))
	copy(dst, src)
	return dst
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/pod/ -run TestCopy_NilReturnsEmptySlice -v -count=1`
Expected: PASS

- [ ] **Step 5: Remove now-redundant nil guard in CaptureState**

In `internal/org/service.go`, the nil guard at lines 245-247 is now handled by `pod.Copy` itself. Remove the redundant check:

```go
func (s *OrgService) CaptureState() snapshot.OrgState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	pods := pod.Copy(s.podMgr.Pods())
	order := make([]string, len(s.settings.DisciplineOrder))
	copy(order, s.settings.DisciplineOrder)
	return snapshot.OrgState{
		People:   deepCopyNodes(s.working),
		Pods:     pods,
		Settings: apitypes.Settings{DisciplineOrder: order},
	}
}
```

- [ ] **Step 6: Run full test suite**

Run: `go test ./... -count=1`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
jj describe -m "fix(api): pod.Copy returns empty slice instead of nil

Prevents JSON null for pods field in all API responses. Removes
now-redundant nil guard in CaptureState."
```

---

### Task 4: Frontend defensive guards for additionalTeams

**Files:**
- Modify: `web/src/views/columnEdges.ts:104`
- Modify: `web/src/views/layoutICs.ts:14`
- Modify: `web/src/hooks/useOrgDiff.ts` (check for additionalTeams access)
- Test: `web/src/hooks/useSortedPeople.test.ts` (or add to existing)

- [ ] **Step 1: Audit and fix columnEdges.ts**

Line 104 already has a guard: `if (p.additionalTeams && p.additionalTeams.length > 0)`. This is safe. No change needed.

- [ ] **Step 2: Audit and fix layoutICs.ts**

Line 14 already has: `const addl = person.additionalTeams || []`. This is safe. No change needed.

- [ ] **Step 3: Add frontend test for null additionalTeams in sortPeople**

Create or add to `web/src/hooks/useSortedPeople.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sortPeople } from './useSortedPeople'
import type { OrgNode } from '../api/types'

describe('sortPeople', () => {
  it('handles nodes with null/undefined additionalTeams and disciplineOrder', () => {
    const people: OrgNode[] = [
      { id: '1', name: 'Alice', role: '', discipline: '', team: '', managerId: '', status: 'Active', additionalTeams: null as unknown as string[] },
      { id: '2', name: 'Bob', role: '', discipline: '', team: '', managerId: '1', status: 'Active', additionalTeams: [] },
    ]
    // Should not throw
    const result = sortPeople(people, [])
    expect(result).toHaveLength(2)
  })

  it('handles null disciplineOrder', () => {
    const people: OrgNode[] = [
      { id: '1', name: 'Alice', role: '', discipline: 'Eng', team: '', managerId: '', status: 'Active', additionalTeams: [] },
      { id: '2', name: 'Bob', role: '', discipline: 'PM', team: '', managerId: '1', status: 'Active', additionalTeams: [] },
    ]
    // Should not throw even with null disciplineOrder
    const result = sortPeople(people, null as unknown as string[])
    expect(result).toHaveLength(2)
  })
})
```

- [ ] **Step 4: Run the test**

Run: `cd web && npx vitest run src/hooks/useSortedPeople.test.ts`
Expected: PASS (the `?? []` guard we added earlier handles the disciplineOrder case; sortPeople itself doesn't access additionalTeams)

- [ ] **Step 5: Fix sortPeople to guard disciplineOrder.length**

The `?? []` guard is in `useSortedPeople` (the hook) but not in `sortPeople` (the pure function). Add a guard at the top of `sortPeople` in `web/src/hooks/useSortedPeople.ts`:

```typescript
export function sortPeople(people: OrgNode[], disciplineOrder: string[]): OrgNode[] {
  const order = disciplineOrder ?? []
  // ... rest of function uses `order` instead of `disciplineOrder`
```

Replace all `disciplineOrder` references inside the function with `order`.

- [ ] **Step 6: Run full frontend test suite**

Run: `cd web && npx vitest run`
Expected: All pass (excluding flaky perf budget test)

- [ ] **Step 7: Commit**

```bash
jj describe -m "fix(web): guard sortPeople against null disciplineOrder

The pure sortPeople function is also called from test code and could
receive null from Go's JSON. Guard at the function boundary."
```

---

### Task 5: End-to-end test with name-only CSV

**Files:**
- Test: `internal/org/import_test.go`

- [ ] **Step 1: Write a comprehensive sparse-upload test**

Add to `internal/org/import_test.go`:

```go
func TestUpload_NameOnlyCSV(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	csv := "Name\nAlice\nBob\nCarol\n"
	resp, err := svc.Upload(context.Background(), "names.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.OrgData.Working) != 3 {
		t.Fatalf("expected 3 people, got %d", len(resp.OrgData.Working))
	}
	// Verify no nil slices in the JSON-ready response
	for _, p := range resp.OrgData.Working {
		if p.AdditionalTeams == nil {
			t.Errorf("person %q: AdditionalTeams is nil", p.Name)
		}
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("Settings is nil")
	}
	if resp.OrgData.Settings.DisciplineOrder == nil {
		t.Error("DisciplineOrder is nil, want empty slice")
	}
	if resp.OrgData.Pods == nil {
		t.Error("Pods is nil, want empty slice")
	}
}
```

- [ ] **Step 2: Run test**

Run: `go test ./internal/org/ -run TestUpload_NameOnlyCSV -v -count=1`
Expected: PASS (all previous tasks have fixed the nil issues)

- [ ] **Step 3: Write a JSON serialization smoke test**

Add to `internal/org/import_test.go`:

```go
func TestUpload_JSONNeverContainsNull(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	csv := "Name\nAlice\n"
	resp, err := svc.Upload(context.Background(), "one.csv", []byte(csv))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Marshal the OrgData to JSON and check for null arrays
	encoded, err := json.Marshal(resp.OrgData)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	jsonStr := string(encoded)
	// These fields must never be null — they must be []
	for _, field := range []string{`"additionalTeams"`, `"disciplineOrder"`, `"pods"`} {
		if strings.Contains(jsonStr, field+":null") {
			t.Errorf("JSON contains %s:null — must be an empty array", field)
		}
	}
}
```

- [ ] **Step 4: Run test**

Run: `go test ./internal/org/ -run TestUpload_JSONNeverContainsNull -v -count=1`
Expected: PASS

- [ ] **Step 5: Run complete test suite (Go + frontend)**

Run: `go test ./... -count=1 && cd web && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
jj describe -m "test(upload): add sparse CSV and JSON null-safety tests

Covers: name-only CSV, ragged rows, nil-slice-to-JSON validation.
Guards the boundary contract: arrays must serialize as [] not null."
```

---

### Task 6: Squash and push

- [ ] **Step 1: Review all changes**

Run: `jj log --limit 10` to see the commit chain.

- [ ] **Step 2: Push to origin**

```bash
jj bookmark set main -r @
jj git push --bookmark main
```
