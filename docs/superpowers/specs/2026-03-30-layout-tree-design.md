# Layout Tree: Unified Layout Computation Layer

## Problem

Layout/placement logic is duplicated across ColumnView, ManagerView, and OrphanGroup. Each view independently splits children into managers/ICs, groups ICs by pod/team, constructs collapse keys, and detects cross-team affiliations. When a layout feature is implemented in one view, it often breaks or is missing from another.

The BaseNode refactor unified the rendering layer. This spec unifies the data transformation layer above it.

## Approach

Introduce a single `computeLayoutTree()` function that transforms an `OrgNode` tree into a `LayoutNode` tree. Both views consume LayoutNodes instead of doing their own grouping/ordering logic.

### What the shared layer decides

- Child ordering (manager affinity reordering)
- IC grouping by pod/team
- Cross-team IC classification and placement
- Collapse key construction
- Orphan team grouping

### What views still decide

- DOM structure and CSS classes
- Whether ICs render as cards (ColumnView) or summary stats (ManagerView)
- Whether cross-team ICs render horizontally adjacent or not
- Edge line geometry (DOM-dependent)

## API Surface

One function, one file: `web/src/views/layoutTree.ts`.

```ts
computeLayoutTree(
  roots: OrgNode[],
  options?: { includeOrphans?: boolean }
): LayoutNode[]
```

### LayoutNode Types

Discriminated union with four variants:

```ts
type LayoutNode = ManagerLayout | ICLayout | PodGroupLayout | TeamGroupLayout

interface ManagerLayout {
  type: 'manager'
  person: Person
  collapseKey: string          // person.id
  children: LayoutNode[]       // ordered: managers first (affinity-reordered),
                               // then ICs/groups
  crossTeamICs: ICLayout[]     // single-affiliation ICs attached to this manager
}

interface ICLayout {
  type: 'ic'
  person: Person
  affiliation: 'local' | 'singleCrossTeam' | 'multiCrossTeam'
}

interface PodGroupLayout {
  type: 'podGroup'
  podName: string
  managerId: string
  collapseKey: string          // "pod:{managerId}:{podName}"
  members: ICLayout[]
}

interface TeamGroupLayout {
  type: 'teamGroup'
  teamName: string
  collapseKey: string          // "orphan:{teamName}"
  members: ICLayout[]
}
```

### The `includeOrphans` Option

Roots with no children are "orphans" — currently handled separately by `OrphanGroup` in `ChartShell`. When `includeOrphans` is true, `computeLayoutTree` groups orphan roots into `TeamGroupLayout` nodes and appends them to the returned array. When false (default), orphans are excluded — the caller handles them separately. This preserves the current ChartShell split (`roots with children` vs `OrphanGroup`) during incremental migration, and gets cleaned up in Step 4.

### Key Decisions

- `ManagerLayout.children` is already in render order — affinity reordering applied, multi-affiliation ICs placed after their highest-indexed manager, unaffiliated ICs grouped at the end.
- `crossTeamICs` on ManagerLayout replaces the current `RenderItem.crossTeamICs` — same concept, in the shared model.
- Collapse keys are computed once. Views never construct `pod:X:Y` or `orphan:X` strings — they read `collapseKey`.
- `affiliation` on ICLayout replaces scattered `additionalTeams.length` checks.

### What Gets Deleted

- `columnLayout.ts` — `computeRenderItems` and `reorderManagersByAffinity` move into `layoutTree.ts`
- Pod grouping logic in `ColumnView.tsx` (`icPodListElements`, `mixedChildrenElements` grouping)
- Pod grouping logic in `ManagerView.tsx` (`unpoddedICs`, `icPodGroups`)
- Orphan team grouping in `OrphanGroup.tsx` (the `teamOrder`/`teamMap` logic)
- `isCrossTeam()` helper in ColumnView
- Inline `buildPodDropId` calls for collapse key construction

Views shrink to pure rendering: iterate `LayoutNode.children`, switch on `type`, render the appropriate component.

## Edge Computation

