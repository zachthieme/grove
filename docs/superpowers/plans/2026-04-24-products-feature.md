# Products Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "products" as a new node type alongside people in the org chart, with distinct rendering, validation, and metrics behavior.

**Architecture:** Two-phase approach. Phase 1 is a mechanical rename (`Person` → `OrgNode`) across Go and TypeScript to prepare the type system. Phase 2 adds the `type` field and all product-specific behavior (validation, rendering, layout grouping, metrics exclusion). Each phase produces a working, test-passing codebase.

**Tech Stack:** Go (backend model/API), React/TypeScript (frontend), vitest (frontend tests), `go test` (backend tests), jj (version control)

**Spec:** `docs/superpowers/specs/2026-04-23-products-design.md`

---

## File Structure

### Go files to modify
- `internal/model/model.go` — Rename `PersonFields` → `OrgNodeFields`, `Person` → `OrgNode`. Add `Type` field. Add product status constants. Update `NewOrg` validation.
- `internal/api/model.go` — Rename `Person` → `OrgNode`, `PersonUpdate` → `OrgNodeUpdate`. Add `Type` field.
- `internal/api/validate.go` — Rename `validatePersonUpdate` → `validateNodeUpdate`. Add type-aware status validation. Add product-as-manager rejection in `validateManagerChange`.
- `internal/api/service.go` — Rename all `Person` → `OrgNode` references. Update `deepCopyPeople`, `findWorking`, etc.
- `internal/api/service_people.go` — Rename references. Update `Update` for type-aware status. Update `Add` to accept `type`.
- `internal/api/service_pods.go` — Rename references.
- `internal/api/handlers.go` — Rename references.
- `internal/api/convert.go` — Rename references. Pass `Type` through conversion.
- `internal/api/export.go` — Rename references. Add `Type` column to export headers and row builder.
- `internal/api/infer.go` — Add `"type"` to exact matches and synonyms.
- `internal/api/snapshot_manager.go`, `internal/api/snapshot_store.go`, `internal/api/snapshots.go` — Rename references.
- `internal/api/zipimport.go` — Rename references.
- `internal/api/autosave.go` — Rename references.
- `internal/api/interfaces.go` — Rename references.
- `internal/api/pods.go`, `internal/api/pod_manager.go` — Rename references.
- `internal/parser/parser.go` — Rename references. Extract `type` field from CSV.

### Frontend files to modify
- `web/src/api/types.ts` — Rename `Person` → `OrgNode`, `PersonUpdatePayload` → `OrgNodeUpdatePayload`. Add `type` and `NodeType` fields. Add product statuses.
- `web/src/constants.ts` — Add `PRODUCT_STATUSES`, `NodeType` type, product status helpers.
- `web/src/views/shared.tsx` — Rename `OrgNode` (tree wrapper) → `TreeNode`.
- `web/src/components/PersonNode.tsx` → rename file to `OrgNodeCard.tsx`. Add product rendering variant.
- `web/src/components/PersonNode.module.css` → rename to `OrgNodeCard.module.css`.
- `web/src/utils/personFormUtils.ts` → rename to `nodeFormUtils.ts`. Rename `PersonFormValues` → `NodeFormValues`. Add type-switching logic.
- `web/src/hooks/usePersonNodeProps.ts` → rename to `useNodeProps.ts`. Rename `PersonNodeCommonProps` → `NodeCommonProps`.
- `web/src/hooks/useOrgDiff.ts` — Rename `PersonChange` → `NodeChange`. Add `type` change detection.
- `web/src/hooks/useOrgMetrics.ts` — Add `productCount`. Exclude products from headcount/span.
- `web/src/hooks/useDragDrop.ts` — No changes needed (uses IDs, not types directly).
- `web/src/components/BaseNode.tsx` — Add `droppable` override for products.
- `web/src/components/PersonEditSidebar.tsx` → rename to `NodeEditSidebar.tsx`. Add type dropdown, field hiding.
- `web/src/components/PersonForm.tsx` → rename to `NodeForm.tsx`. Type-aware field visibility.
- `web/src/views/layoutTree.ts` — Add `ProductGroupLayout` type. Separate products from ICs.
- `web/src/views/ColumnView.tsx`, `ManagerView.tsx` — Update imports for renames.
- `web/src/api/client.ts` — Rename function names: `movePerson` → `moveNode`, etc.
- All other files importing `Person` — Update imports (~120 files, mechanical).

### New files
- `docs/scenarios/products.md` — Scenario contract for product behaviors.

### Test files to modify
- All Go test files referencing `Person`/`PersonFields`/`PersonUpdate` (~20 files) — mechanical rename.
- All frontend test files referencing `Person`/`PersonNode`/`PersonChange` (~90 files) — mechanical rename.
- `web/src/hooks/useOrgDiff.test.ts` — Add `type` change test.
- `web/src/hooks/useOrgMetrics.test.ts` — Add product exclusion tests.
- Frontend golden test snapshots — Regenerate after renames.

---

### Task 1: Write Scenario File

**Files:**
- Create: `docs/scenarios/products.md`

- [ ] **Step 1: Write the scenario file**

```markdown
# Product Scenarios

---

# Scenario: Add a product under a manager

**ID**: PROD-001
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_AddProduct"
- `web/src/components/OrgNodeCard.test.tsx` → "[PROD-001]"

## Behavior
A product node is added under a manager, appearing alongside people.

## Invariants
- Product has `type: "product"` and a valid `managerId`
- Product appears in working slice with a generated UUID
- Person-only fields (role, discipline, level, employmentType, additionalTeams) are empty

---

# Scenario: Move a product to a different manager

**ID**: PROD-002
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_MoveProduct"

## Behavior
A product is moved to a new manager via the Move endpoint.

## Invariants
- Product's managerId updated to new manager
- Same behavior as moving a person (team/pod assignment)

---

# Scenario: Move a product into a pod

**ID**: PROD-003
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_MoveProductToPod"

## Behavior
A product is moved into a pod, setting both managerId and pod.

## Invariants
- Product's managerId set to pod's manager
- Product's pod set to pod name

---

# Scenario: Reject reparenting to a product

**ID**: PROD-004
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_RejectProductAsManager"
- `internal/api/service_test.go` → "TestOrgService_Update_RejectProductAsManager"

## Behavior
Moving a person or product so that its manager is a product node is rejected.

## Invariants
- ValidationError returned: "cannot report to a product"
- No state mutation on rejection

---

# Scenario: Delete and restore a product

**ID**: PROD-005
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_DeleteProduct"
- `internal/api/service_test.go` → "TestOrgService_RestoreProduct"

## Behavior
Products can be deleted (moved to recycle bin) and restored.

## Invariants
- Same delete/restore behavior as people
- Type preserved through delete/restore cycle

---

# Scenario: Import CSV with product rows

**ID**: PROD-006
**Area**: products
**Tests**:
- `internal/api/infer_test.go` → "TestInferMapping_TypeColumn"
- `internal/parser/parser_test.go` → "TestBuildPeopleWithMapping_ProductRows"

## Behavior
CSV with a `type` column (values: "person" or "product") imports correctly. Missing type column defaults all rows to "person".

## Invariants
- Product rows have `Type: "product"`
- Person rows have `Type: "person"` (or empty, treated as "person")
- Person-only fields on product rows are empty strings

---

# Scenario: Export preserves product type

**ID**: PROD-007
**Area**: products
**Tests**:
- `internal/api/export_test.go` → "TestExportCSV_WithProducts"

## Behavior
Exporting to CSV/XLSX includes a Type column preserving each node's type.

## Invariants
- Type column present in export headers
- Product rows have "product", person rows have "person"
- Round-trip import → export → import preserves types

---

# Scenario: Diff mode detects product changes

**ID**: PROD-008
**Area**: products
**Tests**:
- `web/src/hooks/useOrgDiff.test.ts` → "[PROD-008]"

## Behavior
Diff mode detects when a node's type changes between original and working state.

## Invariants
- New `type` change type in PersonChange/NodeChange
- Type change flagged alongside other changes

---

# Scenario: Metrics exclude products from headcount

**ID**: PROD-009
**Area**: products
**Tests**:
- `web/src/hooks/useOrgMetrics.test.ts` → "[PROD-009]"

## Behavior
Products are not counted in headcount, recruiting, planned, or transfers metrics.

## Invariants
- `productCount` field tracks product count separately
- `totalHeadcount` excludes products
- `byDiscipline` excludes products
- `byTeamPod` groups track products separately via `productCount`

---

# Scenario: Products excluded from span of control

**ID**: PROD-010
**Area**: products
**Tests**:
- `web/src/hooks/useOrgMetrics.test.ts` → "[PROD-010]"

## Behavior
Products are not counted in a manager's span of control.

## Invariants
- `spanOfControl` counts only person-type direct reports
- Products under a manager do not inflate the span number
```

