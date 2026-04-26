# Performance Budget Scenarios

---

# Scenario: ColumnView mount budget (N=100)

**ID**: PERF-001
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-001] ColumnView mount N=100 within budget"

## Behavior
ColumnView mounts a 100-node org chart in under 150ms (jsdom).

## Invariants
- Initial render time scales sub-linearly with org size.

---

# Scenario: ColumnView mount budget (N=1000)

**ID**: PERF-002
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-002] ColumnView mount N=1000 within budget"

## Behavior
ColumnView mounts a 1000-node org chart in under 1500ms (jsdom).

---

# Scenario: ColumnView mount budget (N=5000)

**ID**: PERF-003
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-003] ColumnView mount N=5000 within budget"

## Behavior
ColumnView mounts a 5000-node org chart in under 8000ms (jsdom).

---

# Scenario: ColumnView selection re-render budget (N=1000)

**ID**: PERF-004
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-004] ColumnView re-render after selection change within budget"

## Behavior
Selecting a single node in a 1000-node org triggers a re-render that completes in under 300ms.

## Invariants
- Selection of one node does not cause a full-tree re-mount cost.

---

# Scenario: ColumnView selection re-render commit count bound (N=1000)

**ID**: PERF-005
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-005] ColumnView selection re-render commit count is bounded"

## Behavior
A single-id selection change re-renders fewer than 50 React commits in a 1000-node org.

## Invariants
- LayoutSubtree memoization keeps unrelated subtrees from re-rendering on selection change.
- This is the strict regression gate for the per-id selector + memo work.

## Edge cases
- Selection cleared (empty set) — should produce same bounded commit count.
- Selection of root manager — full subtree may legitimately re-render; the bound (50) tolerates this.
- Re-selecting the already-selected id — should produce zero-or-near-zero new commits.

---

# Scenario: ManagerView mount budget (N=1000)

**ID**: PERF-006
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-006] ManagerView mount N=1000 within budget"

## Behavior
ManagerView mounts a 1000-node org chart in under 1500ms (jsdom).