Edges stay view-specific (ColumnView draws IC edges, ManagerView doesn't), but consume LayoutNodes instead of re-deriving the tree structure.

### Current Problem

`columnEdges.ts` rebuilds `childrenMap`, re-splits managers/ICs, re-groups by pod — all work the layout tree already did.

### New Approach

Each edge function walks the LayoutNode tree:

**ColumnView edges** (`columnEdges.ts`):
```ts
computeEdges(layoutRoots: LayoutNode[]): EdgeDef[]
```
- `ManagerLayout` → edge to each child ManagerLayout
- `PodGroupLayout` → edge from parent to pod header (using `collapseKey` as node ID), then pod header to first IC
- `ICLayout` with `affiliation === 'local'` → edge from parent to first IC in batch
- `ICLayout` with cross-team affiliation → dashed edge to team lead (ColumnView-specific)

**ManagerView edges** (inline or `managerEdges.ts`):
```ts
computeManagerEdges(layoutRoots: LayoutNode[]): EdgeDef[]
```
- Walk tree, emit edge for each `ManagerLayout` child. Ignore IC/pod/team nodes.

Pod node IDs for edges (`pod:X:Y`) are read from `PodGroupLayout.collapseKey` instead of being reconstructed inline. If the key format changes, it changes in one place.

## Negative Tests for Abstraction Leaks

Five test categories, all pure unit tests against `computeLayoutTree` — no DOM needed. These form the contract that both views rely on.

### 1. No Rendering Hints in Output

Assert LayoutNode types have no fields like `cssClass`, `direction`, `renderAs`, `horizontal`. Type-level guarantee (TypeScript won't compile if added to the union), plus runtime property scan on output nodes to catch extra fields via spread operators.

### 2. Exhaustiveness — Every Person Appears Exactly Once

Feed N people in, flatten all LayoutNode members/persons out, assert the set of IDs equals the input set. No duplicates, no drops. Parameterized across org shapes: flat team, deep chain, multi-pod, cross-team, orphans.

### 3. Grouping Correctness

- Every IC in a `PodGroupLayout` has `person.pod === podGroup.podName`
- Every IC in a `TeamGroupLayout` has `person.team === teamGroup.teamName`
- Every IC with `affiliation === 'singleCrossTeam'` has exactly 1 matching manager in `additionalTeams`
- Every IC with `affiliation === 'local'` has empty `additionalTeams`
- No person with `additionalTeams` ends up with `affiliation === 'local'`

### 4. Collapse Key Uniqueness and Format

- All `collapseKey` values across the full tree are unique
- Manager collapse keys equal the person ID (not prefixed)
- Pod collapse keys match `pod:{managerId}:{podName}`
- Team collapse keys match `orphan:{teamName}`
- No hardcoded string construction in views — view tests that need a collapse key read it from the LayoutNode

### 5. Stability

- Same input produces identical output on repeated calls (no hidden randomness or insertion-order dependence)
- Adding an unrelated person to a different subtree doesn't change the layout of existing subtrees (locality — catches accidental global index dependencies)

## Migration Path

Each step is independently deployable and testable.

### Step 1: Build `layoutTree.ts` with tests

Implement `computeLayoutTree` and all negative tests from above. No view changes yet — existing code still works.

### Step 2: Migrate ColumnView

- Replace `computeRenderItems` calls with `computeLayoutTree`
- `SubtreeNode` switches on `LayoutNode.type` instead of doing its own manager/IC split and pod grouping
- Delete `icPodListElements` and `mixedChildrenElements` memos
- Delete `isCrossTeam()` helper
- Update `columnEdges.ts` to walk LayoutNodes

### Step 3: Migrate ManagerView

- Replace `unpoddedICs`/`icPodGroups` memo with LayoutNode iteration
- `ManagerSubtree` renders `ManagerLayout` children as subtrees, `PodGroupLayout` as SummaryCards, `ICLayout` batch as SummaryCard
- Update `computeManagerEdges` to walk LayoutNodes

### Step 4: Migrate OrphanGroup

- `OrphanGroup` receives `TeamGroupLayout[]` instead of raw `OrgNode[]`
- Deletes its own team grouping logic — just renders the groups it's given

### Step 5: Cleanup

- Delete `columnLayout.ts` (fully absorbed)
- Remove `buildPodDropId` from collapse key construction in views (still used for drop targets, but collapse keys come from LayoutNode)
