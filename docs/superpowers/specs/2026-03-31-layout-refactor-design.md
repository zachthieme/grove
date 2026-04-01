# Layout Tree Refactor Design — #100, #104, #101, #105, #103

Rewrite `buildManagerLayout` as a pipeline of focused functions, fix type semantics, and bring ManagerView to rendering parity with ColumnView.

## Problem

`buildManagerLayout` in `layoutTree.ts` is a 120-line monolith handling manager reordering, cross-team IC classification, pod/team grouping, and child assembly. The `ManagerLayout` type leaks a rendering concern (`crossTeamICs`). `PodGroupLayout` is reused for non-pod team groups (semantic overload). ManagerView silently drops orphan nodes and computes edges from OrgNodes instead of LayoutNodes.

## Design

### New LayoutNode type hierarchy (#104, #101)

**Remove `crossTeamICs` from `ManagerLayout`:**

```typescript
export interface ManagerLayout {
  type: 'manager'
  person: Person
  collapseKey: string
  children: LayoutNode[]
}
```

Views derive cross-team ICs from the children array by filtering on `affiliation !== 'local'`. ColumnView already has this information — `ICLayout.affiliation` is set during layout computation. The `crossTeamICs` field was a rendering hint that doesn't belong in the layout model.

**Fix PodGroupLayout semantics (#101):**

`PodGroupLayout` is only created when there's an actual pod. When ICs from multiple teams are grouped without pods, use `TeamGroupLayout` instead — which already exists but was only used for orphan roots. The collapse key for within-manager team groups uses `team:{managerId}:{teamName}` (distinct from orphan groups which use `orphan:{teamName}`).

No changes to `PodGroupLayout` or `TeamGroupLayout` type definitions. The fix is in the construction logic — stop creating `podGroup` nodes with team names as `podName`.

### Rewrite buildManagerLayout as pipeline (#100)

The current monolith becomes:

```
buildManagerLayout(node) =
  1. partition children into managers[] and ics[]
  2. reorderManagersByAffinity(managers, ics)     — already extracted, unchanged
  3. classifyICs(ics, managers)                   → { withinManager, afterManager, unaffiliated }
  4. groupUnaffiliated(unaffiliated, managerId)   → LayoutNode[] (podGroups, teamGroups, or flat ICs)
  5. assembleChildren(managers, withinManager, afterManager, groups) → LayoutNode[]
```

All functions stay in `layoutTree.ts`. Each is independently testable.

**`classifyICs`** extracts the cross-team classification logic (current lines 164-202). Returns three buckets: `withinManager` (single-affiliation cross-team ICs, keyed by manager index), `afterManager` (multi-affiliation ICs, keyed by highest manager index), `unaffiliated` (local ICs and ICs with no matching manager).

**`groupUnaffiliated`** extracts the pod/team grouping logic (current lines 218-265). Key fix: when grouping by team (no pods), creates `TeamGroupLayout` with collapse key `team:{managerId}:{teamName}` instead of `PodGroupLayout`.

**`assembleChildren`** extracts the interleave logic (current lines 204-215). For each manager (in order): emits the manager subtree, then its within-manager cross-team ICs (single-affiliation, placed immediately after the manager in the children array — not in a separate field), then any after-manager multi-affiliation ICs. Appends grouped unaffiliated ICs at the end.

### ManagerView rendering parity (#105)

`ManagerView.renderLayoutNode` currently returns `null` for non-manager nodes. Add handling for `'teamGroup'` — render as a `SummaryCard` with the team name, consistent with how ManagerView already renders pod groups inside `ManagerLayoutSubtree`.

Inside `ManagerLayoutSubtree`, add a `'teamGroup'` case in the child type switch that renders a `SummaryCard` (same as existing `unpoddedPeople` handling but grouped by team).

### ManagerView edge computation (#103)

Replace `computeManagerEdges` (which walks `OrgNode` trees) with a `LayoutNode`-walking version. Use the `layoutRoots` parameter that `ChartShell` already passes:

```typescript
function computeManagerEdges(
  _people: Person[], _roots: OrgNode[], layoutRoots?: LayoutNode[]
): ChartEdge[] {
  if (!layoutRoots) return []
  const result: ChartEdge[] = []
  function walk(node: LayoutNode) {
    if (node.type !== 'manager') return
    for (const child of node.children) {
      if (child.type === 'manager') {
        result.push({ fromId: node.person.id, toId: child.person.id })
        walk(child)
      }
    }
  }
  for (const root of layoutRoots) walk(root)
  return result
}
```

### ColumnView consumer update

ColumnView currently reads `node.crossTeamICs` and passes it to `LayoutSubtree`. After removing the field, ColumnView derives cross-team ICs from children:

```typescript
const crossTeamICs = node.children.filter(
  (c): c is ICLayout => c.type === 'ic' && c.affiliation !== 'local'
)
```

This replaces `crossTeamICs={node.crossTeamICs}` in the `LayoutSubtree` usage inside `childElements`.

### Test changes

**layoutTree.test.ts:**
- Update tests that reference `crossTeamICs` to instead check that single-affiliation ICs appear in the children array with `singleCrossTeam` affiliation
- Update the `ALLOWED_FIELDS` map to remove `crossTeamICs` from manager
- Update `collectPersons` to not separately walk `crossTeamICs`
- Update `assertNoExtraFields` to not separately walk `crossTeamICs`
- Fix test that expects `PodGroupLayout` for team groups — should now expect `TeamGroupLayout`
- Add tests for new extracted functions: `classifyICs`, `groupUnaffiliated`
- Update the collapse key format test for within-manager team groups: `team:{managerId}:{teamName}`

**ManagerView tests:**
- Update golden test to verify orphan nodes render (not silently dropped)

**ColumnView tests:**
- Regression: verify cross-team ICs still render beside their manager after deriving from children

## Files

- `web/src/views/layoutTree.ts` — rewrite buildManagerLayout, remove crossTeamICs from ManagerLayout, fix PodGroupLayout semantics
- `web/src/views/layoutTree.test.ts` — update tests for new structure
- `web/src/views/ManagerView.tsx` — render teamGroup nodes, replace computeManagerEdges with LayoutNode walker
- `web/src/views/ColumnView.tsx` — derive crossTeamICs from children instead of reading field
- `web/src/views/columnEdges.ts` — no changes needed (already walks LayoutNodes)