- [ ] **Step 2: Commit**

```bash
jj describe -m "docs: add products scenario file (PROD-001 through PROD-010)"
jj new
```

---

### Task 2: Go Model — Rename + Type Field

**Files:**
- Modify: `internal/model/model.go`

- [ ] **Step 1: Write failing test — product type constants and validation**

Add to `internal/model/model_test.go`:

```go
func TestNewOrg_ProductStatus(t *testing.T) {
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Widget", Type: "product", Status: "Deprecated"}, Manager: ""},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.People[0].Warning != "" {
		t.Errorf("expected no warning for valid product status, got: %s", org.People[0].Warning)
	}
}

func TestNewOrg_InvalidProductStatus(t *testing.T) {
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Widget", Type: "product", Status: "Open"}, Manager: ""},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.People[0].Warning == "" {
		t.Error("expected warning for invalid product status 'Open'")
	}
}

func TestNewOrg_DefaultType(t *testing.T) {
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Empty type is treated as "person" — no error
	if org.People[0].Warning != "" {
		t.Errorf("expected no warning, got: %s", org.People[0].Warning)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/zach/code/grove && go test ./internal/model/ -run "TestNewOrg_ProductStatus|TestNewOrg_InvalidProductStatus|TestNewOrg_DefaultType" -v
```

Expected: FAIL — `OrgNode` and `OrgNodeFields` types don't exist yet.

- [ ] **Step 3: Rename and add type field in model.go**

In `internal/model/model.go`, apply these changes:

1. Rename `PersonFields` → `OrgNodeFields`
2. Add `Type string \`json:"type,omitempty"\`` field to `OrgNodeFields` (first field, before Name)
3. Rename `Person` → `OrgNode`, update embedded struct name
4. Rename `Org.People` type from `[]Person` → `[]OrgNode`
5. Add product status constants and `ValidProductStatuses` map
6. Update `NewOrg` to validate status based on type

The full updated `internal/model/model.go`:

```go
package model

import (
	"fmt"
	"strings"
)

// ValidPersonStatuses is the set of allowed statuses for person-type nodes.
var ValidPersonStatuses = map[string]bool{
	StatusActive:      true,
	StatusOpen:        true,
	StatusTransferIn:  true,
	StatusTransferOut: true,
	StatusBackfill:    true,
	StatusPlanned:     true,
}

// ValidProductStatuses is the set of allowed statuses for product-type nodes.
var ValidProductStatuses = map[string]bool{
	StatusActive:     true,
	StatusDeprecated: true,
	StatusPlanned:    true,
	StatusSunsetting: true,
}

// ValidStatuses returns the correct status set for a given node type.
// Empty type is treated as "person".
func ValidStatuses(nodeType string) map[string]bool {
	if nodeType == "product" {
		return ValidProductStatuses
	}
	return ValidPersonStatuses
}

const (
	StatusActive      = "Active"
	StatusOpen        = "Open"
	StatusTransferIn  = "Transfer In"
	StatusTransferOut = "Transfer Out"
	StatusBackfill    = "Backfill"
	StatusPlanned     = "Planned"

	// Product-specific statuses
	StatusDeprecated = "Deprecated"
	StatusSunsetting = "Sunsetting"
)

// OrgNodeFields holds fields shared between the domain model and the API wire
// format. When adding a new field, add it here once rather than in both
// OrgNode and api.OrgNode.
type OrgNodeFields struct {
	Type            string            `json:"type,omitempty"`
	Name            string            `json:"name"`
	Role            string            `json:"role"`
	Discipline      string            `json:"discipline"`
	Team            string            `json:"team"`
	AdditionalTeams []string          `json:"additionalTeams"`
	Status          string            `json:"status"`
	EmploymentType  string            `json:"employmentType"`
	Warning         string            `json:"warning,omitempty"`
	NewRole         string            `json:"newRole,omitempty"`
	NewTeam         string            `json:"newTeam,omitempty"`
	Pod             string            `json:"pod,omitempty"`
	PublicNote      string            `json:"publicNote,omitempty"`
	PrivateNote     string            `json:"privateNote,omitempty"`
	Level           int               `json:"level,omitempty"`
	Private         bool              `json:"private,omitempty"`
	Extra           map[string]string `json:"extra,omitempty"`
}

type OrgNode struct {
	OrgNodeFields
	Manager string // manager by name, used only during CSV import
}

type Org struct {
	People   []OrgNode
	Warnings []string
}

// NewOrg validates nodes. Rows with issues are kept but flagged with a Warning.
// Only truly empty/unparseable data returns an error.
func NewOrg(people []OrgNode) (*Org, error) {
	if len(people) == 0 {
		return nil, fmt.Errorf("no data rows found")
	}

	var warnings []string
	for i := range people {
		p := &people[i]
		row := i + 2
		var issues []string

		if p.Name == "" {
			issues = append(issues, "missing Name")
		}
		statusSet := ValidStatuses(p.Type)
		if p.Status == "" {
			issues = append(issues, "missing Status")
		} else if !statusSet[p.Status] {
			issues = append(issues, fmt.Sprintf("invalid status '%s'", p.Status))
		}

		if len(issues) > 0 {
			msg := fmt.Sprintf("row %d: %s", row, strings.Join(issues, "; "))
			p.Warning = msg
			warnings = append(warnings, msg)
		}
	}

	return &Org{People: people, Warnings: warnings}, nil
}
```

