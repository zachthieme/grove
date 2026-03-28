# View Scenarios

---

# Scenario: Column view (detail view)

**ID**: VIEW-001
**Area**: views
**Tests**:
- `web/e2e/smoke.spec.ts` → "upload CSV and see org chart"
- `web/e2e/smoke.spec.ts` → "switch between views"
- `web/src/views/columnLayout.test.ts` → "computeRenderItems"
- `web/src/views/columnEdges.test.ts` → "computeEdges"

## Behavior
The default view shows managers as horizontal columns with their ICs stacked vertically. Managers with cross-team ICs have affinity reordering to minimize edge crossings.

## Invariants
- Managers rendered left-to-right
- ICs stacked vertically under their manager
- Affiliated ICs placed after highest-indexed connected manager
- Unaffiliated ICs grouped by team (or pod if set)
- Edges connect managers to their team groupings

## Edge cases
- No managers (ICs only) — renders as flat list
- Single person org — one root node

---

# Scenario: Manager view

**ID**: VIEW-002
**Area**: views
**Tests**:
- `web/e2e/smoke.spec.ts` → "switch between views"

## Behavior
Shows only managers as nodes, with ICs summarized as cards under each manager.

## Invariants
- Only people with direct reports shown as full nodes
- ICs displayed as summary counts/cards
- Same drag-drop behavior as column view

## Edge cases
- None

---

# Scenario: Table view

**ID**: VIEW-003
**Area**: views
**Tests**:
- `web/e2e/smoke.spec.ts` → "switch between views"
- `web/e2e/smoke.spec.ts` → "table inline edit"
- `web/e2e/features.spec.ts` → "table paste"
- `web/e2e/features.spec.ts` → "table column filter"
- `web/src/views/TableView.test.tsx` → "TableView"

## Behavior
Spreadsheet-like view of all people. Cells are editable inline. Columns can be shown/hidden.

## Invariants
- All people shown in rows
- Cells editable in working mode, read-only in original mode
- Column visibility toggleable
- Delete button per row
- Checkbox for multi-select

## Edge cases
- Read-only mode (original data view)

---

# Scenario: Diff mode

**ID**: VIEW-004
**Area**: views
**Tests**:
- `web/e2e/features.spec.ts` → "diff mode shows changes"
- `web/src/hooks/useOrgDiff.test.ts` → "computeDiff"

## Behavior
When data view is set to "diff", nodes are annotated with change types comparing working vs original.

## Invariants
- Added: in working but not original (by UUID)
- Removed: in original but not working (shown as ghosts)
- Reporting change: managerId differs
- Title change: role differs
- Reorg: team differs
- Multiple change types can combine on one person

## Edge cases
- Identical data returns empty diff
- Empty arrays return empty diff

---

# Scenario: Build org tree

**ID**: VIEW-005
**Area**: views
**Tests**:
- `web/src/views/shared.test.ts` → "buildOrgTree"
- `web/src/views/shared.property.test.ts` → "buildOrgTree property-based tests"

## Behavior
People array is converted to a tree structure for rendering. Root nodes are people with no manager (or unresolvable manager).

## Invariants
- Every person appears exactly once
- Parent-child relationships match managerId
- Children sorted by sortIndex
- Root nodes have empty or unresolvable managerId
- No duplicate IDs in output

## Edge cases
- Empty input → empty output
- Single person → one root
- Multiple roots
- Deep nesting

---

# Scenario: Lasso multi-select

**ID**: VIEW-006
**Area**: views
**Tests**:
- `web/e2e/features.spec.ts` → "lasso multi-select"
- `web/src/hooks/useLassoSelect.test.ts` → "useLassoSelect"
- `web/src/hooks/useLassoSelect.test.ts` → "rectsIntersect (geometry)"

## Behavior
User click-drags on empty space to draw a selection rectangle. All person nodes intersecting the rectangle are selected.

## Invariants
- Selection starts after 5px movement threshold
- Pod header nodes (id starting with pod:) are excluded
- Right-click does not start lasso
- Clicking on draggable elements does not start lasso
- Selection cleared when clicking empty space without dragging

## Edge cases
- Container offset and scroll offset accounted for
- Lasso disabled when enabled=false

---

# Scenario: Multi-select batch edit

**ID**: VIEW-007
**Area**: views
**Tests**:
- `web/e2e/smoke.spec.ts` → "multi-select batch edit"
- `web/src/components/DetailSidebar.test.tsx` → "batch edit"

## Behavior
User selects multiple people (via lasso or shift/ctrl-click). The sidebar shows a batch edit form. Only changed fields are applied to all selected people.

## Invariants
- Mixed values shown as "Mixed" placeholder
- Only dirty fields are sent to the server
- Manager change triggers reparent for each person
- Field updates sent for each person individually
- Failure count reported if some updates fail

## Edge cases
- Batch with zero dirty fields → save is no-op

---

# Scenario: Chart layout and edge lines

**ID**: VIEW-008
**Area**: views
**Tests**:
- `web/src/views/ColumnView.golden.test.tsx` → "renders status variants"
- `web/src/views/ManagerView.golden.test.tsx` → "renders manager hierarchy"

## Behavior
The chart layout hook (`useChartLayout`) computes connecting lines between org chart nodes and manages drag-and-drop interactions. It accepts an array of edges (fromId → toId) and computes SVG line coordinates relative to the chart container.

## Invariants
- Lines only rendered for edges where both source and target DOM elements exist
- Coordinates computed relative to container scroll position and bounding rect
- Lines recalculate on: edge array changes, container resize (via ResizeObserver), scroll events
- Solid edges connect from source bottom-center to target top-center
- Dashed edges connect from source bottom-center to target bottom-center
- `activeDragId` is null except during an active drag operation
- Mouse sensor requires 8px activation distance before drag starts
- Keyboard sensor is included for accessibility

## Edge cases
- Missing node element: edge silently skipped (no error thrown)
- Empty edges array: lines set to empty array
- No container ref: lines set to empty array, no observers attached
- Container scroll: coordinates account for both scrollLeft and scrollTop
