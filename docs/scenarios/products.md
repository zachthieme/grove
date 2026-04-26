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

# Scenario: Product nests inside its pod

**ID**: PROD-003
**Area**: products
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_MoveProductToPod"
- `web/src/views/layoutTree.test.ts` → "[PROD-003]"

## Behavior
A product can carry a pod assignment. When it does, the column-view layout nests it inside the corresponding pod group, rendered as a side-by-side column next to the pod's people. There is no "Products" label anywhere — the slate-coloured product card styling carries the type distinction.

A product without a pod surfaces in a header-less product cluster directly under its manager.

## Invariants
- A product whose `pod` matches a pod-grouped people-bucket attaches to that `PodGroupLayout` via the optional `products` field (not as a sibling group).
- A pod containing only products still emits a `PodGroupLayout` (with `members: []` and `products: [...]`) so the pod label is preserved.
- Products without a pod produce a `ProductGroupLayout` at the manager level; rendering omits the group header entirely — the slate node styling carries the product distinction.
- Edges: pod-group's edge target is the first member, falling back to the first product when the pod has no people. Standalone product groups draw a single edge from the manager to the first product (no header intermediate).
- Rendering: inside a pod group the people stack and the product stack render as **two adjacent columns** under the pod header, never merged into one column.

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

---

# Scenario: Toggle product visibility

**ID**: PROD-012
**Area**: products
**Tests**:
- `web/src/hooks/useFilteredPeople.test.ts` → "[PROD-012]"

## Behavior
The toolbar's Filters dropdown exposes a "Products" checkbox. When unchecked, product nodes are hidden from the chart everywhere they would otherwise render: live cards, ghost cards in diff mode, and any derived counts in views that consume the filtered list.

## Invariants
- `useFilteredPeople` accepts a `showProducts` flag (default true).
- When `showProducts` is false, products are removed from `people` AND from `ghostPeople` (diff view).
- The Products toggle row only appears when at least one product exists in the working data.
- The "No type" employment-type bucket excludes products (products legitimately have no employment type).

## Edge cases
- A pod containing only products: still surfaces in `byTeamPod` with `count: 0` and the relevant `productCount`, so the pod doesn't disappear when products are filtered out.
- Toggling Products off while a product is selected: selection persists in state but the card is not rendered until Products is re-enabled.

---

# Scenario: Add product action on person/manager cards

**ID**: PROD-015
**Area**: products
**Tests**:
- `web/src/components/OrgNodeCard.test.tsx` → "[PROD-015]"
- `web/src/store/ViewDataContext.test.tsx` → "[PROD-015]"

## Behavior
A non-product card and a pod group header expose an "Add product" hover affordance (button labeled `+◆`). Clicking it creates a new product as a direct report of that node (or pod's manager), with `type: 'product'`, default name "New Product", and the parent's team. From a pod header the new product is assigned to that pod.

## Invariants
- The button is rendered only when `onAddProduct` is wired and the card is not a product node.
- `handleAddProduct(parentId)` calls the `add` mutation with `{ type: 'product', name: 'New Product', managerId: parentId, team: parent.team }` and an empty `employmentType`.
- `handleAddProduct(parentId, team, podName)` overrides the team and assigns the product to the named pod.

---

# Scenario: Product card exposes only delete affordance

**ID**: PROD-014
**Area**: products
**Tests**:
- `web/src/components/OrgNodeCard.test.tsx` → "[PROD-014]"

## Behavior
A product node renders only the delete (×) hover action. Add-report (+), add-parent (↑+), info (ℹ), and focus (⊙) buttons that appear on person/manager cards are suppressed for products.

## Invariants
- When `isProduct(person)` is true, `BaseNodeActions` passed to `BaseNode` contains only `onDelete` (when supplied).
- `onAdd`, `onAddParent`, `onInfo`, `onFocus` callbacks supplied to `OrgNodeCard` are ignored for product nodes.

---

# Scenario: Orphan products bucket separately from people

**ID**: PROD-013
**Area**: products
**Tests**:
- `web/src/views/layoutTree.test.ts` → "[PROD-013]"

## Behavior
A product whose manager has been removed (or that imports without a manager) must surface in the chart without being treated as a "team member." It belongs in a top-level product group, not a team group.

## Invariants
- Orphan products are bucketed into a single `productGroup` with `collapseKey: 'orphan:products'`.
- Orphan people continue to bucket into `teamGroup`s by `team`, unchanged.
- A single orphan with no other roots still becomes a manager layout (existing rule preserved).

---

# Scenario: Pod header count excludes products

**ID**: PROD-016
**Area**: products
**Tests**:
- `web/src/views/ColumnViewBranches.test.tsx` → "[PROD-016]"

## Behavior
The pod header card shows a member count labelled "person/people". Products carried inside the same pod are not added to that count — only the people (`members`) are counted.

## Invariants
- A pod with N people and M products renders "N person/people" in the pod header, never "N+M".
- The grammatical form follows the people count alone: 1 person → "1 person", >1 person → "N people".

## Edge cases
- A pod containing only products (`members: []`, `products: [...]`) hides the count line entirely — no "0 people" shown — so the header reads as just the pod name.
