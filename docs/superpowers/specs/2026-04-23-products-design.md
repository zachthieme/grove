# Products Feature Design

Status: **Design complete — all sections approved**

## Summary

Add "products" (things a team owns) as a new node type in the org chart, displayed alongside people under a manager.

## Decisions Made

### Data Model (approved)

- **Rename `Person` to `OrgNode`** across Go and TypeScript
- Existing `OrgNode` in `shared.tsx` (tree wrapper) becomes `TreeNode`
- `PersonUpdate` → `OrgNodeUpdate`, `PersonNode` → `OrgNodeCard`

**OrgNode fields:**
- `type` — `"person"` (default) or `"product"`
- `status` — single field, valid values depend on type:
  - Person: Active, Open, Transfer In, Transfer Out, Backfill, Planned
  - Product: Active, Deprecated, Planned, Sunsetting
  - Active is default for both, hidden in rendering for both
- **Shared:** `id`, `name`, `managerId`, `pod`, `team`, `publicNote`, `privateNote`, `sortIndex`, `extra`
- **Person-only (empty for products):** `role`, `discipline`, `level`, `employmentType`, `additionalTeams`
- **Product-only:** none currently — status covers it

### What a Product Is (approved)

- A label/card — name, notes, optional status. No people assigned to it.
- Sits visually alongside people under a manager, optionally within a pod
- One manager only — not shared across managers
- Draggable to managers or pods (dropping on a pod moves to that pod's manager AND into the pod)

### Import/Export (approved)

- Same CSV as people — one `type` column (person/product, default person)
- One `status` column — interpretation depends on `type`
- Product rows leave person-specific columns (role, discipline, etc.) empty
- No backward compat needed — user is sole user, fine with manual CSV changes

## Section 2: Rendering & Layout (approved)

- **Tree building** — No changes. Products have `managerId`, placed as children automatically.
- **Layout tree** — Products grouped separately from ICs, rendered as their own visual group (with a "Products" group header, similar to pod headers) rather than interleaved with people.
- **Card rendering** — `OrgNodeCard` checks `type`:
  - Person: name, role, discipline, status badge, hover actions (+/edit/delete/info)
  - Product: name, status badge (if not active), hover actions (edit/delete/info, no + button)
- **Edit sidebar** — Hides person-only fields for products. Shows type dropdown to switch. Switching person → product clears person-only fields (role, discipline, level, employmentType, additionalTeams) and resets status to Active if the current status isn't valid for products.
- **Manager view summaries** — Products listed separately (names + status) rather than mixed into people breakdowns.

## Section 3: Drag & Drop (approved)

- **Products as drag sources** — Draggable like people. Participate in multi-select (lasso/shift-click). No changes to `idsToMove` computation.
- **Valid drop targets for products** — Manager nodes, pod drop zones, team drop zones. Same `move`/`reparent` calls as people.
- **Products are NOT drop targets** — Cannot drop people or products onto a product. No drop indicator on product cards.
- **Drag badge** — Multi-select badge shows total count regardless of type mix.
- **Validation** — Single new check in `validateManagerChange`: reject if target is a product (not a person). Backend `Move` already validates `managerId` exists.

## Section 4: API Changes (approved)

- **Rename throughout** — `Person` → `OrgNode`, `PersonFields` → `OrgNodeFields`, `PersonUpdate` → `OrgNodeUpdate` in Go and TypeScript. JSON field names unchanged (no wire-format changes).
- **New `type` field** — `OrgNode` gets `Type string` (json `"type"`), default `"person"`. Valid: `"person"`, `"product"`. Carried in `model.OrgNodeFields` for CSV parsing and persistence.
- **Validation changes:**
  - `validateManagerChange` — reject if target node has `Type == "product"` (`errValidation("cannot report to a product")`).
  - `validatePersonUpdate` → `validateNodeUpdate` — skip person-only field validation for products; validate status against product-valid set.
  - `Add` endpoint — accept `type` in request, default to `"person"`.
- **No new endpoints** — Products use same CRUD (`Move`, `Update`, `Add`, `Delete`, `Restore`). `type` flows through the shared `OrgNode` struct.
- **Response types** — `[]Person` → `[]OrgNode` in `OrgData`, `WorkingResponse`, `AddResponse`, `MutationResponse`, `AutosaveData`. Wire format unchanged.
- **Import** — `InferMapping` adds `"type"` to column inference synonyms (`"node_type"`, `"kind"`). Missing column defaults all rows to `"person"`.

## Section 5: Metrics & Diff Mode (approved)

- **Diff mode** — `useOrgDiff` works unchanged for existing change types (`reporting`, `title`, `reorg`, `pod`, `added`, `removed`). Products have stable UUIDs and same diffed fields. One addition: new `"type"` change type if a node's `type` changes between original and working.
- **Metrics** — `computeOrgMetrics` separates products from people:
  - New `productCount: number` in `OrgMetrics` for total products in subtree.
  - `walk` checks `type`: products increment `productCount` only, NOT `totalHeadcount`, `recruiting`, `planned`, `transfers`, or `byDiscipline`.
  - `spanOfControl` — excludes products (people-management metric). Filter children list.
  - `byTeamPod` groups — add `productCount` to `TeamPodGroup` interface. Products counted separately per group (e.g., "Pod Alpha: 5 people, 2 products").
- **Info popover / sidebar** — Display product count as own line item ("Products: 3") separate from headcount breakdowns.

## Section 6: Testing (approved)

**Scenario file** — New `docs/scenarios/products.md`:
- `PROD-001` — Add a product under a manager
- `PROD-002` — Move a product to a different manager
- `PROD-003` — Move a product into a pod
- `PROD-004` — Reject dropping a person/product onto a product
- `PROD-005` — Delete and restore a product
- `PROD-006` — Import CSV with product rows
- `PROD-007` — Export preserves product type
- `PROD-008` — Diff mode detects product changes
- `PROD-009` — Metrics exclude products from headcount
- `PROD-010` — Products excluded from span of control

**Go backend tests:**
- `service_test.go` — CRUD for product-type nodes. Validate `validateManagerChange` rejects product as manager.
- `infer_test.go` — Column inference for `type`/`node_type`/`kind`.
- `export_test.go` — Round-trip CSV with products preserves `type` column.
- `zipimport_test.go` — ZIP with product rows parses correctly.
- Existing tests pass unchanged (person is default type; rename is compile-time).

**Frontend tests:**
- `useOrgDiff.test.ts` — `type` change detection.
- `useOrgMetrics.test.ts` — Products excluded from headcount/span, included in `productCount`.
- `OrgNodeCard.test.tsx` (renamed from `PersonNode.test.tsx`) — Product card variant rendering.
- `useDragDrop.test.ts` — Products not valid drop targets.
- `DetailSidebar.test.tsx` — Person-only fields hidden for products, type dropdown.
- Golden tests — Update affected snapshots after rename.