- [ ] **Step 4: Fix all Go compilation errors from the rename**

The rename of `PersonFields` → `OrgNodeFields` and `Person` → `OrgNode` in the model package will break every Go file that references these types. Fix each file by updating the type names:

- `internal/api/model.go` — `model.PersonFields` → `model.OrgNodeFields` in the `Person` struct embedding. **Do not rename api.Person yet** — that's Task 3.
- `internal/api/convert.go` — `model.Person` → `model.OrgNode`, `model.PersonFields` → `model.OrgNodeFields`
- `internal/parser/parser.go` — `model.Person` → `model.OrgNode`, `model.PersonFields` → `model.OrgNodeFields`
- `internal/model/model_test.go` — `Person` → `OrgNode`, `PersonFields` → `OrgNodeFields` (existing tests)
- All other files referencing `model.Person` or `model.PersonFields`

Also update `model.ValidStatuses` references — it's now a function, not a map. In `internal/api/service_people.go`, the status validation `model.ValidStatuses[*fields.Status]` becomes `model.ValidStatuses(p.Type)[*fields.Status]` (where `p` is the node being updated). Similarly in `Add`.

- [ ] **Step 5: Run all Go tests to verify compilation and tests pass**

```bash
cd /home/zach/code/grove && go test ./internal/model/ -v
cd /home/zach/code/grove && go test ./internal/... -count=1
```

Expected: ALL PASS, including the new product status tests.

- [ ] **Step 6: Commit**

```bash
jj describe -m "refactor: rename Person → OrgNode in Go model, add type field and product statuses"
jj new
```

---

### Task 3: Go API — Rename + Product Validation

**Files:**
- Modify: `internal/api/model.go`, `internal/api/validate.go`, `internal/api/service.go`, `internal/api/service_people.go`, `internal/api/handlers.go`, `internal/api/convert.go`, `internal/api/export.go`, `internal/api/interfaces.go`, `internal/api/pods.go`, `internal/api/pod_manager.go`, `internal/api/snapshots.go`, `internal/api/snapshot_manager.go`, `internal/api/snapshot_store.go`, `internal/api/zipimport.go`, `internal/api/autosave.go`, `internal/api/service_pods.go`, `internal/api/service_settings.go`

- [ ] **Step 1: Write failing test — product as manager rejected**

Add to `internal/api/service_test.go`:

```go
func TestOrgService_Move_RejectProductAsManager(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking()
	widgetId := findById(working, "Widget").Id
	bobId := findById(working, "Bob").Id
	_, err := svc.Move(context.Background(), bobId, widgetId, "")
	if err == nil {
		t.Fatal("expected error when moving to a product manager")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got: %T", err)
	}
	if !strings.Contains(err.Error(), "cannot report to a product") {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestOrgService_Update_RejectProductAsManager(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking()
	widgetId := findById(working, "Widget").Id
	bobId := findById(working, "Bob").Id
	mgrId := widgetId
	_, err := svc.Update(context.Background(), bobId, OrgNodeUpdate{ManagerId: &mgrId})
	if err == nil {
		t.Fatal("expected error when setting product as manager")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got: %T", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/zach/code/grove && go test ./internal/api/ -run "TestOrgService_Move_RejectProductAsManager|TestOrgService_Update_RejectProductAsManager" -v
```

Expected: FAIL — types not renamed yet, validation not implemented.

- [ ] **Step 3: Rename Person → OrgNode across the entire api package**

This is a mechanical bulk rename. In every file under `internal/api/`:

1. **`model.go`**: Rename `Person` struct → `OrgNode`. Rename `PersonUpdate` → `OrgNodeUpdate`. Add `Type` field if not already embedded from `OrgNodeFields`. Update all response types: `[]Person` → `[]OrgNode` everywhere (`OrgData`, `AutosaveData`, `WorkingResponse`, `AddResponse`, `MutationResponse`, `RecycledResponse`).
2. **`validate.go`**: Rename `validatePersonUpdate` → `validateNodeUpdate`. Change `findInSlice(people []Person` → `findInSlice(people []OrgNode`. Update `validateManagerChange` to also accept the working slice and check if target is a product: add `if _, mgr := findInSlice(working, newManagerId); mgr != nil && mgr.Type == "product" { return errValidation("cannot report to a product") }` before the cycle check. Update `isFrontlineManager` parameter type.
3. **`service.go`**: All `Person` → `OrgNode` in field types, function signatures, local variables. `deepCopyPeople` signature: `[]OrgNode → []OrgNode`. 
4. **`service_people.go`**: All `Person` → `OrgNode`, `PersonUpdate` → `OrgNodeUpdate`. In `Update`, change status validation to be type-aware: `model.ValidStatuses(p.Type)[*fields.Status]`.
5. **`handlers.go`**: All `Person` → `OrgNode`, `PersonUpdate` → `OrgNodeUpdate`.
6. **`interfaces.go`**: All `Person` → `OrgNode`, `PersonUpdate` → `OrgNodeUpdate`.
7. **All other api files**: `convert.go`, `export.go`, `pods.go`, `pod_manager.go`, `snapshots.go`, `snapshot_manager.go`, `snapshot_store.go`, `zipimport.go`, `autosave.go`, `service_pods.go` — rename `Person` → `OrgNode` in all type references.

Key validation change in `validate.go` — `validateManagerChange`:

```go
func validateManagerChange(working []OrgNode, personId, newManagerId string) error {
	if newManagerId == personId {
		return errValidation("a person cannot be their own manager")
	}
	_, mgr := findInSlice(working, newManagerId)
	if mgr == nil {
		return errNotFound("manager %s not found", newManagerId)
	}
	if mgr.Type == "product" {
		return errValidation("cannot report to a product")
	}
	if wouldCreateCycle(working, personId, newManagerId) {
		return errValidation("this move would create a circular reporting chain")
	}
	return nil
}
```

- [ ] **Step 4: Fix all Go test files for the rename**

Update every test file under `internal/api/` that references `Person`, `PersonFields`, `PersonUpdate`:

- `service_test.go`, `handlers_test.go`, `pods_test.go`, `export_test.go`, `convert_test.go`, `contract_test.go`, `concurrent_test.go`, `autosave_test.go`, `snapshots_test.go`, `snapshot_store_test.go`, `stores_test.go`, `fuzz_test.go`, `bench_test.go`, `stress_test.go`, `adversarial_test.go`, `bench_index_test.go`, `infer_test.go`
- Also `integration_test.go` at repo root

Rename `Person` → `OrgNode`, `PersonUpdate` → `OrgNodeUpdate`, `PersonFields` → `OrgNodeFields`, `findAPIPersonByName` → `findAPINodeByName`.

- [ ] **Step 5: Run all Go tests**

```bash
cd /home/zach/code/grove && go test ./... -count=1
```

Expected: ALL PASS, including the new product-as-manager rejection tests.

- [ ] **Step 6: Commit**

