# Performance Optimization Design — #109

Optimize rendering for orgs up to 500-1000 people without architectural changes.

## Problem

Every PersonNode renders on any context state change. Edge lines are computed via synchronous `getBoundingClientRect` in `useLayoutEffect` for all edges, even off-screen. TableView renders all rows without windowing. At 500+ people, ColumnView lags due to O(N) edge computation and full tree rendering.

## Approach

Optimize the existing system — no virtualization library for tree views, `react-window` for TableView only.

### 1. TableView virtualization

Replace the `filteredPeople.map()` in TableView with `react-window`'s `FixedSizeList`. TableView is a flat list with no edges — the simplest virtualization target. Scales to 5000+ rows.

The sticky header stays outside the virtual list. Each row is rendered by a `Row` component receiving the index. The existing `TableRow` component is reused.

### 2. Edge culling in useChartLayout

Currently `useChartLayout` calls `getBoundingClientRect` on every node in every edge pair, in a `useLayoutEffect` that blocks paint. Two optimizations:

**Viewport intersection check**: Before measuring an edge's endpoints, check if either node is in the viewport using `IntersectionObserver` or a simple bounds check against the scroll container. Skip edges where both endpoints are off-screen.

**Move to `useEffect`**: Switch from `useLayoutEffect` (synchronous, blocks paint) to `useEffect` (async). Edge lines are visual decoration — a 1-frame delay is invisible but eliminates paint blocking.

### 3. React.memo audit

- `ICNode` (created in Wave 4, `ColumnView.tsx`) is not memoized. Wrap with `React.memo`.
- `LayoutTeamGroup` in ColumnView is not memoized. Wrap with `React.memo`.
- `ManagerLayoutSubtree` in ManagerView is not memoized. Wrap with `React.memo`.
- `PersonNode` is already `memo`'d — no change needed.
- `GroupHeaderNode` is not memoized — wrap with `React.memo`.

### 4. Auto-collapse deep subtrees (optional, deferred)

Not implementing now. If needed later: auto-collapse subtrees beyond depth 4, users expand on demand. This caps DOM node count at ~100-200 regardless of org size.

## Files

- `web/src/views/TableView.tsx` — add `react-window` virtualization
- `web/src/hooks/useChartLayout.ts` — edge culling, switch to useEffect
- `web/src/views/ColumnView.tsx` — memo ICNode, LayoutTeamGroup
- `web/src/views/ManagerView.tsx` — memo ManagerLayoutSubtree
- `web/src/components/GroupHeaderNode.tsx` — wrap with React.memo
- `package.json` — add `react-window` + `@types/react-window`

## Testing

- Existing e2e performance tests (200 people) must still pass
- Existing Go stress tests (500 people) unchanged
- TableView: verify scroll renders correct rows, search/filter still works
- Edge culling: verify visible edges still draw correctly
- Memo: verify no visual regressions (golden snapshot tests)

## Out of scope

- Canvas/WebGL rendering
- Virtualization for ColumnView/ManagerView tree structures
- Pre-computed static layouts
- Auto-collapse (deferred)
