# Extract ChartShell from ColumnView/ManagerView

**Issue:** #41
**Scope:** Extract shared outer shell into `ChartShell` component. Extract `PodHeaderNode` into its own file. No behavior change.

## Problem

`ColumnView.tsx` (337 LOC) and `ManagerView.tsx` (269 LOC) share ~70 identical lines of outer shell: hook setup (`useViewData`, `useOrg`, `buildOrgTree`, `useChartLayout`, `useLassoSelect`), auto-scroll effect, `chartValue` memo, empty-state check, and JSX wrapper (`ChartProvider` > `DndContext` > container > `LassoSvgOverlay` > forest > `OrphanGroup` > `DragBadgeOverlay`). Adding a bug fix or feature to this shell requires changing both files identically.

## Design

### ChartShell component

New file `web/src/views/ChartShell.tsx`. Owns the shared outer shell and accepts render strategies for the parts that differ.

```tsx
interface ChartShellProps {
  computeEdges: (people: Person[], roots: OrgNode[]) => Edge[]
  renderSubtree: (node: OrgNode) => ReactNode
  renderOrphanSubtree?: (node: OrgNode) => ReactNode
  renderTeamHeader?: (team: string, count: number) => ReactNode
  dashedEdges?: boolean
  useGhostPeople?: boolean
  includeAddToTeam?: boolean
  wrapOrphansInIcStack?: boolean
}
```

ChartShell does:
1. Calls `useViewData()` and `useOrg()` to get people, changes, managerSet, pods, callbacks
2. Builds org tree: `buildOrgTree(people)`
3. Computes edges via `props.computeEdges(people, roots)`
4. Sets up `useChartLayout(edges, roots)` for DnD sensors, node refs, lines, drag state
5. Sets up `useLassoSelect` for rectangle-select
6. Auto-scroll effect for selected node
7. Builds `chartValue` memo for `ChartProvider` — includes `handleAddToTeam` only when `includeAddToTeam` is true
8. Empty-state check
9. Renders JSX:
   - `ChartProvider` wrapping `DndContext`
   - Container div with `ref={containerRef}`
   - `LassoSvgOverlay` with `dashedEdges` prop
   - Forest div: roots with children mapped through `renderSubtree`
   - `OrphanGroup` with `renderSubtree` set to `renderOrphanSubtree ?? renderSubtree`, `renderTeamHeader` if provided, `wrapInIcStack` from prop
   - `DragBadgeOverlay`

### PodHeaderNode extraction

Move `PodHeaderNode` from `ColumnView.tsx` to `web/src/views/PodHeaderNode.tsx`. It's used by ColumnView's `SubtreeNode` and passed as `renderTeamHeader` to `OrphanGroup`. Its CSS classes move too (from `ColumnView.module.css` to `PodHeaderNode.module.css`).

### Simplified ColumnView

After extraction, ColumnView contains:
- `SubtreeNode` — the recursive IC-rendering component (unique to this view)
- `ColumnView` default export — calls `<ChartShell>` with column-specific props

```tsx
export default function ColumnView() {
  const { ghostPeople, handleAddToTeam } = useViewData()
  return (
    <ChartShell
      computeEdges={(people) => computeEdges(people)}
      renderSubtree={(node) => <SubtreeNode node={node} />}
      renderTeamHeader={(team, count) => <PodHeaderNode podName={team} memberCount={count} />}
      dashedEdges
      useGhostPeople
      includeAddToTeam
    />
  )
}
```

Drops from ~337 LOC to ~200 LOC.

### Simplified ManagerView

After extraction, ManagerView contains:
- `buildStatusGroups` — status bucketing helper (unique to this view)
- `SummaryCard` — IC summary component (unique to this view)
- `ManagerSubtree` — recursive manager-rendering component (unique to this view)
- `computeManagerEdges` — extracted inline edge computation to a named function
- `ManagerView` default export — calls `<ChartShell>` with manager-specific props

```tsx
export default function ManagerView() {
  return (
    <ChartShell
      computeEdges={(_, roots) => computeManagerEdges(roots)}
      renderSubtree={(node) => <ManagerSubtree node={node} />}
      wrapOrphansInIcStack={false}
    />
  )
}
```

Drops from ~269 LOC to ~170 LOC.

### Edge computation

ColumnView currently imports `computeEdges` from `columnEdges.ts` — that stays unchanged.

ManagerView currently computes edges inline in a `useMemo`. Extract that logic to a `computeManagerEdges(roots: OrgNode[])` function at the top of ManagerView (or a separate file). ChartShell calls `props.computeEdges(people, roots)` inside its own `useMemo`.

### CSS

ChartShell needs its own `ChartShell.module.css` with the shared styles: `container`, `svgOverlay`, `forest`. Currently both `ColumnView.module.css` and `ManagerView.module.css` define these identically. After extraction:
- `ChartShell.module.css` — container, svgOverlay, forest
- `ColumnView.module.css` — subtree, nodeSlot, children, icStack, teamHeader* styles
- `ManagerView.module.css` — subtree, nodeSlot, children, summaryCard*, podCard* styles
- `PodHeaderNode.module.css` — teamHeaderWrapper, teamHeader, teamHeaderClickable, teamHeaderName, teamHeaderCount, podNoteIcon, podNotePanel, podNoteText

## Testing

- All existing ColumnView, ManagerView, and OrphanGroup tests continue to pass unchanged — ChartShell is a pure extraction
- Add a basic render test for ChartShell: provide a mock `computeEdges` and `renderSubtree`, verify the container and forest render

## Files

| File | Change |
|------|--------|
| `web/src/views/ChartShell.tsx` | New: shared outer shell component |
| `web/src/views/ChartShell.module.css` | New: shared container/forest/overlay styles |
| `web/src/views/PodHeaderNode.tsx` | New: extracted from ColumnView |
| `web/src/views/PodHeaderNode.module.css` | New: pod header styles |
| `web/src/views/ColumnView.tsx` | Simplify: remove shell, use ChartShell |
| `web/src/views/ColumnView.module.css` | Remove shared styles (kept in ChartShell.module.css) |
| `web/src/views/ManagerView.tsx` | Simplify: remove shell, use ChartShell |
| `web/src/views/ManagerView.module.css` | Remove shared styles (kept in ChartShell.module.css) |

## Not in scope

- Deduplicating `SubtreeNode` and `ManagerSubtree` — their rendering logic is genuinely different
- Changing DnD behavior or lasso behavior
- React.memo on PersonNode (#42 — separate issue)