```bash
jj describe -m "refactor: rename Person → OrgNode in Go API, add product-as-manager validation"
jj new
```

---

### Task 4: Go — Type Column in Import/Export/Inference

**Files:**
- Modify: `internal/api/infer.go`, `internal/parser/parser.go`, `internal/api/export.go`
- Modify: `internal/api/infer_test.go`, `internal/parser/parser_test.go`, `internal/api/export_test.go`

- [ ] **Step 1: Write failing test — type column inference**

Add to `internal/api/infer_test.go`:

```go
func TestInferMapping_TypeColumn(t *testing.T) {
	headers := []string{"Name", "Type", "Status", "Manager"}
	m := InferMapping(headers)
	if mc, ok := m["type"]; !ok {
		t.Error("expected 'type' field to be mapped")
	} else if mc.Confidence != ConfidenceHigh {
		t.Errorf("expected high confidence, got %s", mc.Confidence)
	}
}

func TestInferMapping_TypeSynonyms(t *testing.T) {
	for _, header := range []string{"Node Type", "Kind", "node_type"} {
		t.Run(header, func(t *testing.T) {
			headers := []string{"Name", header, "Status"}
			m := InferMapping(headers)
			if _, ok := m["type"]; !ok {
				t.Errorf("expected synonym '%s' to map to 'type'", header)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/zach/code/grove && go test ./internal/api/ -run "TestInferMapping_TypeColumn|TestInferMapping_TypeSynonyms" -v
```

Expected: FAIL — `type` not in inference maps.

- [ ] **Step 3: Add type to inference maps**

In `internal/api/infer.go`, add to `exactMatches`:

```go
"type": "type",
```

Add to `synonyms`:

```go
// type
"node type":  "type",
"node_type":  "type",
"kind":       "type",
```

- [ ] **Step 4: Run inference tests**

```bash
cd /home/zach/code/grove && go test ./internal/api/ -run "TestInferMapping" -v
```

Expected: ALL PASS.

- [ ] **Step 5: Write failing test — parser extracts type field**

Add to `internal/parser/parser_test.go`:

```go
func TestBuildPeopleWithMapping_ProductRows(t *testing.T) {
	header := []string{"Name", "Type", "Status", "Manager"}
	rows := [][]string{
		{"Alice", "person", "Active", ""},
		{"Widget", "product", "Active", "Alice"},
		{"Bob", "", "Active", "Alice"},
	}
	mapping := map[string]string{
		"name": "Name", "type": "Type", "status": "Status", "manager": "Manager",
	}
	org, err := BuildPeopleWithMapping(header, rows, mapping)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 3 {
		t.Fatalf("expected 3 people, got %d", len(org.People))
	}
	if org.People[0].Type != "person" {
		t.Errorf("expected Alice type 'person', got '%s'", org.People[0].Type)
	}
	if org.People[1].Type != "product" {
		t.Errorf("expected Widget type 'product', got '%s'", org.People[1].Type)
	}
	if org.People[2].Type != "" {
		t.Errorf("expected Bob type '' (empty, defaults to person), got '%s'", org.People[2].Type)
	}
}
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd /home/zach/code/grove && go test ./internal/parser/ -run "TestBuildPeopleWithMapping_ProductRows" -v
```

Expected: FAIL — parser doesn't extract `type` field.

- [ ] **Step 7: Add type extraction to parser**

In `internal/parser/parser.go`, inside the row loop where the `OrgNode` is constructed, add after `Manager: get("manager"),`:

The `Type` field is part of `OrgNodeFields`, so add it to the struct literal:

```go
p := model.OrgNode{
	OrgNodeFields: model.OrgNodeFields{
		Type:           get("type"),
		Name:           get("name"),
		// ... rest of fields unchanged
	},
	Manager: get("manager"),
}
```

- [ ] **Step 8: Run parser test**

```bash
cd /home/zach/code/grove && go test ./internal/parser/ -run "TestBuildPeopleWithMapping_ProductRows" -v
```

Expected: PASS.

- [ ] **Step 9: Write failing test — export includes type column**

Add to `internal/api/export_test.go`:

```go
func TestExportCSV_WithProducts(t *testing.T) {
	people := []OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Type: "person", Name: "Alice", Role: "Eng", Status: "Active"}, Id: "1"},
		{OrgNodeFields: model.OrgNodeFields{Type: "product", Name: "Widget", Status: "Active"}, Id: "2", ManagerId: "1"},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	// Check header contains Type
	if !strings.Contains(lines[0], "Type") {
		t.Errorf("expected Type in header, got: %s", lines[0])
	}
	// Check Alice's row has "person"
	if !strings.Contains(lines[1], "person") {
		t.Errorf("expected 'person' in Alice's row, got: %s", lines[1])
	}
	// Check Widget's row has "product"
	if !strings.Contains(lines[2], "product") {
		t.Errorf("expected 'product' in Widget's row, got: %s", lines[2])
	}
}
```

Note: Adjust the struct literal syntax to match whatever the final `OrgNode` struct looks like after Task 3's rename (it embeds `OrgNodeFields` so use that field name).

- [ ] **Step 10: Run test to verify it fails**

```bash
cd /home/zach/code/grove && go test ./internal/api/ -run "TestExportCSV_WithProducts" -v
```

Expected: FAIL — no Type column in export.

- [ ] **Step 11: Add Type column to export**

In `internal/api/export.go`:

1. Add `"Type"` to `exportHeaders` — insert it as the second element (after "Name"):

```go
var exportHeaders = []string{"Name", "Type", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note", "Private"}
```

2. In `personToRow` (rename to `nodeToRow` if not already done), add `sanitizeCell(p.Type)` as the second element of the return slice:

```go
return []string{
	sanitizeCell(p.Name), sanitizeCell(p.Type), sanitizeCell(p.Role), sanitizeCell(p.Discipline),
	// ... rest unchanged
}
```

- [ ] **Step 12: Run all Go tests**

```bash
cd /home/zach/code/grove && go test ./... -count=1
```

Expected: ALL PASS. Some existing export tests may need header index adjustments due to the new Type column position.

- [ ] **Step 13: Commit**

```bash
jj describe -m "feat: add type column to CSV import/export and column inference"
jj new
```

---

### Task 5: Go — Product CRUD Tests

**Files:**
- Modify: `internal/api/service_test.go`

- [ ] **Step 1: Write product CRUD tests**

Add to `internal/api/service_test.go`:

