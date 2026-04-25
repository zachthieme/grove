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
- New `type` change type in NodeChange
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

# Scenario: Change a node's type via update

**ID**: PROD-011
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_TypeChange"
- `internal/api/service_test.go` → "TestOrgService_Update_TypeChange_RevalidatesStatus"
- `internal/api/service_test.go` → "TestOrgService_Update_InvalidType"

## Behavior
A node's type can be changed between "person" and "product" via the update endpoint. Switching to product clears person-only fields (role, discipline, employmentType, level, additionalTeams). Status is validated against the new type.

## Invariants
- Type must be "person" or "product"; other values rejected with ValidationError
- Type change persists in working slice
- After switching to product, person-only fields are zeroed
- Status validation uses the post-change type, so a person-only status on a product is rejected

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