```go
func TestOrgService_AddProduct(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
	})
	working := svc.GetWorking()
	aliceId := working[0].Id

	product := OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"},
		ManagerId:     aliceId,
	}
	created, updated, _, err := svc.Add(context.Background(), product)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created.Type != "product" {
		t.Errorf("expected type 'product', got '%s'", created.Type)
	}
	if created.ManagerId != aliceId {
		t.Errorf("expected managerId '%s', got '%s'", aliceId, created.ManagerId)
	}
	found := false
	for _, p := range updated {
		if p.Id == created.Id {
			found = true
			break
		}
	}
	if !found {
		t.Error("created product not found in working slice")
	}
}

func TestOrgService_MoveProduct(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking()
	widgetId := findById(working, "Widget").Id
	bobId := findById(working, "Bob").Id
	result, err := svc.Move(context.Background(), widgetId, bobId, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, p := range result.Working {
		if p.Id == widgetId {
			if p.ManagerId != bobId {
				t.Errorf("expected Widget under Bob, got managerId '%s'", p.ManagerId)
			}
			return
		}
	}
	t.Error("Widget not found in result")
}

func TestOrgService_MoveProductToPod(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active", Team: "Eng"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking()
	aliceId := findById(working, "Alice").Id
	widgetId := findById(working, "Widget").Id

	// Create a pod first
	_, err := svc.CreatePod(context.Background(), aliceId, "Alpha")
	if err != nil {
		t.Fatalf("unexpected error creating pod: %v", err)
	}

	result, err := svc.Move(context.Background(), widgetId, aliceId, "Eng", "Alpha")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, p := range result.Working {
		if p.Id == widgetId {
			if p.Pod != "Alpha" {
				t.Errorf("expected Widget in pod Alpha, got '%s'", p.Pod)
			}
			return
		}
	}
	t.Error("Widget not found in result")
}

func TestOrgService_DeleteProduct(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking()
	widgetId := findById(working, "Widget").Id
	result, err := svc.Delete(context.Background(), widgetId)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, p := range result.Working {
		if p.Id == widgetId {
			t.Error("Widget should not be in working after delete")
		}
	}
	found := false
	for _, p := range result.Recycled {
		if p.Id == widgetId {
			found = true
			if p.Type != "product" {
				t.Errorf("recycled Widget should keep type 'product', got '%s'", p.Type)
			}
		}
	}
	if !found {
		t.Error("Widget not found in recycled")
	}
}

func TestOrgService_RestoreProduct(t *testing.T) {
	svc := newTestService(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking()
	widgetId := findById(working, "Widget").Id
	_, err := svc.Delete(context.Background(), widgetId)
	if err != nil {
		t.Fatalf("unexpected error deleting: %v", err)
	}
	result, err := svc.Restore(context.Background(), widgetId)
	if err != nil {
		t.Fatalf("unexpected error restoring: %v", err)
	}
	found := false
	for _, p := range result.Working {
		if p.Id == widgetId {
			found = true
			if p.Type != "product" {
				t.Errorf("restored Widget should keep type 'product', got '%s'", p.Type)
			}
		}
	}
	if !found {
		t.Error("Widget not found in working after restore")
	}
}
```

- [ ] **Step 2: Run product CRUD tests**

```bash
cd /home/zach/code/grove && go test ./internal/api/ -run "TestOrgService_AddProduct|TestOrgService_MoveProduct|TestOrgService_DeleteProduct|TestOrgService_RestoreProduct" -v
```

Expected: ALL PASS (the behavior already works since products use the same CRUD paths as people — we're verifying the type field is preserved).

- [ ] **Step 3: Run full test suite**

```bash
cd /home/zach/code/grove && go test ./... -count=1
```

Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
jj describe -m "test: add product CRUD tests (PROD-001 through PROD-005)"
jj new
```

---

### Task 6: Frontend — Rename Person → OrgNode + Add Type

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/constants.ts`, `web/src/views/shared.tsx`
- Rename: `web/src/utils/personFormUtils.ts` → `web/src/utils/nodeFormUtils.ts`
- Rename: `web/src/hooks/usePersonNodeProps.ts` → `web/src/hooks/useNodeProps.ts`
- Rename: `web/src/components/PersonNode.tsx` → `web/src/components/OrgNodeCard.tsx`
- Rename: `web/src/components/PersonNode.module.css` → `web/src/components/OrgNodeCard.module.css`
- Rename: `web/src/components/PersonEditSidebar.tsx` → `web/src/components/NodeEditSidebar.tsx`
- Rename: `web/src/components/PersonForm.tsx` → `web/src/components/NodeForm.tsx`
- Modify: All ~120 files importing these types/components

This is the largest task — almost entirely mechanical find-and-replace.

- [ ] **Step 1: Update core type definitions**

In `web/src/constants.ts`, add after the existing person status constants:

```typescript
/** Node type */
export type NodeType = 'person' | 'product'

/** All valid product statuses */
export const PRODUCT_STATUSES = [
  'Active', 'Deprecated', 'Planned', 'Sunsetting',
] as const

export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

/** Default status for new products */
export const DEFAULT_PRODUCT_STATUS: ProductStatus = 'Active'

/** Human-readable descriptions for product statuses */
export const PRODUCT_STATUS_DESCRIPTIONS: Record<ProductStatus, string> = {
  'Active': 'Currently maintained and supported',
  'Deprecated': 'No longer actively maintained',
  'Planned': 'Planned for development',
  'Sunsetting': 'Being phased out',
}

/** Check valid status for a given node type */
export function isValidStatusForType(status: string, type: NodeType | undefined): boolean {
  if (type === 'product') {
    return (PRODUCT_STATUSES as readonly string[]).includes(status)
  }
  return (STATUSES as readonly string[]).includes(status)
}

/** Get valid statuses for a node type */
export function statusesForType(type: NodeType | undefined): readonly string[] {
  return type === 'product' ? PRODUCT_STATUSES : STATUSES
}
```

In `web/src/api/types.ts`, rename:
- `Person` → `OrgNode`
- `PersonUpdatePayload` → `OrgNodeUpdatePayload`
- Add `type?: NodeType` field to `OrgNode` (after `id`)
- Update all interfaces that reference `Person[]` → `OrgNode[]`
- Update `UpdatePayload.fields` type to `OrgNodeUpdatePayload`

In `web/src/views/shared.tsx`, rename:
- `OrgNode` interface → `TreeNode`
- `buildOrgTree` return type and internal references to use `TreeNode`

- [ ] **Step 2: Rename component and utility files**

```bash
cd /home/zach/code/grove/web/src
mv components/PersonNode.tsx components/OrgNodeCard.tsx
mv components/PersonNode.module.css components/OrgNodeCard.module.css
mv components/PersonEditSidebar.tsx components/NodeEditSidebar.tsx
mv components/PersonForm.tsx components/NodeForm.tsx
mv utils/personFormUtils.ts utils/nodeFormUtils.ts
mv hooks/usePersonNodeProps.ts hooks/useNodeProps.ts
```

Inside each renamed file, update:
- `OrgNodeCard.tsx`: import from `./OrgNodeCard.module.css`, rename `PersonNodeInner` → `OrgNodeCardInner`, rename export `PersonNode` → `OrgNodeCard`
- `nodeFormUtils.ts`: rename `PersonFormValues` → `NodeFormValues`, `personToForm` → `nodeToForm`, `PersonUpdatePayload` → `OrgNodeUpdatePayload`
- `useNodeProps.ts`: rename `PersonNodeCommonProps` → `NodeCommonProps`, `usePersonNodeProps` → `useNodeProps`
- `NodeEditSidebar.tsx`: rename `PersonEditSidebar` → `NodeEditSidebar`
- `NodeForm.tsx`: rename `PersonForm` → `NodeForm`, `PersonFormProps` → `NodeFormProps`

- [ ] **Step 3: Update all imports across the codebase**

This is a bulk find-and-replace across all `.ts` and `.tsx` files. The key replacements:

| Old | New |
|-----|-----|
| `Person` (type import from types.ts) | `OrgNode` |
| `PersonUpdatePayload` | `OrgNodeUpdatePayload` |
| `PersonChange` (from useOrgDiff) | `NodeChange` |
| `PersonFormValues` (from personFormUtils) | `NodeFormValues` |
| `PersonNodeCommonProps` | `NodeCommonProps` |
| `usePersonNodeProps` | `useNodeProps` |
| `PersonNode` (component import) | `OrgNodeCard` |
| `PersonEditSidebar` | `NodeEditSidebar` |
| `PersonForm` | `NodeForm` |
| `personToForm` | `nodeToForm` |
| `import.*from.*personFormUtils` | update path to `nodeFormUtils` |
| `import.*from.*usePersonNodeProps` | update path to `useNodeProps` |
| `import.*from.*PersonNode` | update path to `OrgNodeCard` |
| `import.*from.*PersonEditSidebar` | update path to `NodeEditSidebar` |
| `import.*from.*PersonForm` | update path to `NodeForm` |
| `OrgNode` (tree type from shared.tsx) | `TreeNode` |

In `web/src/hooks/useOrgDiff.ts`, rename `PersonChange` → `NodeChange`.

In `web/src/api/client.ts`, rename:
- `movePerson` → `moveNode`
- `updatePerson` → `updateNode`
- `addPerson` → `addNode`
- `deletePerson` → `deleteNode`
- `restorePerson` → `restoreNode`

In `web/src/store/orgTypes.ts`, update all `Person` → `OrgNode`, `PersonFormValues` → `NodeFormValues`, `PersonUpdatePayload` → `OrgNodeUpdatePayload`.

In `web/src/store/useInteractionState.ts`, update `PersonFormValues` → `NodeFormValues`, `EditBuffer` type alias.

In `web/src/views/ChartContext.tsx`, update all `Person` → `OrgNode`, `PersonChange` → `NodeChange`, `PersonFormValues` → `NodeFormValues`.

- [ ] **Step 4: Also rename test files that reference old component names**

```bash
cd /home/zach/code/grove/web/src
mv components/PersonNode.golden.test.tsx components/OrgNodeCard.golden.test.tsx
mv components/PersonNode.a11y.test.tsx components/OrgNodeCard.a11y.test.tsx
mv components/PersonNode.test.tsx components/OrgNodeCard.test.tsx
mv utils/personFormUtils.test.ts utils/nodeFormUtils.test.ts
```

Update all test files to use the new type/component names. Update `makePerson` helper in `test-helpers.tsx` to `makeNode`.

- [ ] **Step 5: Verify TypeScript compilation**

```bash
cd /home/zach/code/grove/web && npx tsc --noEmit
```

Expected: No errors. Fix any remaining import/reference issues.

- [ ] **Step 6: Run frontend tests**

```bash
cd /home/zach/code/grove/web && npm test -- --run
```

Expected: Tests pass. Golden snapshot tests will fail and need updating — regenerate them.

- [ ] **Step 7: Regenerate golden snapshots**

```bash
cd /home/zach/code/grove/web && npm test -- --run -u
```

Verify the snapshot diffs only show the expected renames (e.g., `person-Alice` test IDs now reference `OrgNodeCard`).

- [ ] **Step 8: Commit**

```bash
jj describe -m "refactor: rename Person → OrgNode across frontend, add NodeType and product statuses"
jj new
```

---

### Task 7: Frontend — Product Card Rendering

**Files:**
- Modify: `web/src/components/OrgNodeCard.tsx`

- [ ] **Step 1: Write failing test — product card hides role and shows product styling**

Add to `web/src/components/OrgNodeCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import OrgNodeCard from './OrgNodeCard'
import { makeNode } from '../test-helpers'

test('[PROD-001] product card does not show role', () => {
  const product = makeNode({ name: 'Widget', type: 'product', role: '' })
  render(<OrgNodeCard person={product} />)
  // Product should show name
  expect(screen.getByText('Widget')).toBeInTheDocument()
  // Should not show "TBD" (the default when role is empty for people)
  expect(screen.queryByText('TBD')).not.toBeInTheDocument()
})

test('[PROD-001] product card shows non-active status', () => {
  const product = makeNode({ name: 'Widget', type: 'product', status: 'Deprecated' as any })
  render(<OrgNodeCard person={product} />)
  expect(screen.getByText(/Deprecated/)).toBeInTheDocument()
})
```

Note: Wrap in appropriate dnd-kit and context providers as existing tests do.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/zach/code/grove/web && npx vitest run src/components/OrgNodeCard.test.tsx -t "PROD-001"
```

Expected: FAIL — product rendering not implemented yet (shows "TBD" for empty role).

- [ ] **Step 3: Implement product card variant**

In `web/src/components/OrgNodeCard.tsx`, modify `OrgNodeCardInner`:

```tsx
const isProduct = person.type === 'product'

// For products, don't show recruiting/planned/transfer status styling —
// those are person-only statuses. Products show their own status text.
const isRecruiting = !isProduct && isRecruitingStatus(person.status)
const isFuture = !isProduct && isPlannedStatus(person.status)
const isTransfer = !isProduct && isTransferStatus(person.status)

// Product status label (shown if not Active)
const productStatusLabel = isProduct && person.status !== 'Active' ? person.status : null
```

Update the JSX to conditionally render:
- For products: show name, product status badge (if not Active), no role line, no employment type
- For people: existing rendering unchanged

```tsx
{/* Role line — people only */}
{!isProduct && (
  <div className={styles.role} onDoubleClick={handleDoubleClick('role')}>
    {editing && editBuffer ? (
      <input ref={roleRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.role} onChange={(e) => onUpdateBuffer?.('role', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
    ) : (
      <>{person.role || 'TBD'}{empAbbrev && <span className={styles.empAbbrev}> &middot; {empAbbrev}</span>}</>
    )}
  </div>
)}
{/* Product status badge */}
{productStatusLabel && (
  <div className={styles.role}>{productStatusLabel}</div>
)}
```

Also, for the `actions` object — products don't get the `onAdd` action:

```tsx
if (onAdd && !isProduct) actions.onAdd = (e) => { e.stopPropagation(); onAdd() }
```

And set `droppable={!ghost && !isPlaceholder && !isProduct}` on BaseNode to prevent products from being drop targets.

- [ ] **Step 4: Run tests**

```bash
cd /home/zach/code/grove/web && npx vitest run src/components/OrgNodeCard.test.tsx
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: product card rendering variant — no role, no add button, not droppable"
jj new
```

---

### Task 8: Frontend — Edit Sidebar Type Switching

**Files:**
- Modify: `web/src/components/NodeEditSidebar.tsx` (formerly PersonEditSidebar)
- Modify: `web/src/components/NodeForm.tsx` (formerly PersonForm)
- Modify: `web/src/utils/nodeFormUtils.ts` (formerly personFormUtils)

- [ ] **Step 1: Add type field to NodeFormValues**

In `web/src/utils/nodeFormUtils.ts`:

Add `type: string` to `NodeFormValues` interface.

Update `blankForm()` to include `type: 'person'`.

Update `nodeToForm()` to include `type: p.type || 'person'`.

Update `batchToForm()` to include type handling.

Update `dirtyToApiPayload()`: when type changes to `'product'`, include clearing of person-only fields.

- [ ] **Step 2: Add type dropdown to NodeForm**

In `web/src/components/NodeForm.tsx`:

Add a "Type" select dropdown at the top of the form:

```tsx
<label>
  Type
  <select
    value={values.type}
    onChange={(e) => {
      onChange('type', e.target.value)
      // When switching to product, clear person-only fields and reset status
      if (e.target.value === 'product') {
        onChange('role', '')
        onChange('discipline', '')
        onChange('employmentType', '')
        onChange('level', '0')
        onChange('otherTeams', '')
        // Reset status if current status isn't valid for products
        if (!isValidStatusForType(values.status, 'product')) {
          onChange('status', 'Active')
        }
      }
    }}
  >
    <option value="person">Person</option>
    <option value="product">Product</option>
  </select>
</label>
```

Conditionally hide person-only fields when `values.type === 'product'`:

```tsx
{values.type !== 'product' && (
  <>
    {/* Role, Discipline, Employment Type, Level, Additional Teams fields */}
  </>
)}
```

Update the Status dropdown to use `statusesForType(values.type as NodeType)` for the options list.

- [ ] **Step 3: Run frontend tests**

```bash
cd /home/zach/code/grove/web && npx vitest run src/components/NodeForm --run
cd /home/zach/code/grove/web && npx vitest run src/components/NodeEditSidebar --run
```

Expected: PASS. Existing tests work (they use person type by default).

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: type dropdown in edit sidebar, field hiding for products, type-switch clearing"
jj new
```

---

### Task 9: Frontend — Metrics & Diff Changes

**Files:**
- Modify: `web/src/hooks/useOrgDiff.ts`
- Modify: `web/src/hooks/useOrgMetrics.ts`

- [ ] **Step 1: Write failing test — diff detects type change**

Add to `web/src/hooks/useOrgDiff.test.ts`:

```typescript
test('[PROD-008] detects type change', () => {
  const original = [makeNode({ id: '1', name: 'Widget', type: 'person' })]
  const working = [makeNode({ id: '1', name: 'Widget', type: 'product' })]
  const result = renderHook(() => useOrgDiff(original, working)).result.current
  expect(result.get('1')?.types.has('type')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/zach/code/grove/web && npx vitest run src/hooks/useOrgDiff.test.ts -t "PROD-008"
```

Expected: FAIL — `type` change not detected.

- [ ] **Step 3: Add type change detection to useOrgDiff**

In `web/src/hooks/useOrgDiff.ts`:

Add `'type'` to the `ChangeType` union:

```typescript
export type ChangeType = 'added' | 'removed' | 'reporting' | 'title' | 'reorg' | 'pod' | 'type'
```

In the comparison loop, add after the pod check:

```typescript
if ((w.type ?? 'person') !== (o.type ?? 'person')) types.add('type')
```

- [ ] **Step 4: Run diff test**

```bash
cd /home/zach/code/grove/web && npx vitest run src/hooks/useOrgDiff.test.ts
```

Expected: ALL PASS.

- [ ] **Step 5: Write failing test — metrics exclude products from headcount**

Add to `web/src/hooks/useOrgMetrics.test.ts`:

```typescript
test('[PROD-009] products excluded from headcount', () => {
  const people = [
    makeNode({ id: '1', name: 'Alice', status: 'Active' }),
    makeNode({ id: '2', name: 'Bob', status: 'Active', managerId: '1' }),
    makeNode({ id: '3', name: 'Widget', type: 'product', status: 'Active', managerId: '1' }),
  ]
  const metrics = computeOrgMetrics('1', people)
  expect(metrics.totalHeadcount).toBe(1) // Only Bob
  expect(metrics.productCount).toBe(1) // Widget
})

test('[PROD-010] products excluded from span of control', () => {
  const people = [
    makeNode({ id: '1', name: 'Alice', status: 'Active' }),
    makeNode({ id: '2', name: 'Bob', status: 'Active', managerId: '1' }),
    makeNode({ id: '3', name: 'Widget', type: 'product', status: 'Active', managerId: '1' }),
    makeNode({ id: '4', name: 'Gadget', type: 'product', status: 'Active', managerId: '1' }),
  ]
  const metrics = computeOrgMetrics('1', people)
  expect(metrics.spanOfControl).toBe(1) // Only Bob, not products
  expect(metrics.productCount).toBe(2)
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd /home/zach/code/grove/web && npx vitest run src/hooks/useOrgMetrics.test.ts -t "PROD-009|PROD-010"
```

Expected: FAIL — `productCount` doesn't exist, products counted in headcount.

- [ ] **Step 7: Implement metrics changes**

In `web/src/hooks/useOrgMetrics.ts`:

Add `productCount: number` to `OrgMetrics` interface.

Add `productCount: number` to `TeamPodGroup` interface.

Update `computeOrgMetrics`:

```typescript
// spanOfControl — exclude products
const directReports = childrenMap.get(personId) || []
metrics.spanOfControl = directReports.filter(p => p.type !== 'product').length

// Initialize productCount
metrics.productCount = 0
```

In the `walk` function:

```typescript
function walk(pid: string) {
  const reports = childrenMap.get(pid) || []
  for (const r of reports) {
    if (r.type === 'product') {
      metrics.productCount++
      // Count in group but not in headcount/discipline
      const groupKey = r.pod || r.team || 'Unassigned'
      // ... increment group productCount
      walk(r.id)
      continue
    }
    metrics.totalHeadcount++
    // ... rest of existing logic
  }
}
```

Initialize `productCount: 0` in each `TeamPodGroup` entry and increment it for products.

- [ ] **Step 8: Run all metrics tests**

```bash
cd /home/zach/code/grove/web && npx vitest run src/hooks/useOrgMetrics.test.ts
```

Expected: ALL PASS.

- [ ] **Step 9: Update ManagerInfoPopover to display productCount**

In `web/src/components/ManagerInfoPopover.tsx`, add a line item for product count when `metrics.productCount > 0`:

```tsx
{metrics.productCount > 0 && (
  <div>Products: {metrics.productCount}</div>
)}
```

This displays separately from headcount, recruiting, and other people-centric metrics.

- [ ] **Step 10: Run popover tests**

```bash
cd /home/zach/code/grove/web && npx vitest run src/components/ManagerInfoPopover.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
jj describe -m "feat: diff mode type detection, metrics exclude products from headcount/span, popover shows product count"
jj new
```

---

### Task 10: Frontend — Layout Product Grouping

**Files:**
- Modify: `web/src/views/layoutTree.ts`

- [ ] **Step 1: Write failing test — products grouped separately**

Add to `web/src/views/layoutTree.test.ts`:

```typescript
test('products grouped separately from ICs', () => {
  const tree = buildOrgTree([
    makeNode({ id: '1', name: 'Alice', status: 'Active' }),
    makeNode({ id: '2', name: 'Bob', status: 'Active', managerId: '1' }),
    makeNode({ id: '3', name: 'Widget', type: 'product', status: 'Active', managerId: '1' }),
  ])
  const layout = computeLayoutTree(tree)
  // Alice is a manager with children
  expect(layout).toHaveLength(1)
  const aliceLayout = layout[0] as ManagerLayout
  expect(aliceLayout.type).toBe('manager')
  // Should have Bob as IC and Widget in a product group
  const productGroups = aliceLayout.children.filter(c => c.type === 'productGroup')
  expect(productGroups).toHaveLength(1)
  const ics = aliceLayout.children.filter(c => c.type === 'ic')
  expect(ics).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/zach/code/grove/web && npx vitest run src/views/layoutTree.test.ts -t "products grouped separately"
```

Expected: FAIL — no `productGroup` layout type.

- [ ] **Step 3: Add ProductGroupLayout type and grouping logic**

In `web/src/views/layoutTree.ts`:

Add new layout type:

```typescript
export interface ProductGroupLayout {
  type: 'productGroup'
  collapseKey: string
  members: ProductLayout[]
}

export interface ProductLayout {
  type: 'product'
  person: OrgNode
}

export type LayoutNode = ManagerLayout | ICLayout | PodGroupLayout | TeamGroupLayout | ProductGroupLayout | ProductLayout
```

In `buildManagerLayout`, separate products from ICs before grouping:

```typescript
function buildManagerLayout(node: TreeNode): ManagerLayout {
  const products = node.children.filter(c => c.person.type === 'product')
  const nonProducts = node.children.filter(c => c.person.type !== 'product')
  
  // Build existing layout from non-product children
  const children: LayoutNode[] = /* existing logic using nonProducts instead of node.children */
  
  // Add product group if any products exist
  if (products.length > 0) {
    children.push({
      type: 'productGroup',
      collapseKey: `products:${node.person.id}`,
      members: products.map(p => ({
        type: 'product' as const,
        person: p.person,
      })),
    })
  }
  
  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
  }
}
```

- [ ] **Step 4: Update ColumnView and ManagerView to render ProductGroupLayout**

In `web/src/views/ColumnView.tsx`, add a case for `productGroup` in the layout rendering switch:

```tsx
case 'productGroup':
  return (
    <div key={node.collapseKey} className={styles.productGroup}>
      <div className={styles.groupHeader}>Products</div>
      {node.members.map(member => (
        <DraggableNode key={member.person.id} id={member.person.id}>
          <OrgNodeCard person={member.person} {...useNodeProps(member.person)} />
        </DraggableNode>
      ))}
    </div>
  )
```

Similarly update `ManagerView.tsx` for the product group rendering in manager summary cards.

- [ ] **Step 5: Run layout and view tests**

```bash
cd /home/zach/code/grove/web && npx vitest run src/views/layoutTree.test.ts src/views/ColumnView.test.tsx src/views/ManagerView.test.tsx
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: products grouped separately in layout tree with ProductGroupLayout"
jj new
```

---

### Task 11: Frontend — Manager View Product Summary

**Files:**
- Modify: `web/src/views/ManagerView.tsx`

- [ ] **Step 1: Update buildStatusGroups to separate products**

In `web/src/views/ManagerView.tsx`, the `buildStatusGroups` function currently counts all children. Update it to exclude products from the people status breakdown and add a separate product count:

```typescript
function buildStatusGroups(people: OrgNode[]): { label: string; count: number }[] {
  const nonProducts = people.filter(p => p.type !== 'product')
  const productCount = people.length - nonProducts.length
  
  // Existing logic using nonProducts instead of people
  const groups = /* existing status grouping on nonProducts */
  
  if (productCount > 0) {
    groups.push({ label: 'Products', count: productCount })
  }
  
  return groups
}
```

- [ ] **Step 2: Run manager view tests**

```bash
cd /home/zach/code/grove/web && npx vitest run src/views/ManagerView.test.tsx
```

Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
jj describe -m "feat: manager view shows products separately in summary cards"
jj new
```

---

### Task 12: Frontend — Product-Specific Tests

**Files:**
- Modify: `web/src/hooks/useDragDrop.test.ts`
- Modify: `web/src/components/OrgNodeCard.test.tsx`

- [ ] **Step 1: Write drag-drop test — products not valid drop targets**

Add to `web/src/components/OrgNodeCard.test.tsx`:

```tsx
test('product node renders with droppable disabled', () => {
  const product = makeNode({ name: 'Widget', type: 'product' })
  const { container } = render(
    <OrgNodeCard person={product} />
  )
  // Product cards have droppable={false} on BaseNode, so they should not
  // have the droppable data attribute that dnd-kit sets
  const card = container.querySelector('[data-testid="person-Widget"]')
  expect(card).toBeInTheDocument()
  // The absence of drop indicator styling confirms non-droppable
})
```

- [ ] **Step 2: Run test**

```bash
cd /home/zach/code/grove/web && npx vitest run src/hooks/useDragDrop.test.ts
```

Expected: PASS (droppable={false} was set in Task 7).

- [ ] **Step 3: Run full frontend test suite**

```bash
cd /home/zach/code/grove/web && npm test -- --run
```

Expected: ALL PASS. If golden tests fail, update them:

```bash
cd /home/zach/code/grove/web && npm test -- --run -u
```

- [ ] **Step 4: Commit**

```bash
jj describe -m "test: product drag-drop and rendering tests, update golden snapshots"
jj new
```

---

### Task 13: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run complete Go test suite**

```bash
cd /home/zach/code/grove && go test ./... -count=1
```

Expected: ALL PASS.

- [ ] **Step 2: Run complete frontend test suite**

```bash
cd /home/zach/code/grove/web && npm test -- --run
```

Expected: ALL PASS.

- [ ] **Step 3: Build the full application**

```bash
cd /home/zach/code/grove && make build
```

Expected: Builds successfully.

- [ ] **Step 4: Run scenario check**

```bash
cd /home/zach/code/grove && make check-scenarios
```

Expected: All PROD-xxx scenario IDs have corresponding test references.

- [ ] **Step 5: Start dev server and manually test**

```bash
cd /home/zach/code/grove && make dev
```

Test in browser:
1. Upload a CSV — verify existing org chart renders normally
2. Add a product via sidebar (change type dropdown to "product")
3. Verify product card shows name + status, no role, no + button
4. Drag product to a different manager — works
5. Try dropping a person onto a product — rejected (no drop indicator)
6. Check metrics popover — products listed separately, not in headcount
7. Toggle diff mode — verify product changes detected

- [ ] **Step 6: Final commit if any fixes needed**

```bash
jj describe -m "fix: integration test fixes for products feature"
jj new
```
