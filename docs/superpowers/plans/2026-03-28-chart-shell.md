# ChartShell Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the shared outer shell from ColumnView and ManagerView into a reusable ChartShell component, eliminating ~70 lines of duplication per view.

**Architecture:** Create `ChartShell` as a wrapper component that owns hooks (useViewData, useOrg, useChartLayout, useLassoSelect), auto-scroll effect, chartValue memo, and the JSX wrapper (ChartProvider > DndContext > container > overlays > forest > OrphanGroup). Views pass render strategies for the parts that differ. Extract PodHeaderNode to its own file since it's shared.

**Tech Stack:** React 19, TypeScript, @dnd-kit/core, CSS Modules

---

### Task 1: Extract PodHeaderNode to its own file

`PodHeaderNode` lives inside `ColumnView.tsx` but is used by both ColumnView (in SubtreeNode) and as a render prop for OrphanGroup. Extract it and its styles to standalone files.

**Files:**
- Create: `web/src/views/PodHeaderNode.tsx`
- Create: `web/src/views/PodHeaderNode.module.css`
- Modify: `web/src/views/ColumnView.tsx`
- Modify: `web/src/views/ColumnView.module.css`

- [ ] **Step 1: Create PodHeaderNode.module.css**

Move the pod-header-related styles from `ColumnView.module.css` (lines 52-137) to the new file. These are: `teamHeaderWrapper`, `teamHeader`, `teamHeaderClickable`, `teamHeader:hover`, `podNoteIcon`, `podNoteIcon:hover`, `podNoteIconActive`, `podNotePanel`, `@keyframes podNoteSlideIn`, `podNoteText`, `teamHeaderName`, `teamHeaderCount`.

```css
.teamHeaderWrapper {
  position: relative;
}

.teamHeader {
  border: 1.5px solid var(--border-medium);
  border-left: 3.5px solid var(--grove-green);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  padding: 8px 12px;
  text-align: left;
  box-shadow: var(--shadow-sm);
  cursor: default;
  transition: all var(--transition-normal);
}

.teamHeaderClickable {
  cursor: pointer;
}

.teamHeader:hover {
  box-shadow: var(--shadow-md);
}

.podNoteIcon {
  position: absolute;
  bottom: -8px;
  right: 6px;
  width: 20px;
  height: 20px;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  background: var(--surface-raised);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  z-index: 3;
  padding: 0;
}

.podNoteIcon:hover, .podNoteIconActive {
  opacity: 1;
  transform: scale(1.1);
}

.podNotePanel {
  margin-top: 4px;
  padding: 8px 10px;
  background: var(--surface-note);
  border: 1px solid var(--grove-gold-light);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  box-shadow: var(--shadow-sm);
  animation: podNoteSlideIn 0.15s ease-out;
}

@keyframes podNoteSlideIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.podNoteText {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.teamHeaderName {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.teamHeaderCount {
  font-size: 10px;
  color: var(--grove-green);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}
```

- [ ] **Step 2: Create PodHeaderNode.tsx**

Move the `PodHeaderNode` component from `ColumnView.tsx` (lines 19-88) to this new file. Change the styles import from `./ColumnView.module.css` to `./PodHeaderNode.module.css`. Add the needed imports:

```tsx
import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import NodeActions from '../components/NodeActions'
import styles from './PodHeaderNode.module.css'

export function PodHeaderNode({ podName, memberCount, publicNote, onAdd, onClick, nodeRef, podNodeId }: {
  podName: string
  memberCount: number
  publicNote?: string
  onAdd?: () => void
  onClick?: () => void
  nodeRef?: (el: HTMLDivElement | null) => void
  podNodeId?: string
}) {
  // ... exact same body as current ColumnView PodHeaderNode (lines 28-87)
}
```

- [ ] **Step 3: Update ColumnView.tsx**

- Remove the `PodHeaderNode` function definition (lines 19-88)
- Remove `NodeActions` import (no longer used directly)
- Add import: `import { PodHeaderNode } from './PodHeaderNode'`
- Remove the pod-header styles from `ColumnView.module.css` (lines 52-137)

- [ ] **Step 4: Run tests**

Run: `cd web && npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 5: Commit**

```
refactor: extract PodHeaderNode to standalone component
```

---

### Task 2: Create ChartShell.module.css with shared styles

Extract the 3 styles that are identical between ColumnView and ManagerView: `container`, `svgOverlay`, `forest`.

**Files:**
- Create: `web/src/views/ChartShell.module.css`
- Modify: `web/src/views/ColumnView.module.css`
- Modify: `web/src/views/ManagerView.module.css`

- [ ] **Step 1: Create ChartShell.module.css**

```css
.container {
  position: relative;
  overflow: auto;
  flex: 1;
  padding: 28px;
}

.svgOverlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  overflow: visible;
}

.forest {
  display: inline-flex;
  gap: 32px;
  position: relative;
  z-index: 1;
  min-width: 100%;
  justify-content: center;
}
```

- [ ] **Step 2: Remove shared styles from ColumnView.module.css**

Remove the `container`, `svgOverlay`, and `forest` classes (lines 1-26). The file should start with `.subtree`.

- [ ] **Step 3: Remove shared styles from ManagerView.module.css**

Remove the `container`, `svgOverlay`, and `forest` classes (lines 1-26). The file should start with `.subtree`.

- [ ] **Step 4: Do NOT run tests yet** — views still import their own CSS for these classes. Tests will fail until ChartShell provides them.

- [ ] **Step 5: Commit**

```
refactor: extract shared chart CSS to ChartShell.module.css
```

---

### Task 3: Create ChartShell component

The core task. Create the shared wrapper that both views will use.

**Files:**
- Create: `web/src/views/ChartShell.tsx`
- Test: existing ColumnView/ManagerView tests validate behavior

- [ ] **Step 1: Create ChartShell.tsx**

```tsx
import { useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { DndContext } from '@dnd-kit/core'
import type { Person } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import { useChartLayout } from '../hooks/useChartLayout'
import { useLassoSelect } from '../hooks/useLassoSelect'
import { buildOrgTree, type OrgNode } from './shared'
import { OrphanGroup } from './OrphanGroup'
import { ChartProvider } from './ChartContext'
import { DragBadgeOverlay } from './DragBadgeOverlay'
import { LassoSvgOverlay } from './LassoSvgOverlay'
import { useViewData } from '../store/ViewDataContext'
import { useOrg } from '../store/OrgContext'
import styles from './ChartShell.module.css'

export interface ChartShellProps {
  computeEdges: (people: Person[], roots: OrgNode[]) => ChartEdge[]
  renderSubtree: (node: OrgNode) => ReactNode
  renderOrphanSubtree?: (node: OrgNode) => ReactNode
  renderTeamHeader?: (team: string, count: number) => ReactNode
  /** Styles for subtree-level layout (subtree, nodeSlot, children, icStack) */
  viewStyles: Record<string, string>
  dashedEdges?: boolean
  useGhostPeople?: boolean
  includeAddToTeam?: boolean
  wrapOrphansInIcStack?: boolean
}

export default function ChartShell({
  computeEdges,
  renderSubtree,
  renderOrphanSubtree,
  renderTeamHeader,
  viewStyles,
  dashedEdges,
  useGhostPeople,
  includeAddToTeam,
  wrapOrphansInIcStack = true,
}: ChartShellProps) {
  const {
    people, ghostPeople, changes, managerSet, pods,
    handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus,
  } = useViewData()
  const { selectedIds, batchSelect, selectPod } = useOrg()

  const roots = useMemo(() => buildOrgTree(people), [people])
  const edges = useMemo(() => computeEdges(people, roots), [computeEdges, people, roots])

  const { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, roots)

  useEffect(() => {
    if (selectedIds.size !== 1) return
    const id = [...selectedIds][0]
    const el = nodeRefs.current.get(id)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedIds, nodeRefs])

  const handleLassoSelect = useCallback((ids: Set<string>) => {
    batchSelect?.(ids)
  }, [batchSelect])

  const { lassoRect } = useLassoSelect({
    containerRef,
    nodeRefs,
    onSelect: handleLassoSelect,
    enabled: true,
  })

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  const chartValue = useMemo(() => ({
    selectedIds, changes, managerSet, pods,
    onSelect: handleSelect,
    onBatchSelect: batchSelect,
    onAddReport: handleAddReport,
    onAddToTeam: includeAddToTeam ? handleAddToTeam : undefined,
    onDeletePerson: handleDeletePerson,
    onInfo: handleShowInfo,
    onFocus: handleFocus,
    onPodSelect: selectPod,
    setNodeRef,
  }), [selectedIds, changes, managerSet, pods, handleSelect, batchSelect, handleAddReport, includeAddToTeam, handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus, selectPod, setNodeRef])

  if (people.length === 0 && (!useGhostPeople || (ghostPeople ?? []).length === 0)) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <ChartProvider value={chartValue}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.container} ref={containerRef} data-role="chart-container">
          <LassoSvgOverlay lassoRect={lassoRect} lines={lines} className={styles.svgOverlay} dashedEdges={dashedEdges} />
          <div className={styles.forest} data-role="forest">
            {roots.filter((r) => r.children.length > 0).map((root) => (
              renderSubtree(root)
            ))}
            <OrphanGroup
              orphans={roots.filter((r) => r.children.length === 0)}
              roots={roots}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              onAddReport={handleAddReport}
              onDeletePerson={handleDeletePerson}
              onInfo={handleShowInfo}
              styles={viewStyles}
              wrapInIcStack={wrapOrphansInIcStack}
              renderSubtree={renderOrphanSubtree ?? renderSubtree}
              renderTeamHeader={renderTeamHeader}
            />
          </div>
        </div>
        <DragBadgeOverlay draggedPerson={draggedPerson} selectedIds={selectedIds} />
      </DndContext>
    </ChartProvider>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit 2>&1 | head -20`
Expected: May have errors if views still use old patterns — that's fine, ChartShell itself should have no type errors.

- [ ] **Step 3: Commit**

```
feat: create ChartShell shared wrapper component
```

---

### Task 4: Rewrite ColumnView to use ChartShell

**Files:**
- Modify: `web/src/views/ColumnView.tsx`

- [ ] **Step 1: Rewrite ColumnView**

Remove all the outer shell code (hooks, effects, lasso, chartValue, JSX wrapper). Keep `SubtreeNode` and the default export. The new `ColumnView` becomes:

```tsx
import { useMemo, useCallback, type ReactNode } from 'react'
import type { Pod } from '../api/types'
import { useViewData } from '../store/ViewDataContext'
import { computeEdges } from './columnEdges'
import { computeRenderItems } from './columnLayout'
import { DraggableNode, type OrgNode } from './shared'
import { buildPodDropId } from '../utils/ids'
import { useChart } from './ChartContext'
import { PodHeaderNode } from './PodHeaderNode'
import ChartShell from './ChartShell'
import styles from './ColumnView.module.css'

function SubtreeNode({ node }: { node: OrgNode }) {
  // ... exact same SubtreeNode body (lines 90-263 in current file)
  // No changes needed — it uses useChart() which ChartShell provides
}

export default function ColumnView() {
  return (
    <ChartShell
      computeEdges={(people) => computeEdges(people)}
      renderSubtree={(node) => <SubtreeNode key={node.person.id} node={node} />}
      renderTeamHeader={(team, count) => <PodHeaderNode podName={team} memberCount={count} />}
      viewStyles={styles}
      dashedEdges
      useGhostPeople
      includeAddToTeam
    />
  )
}
```

Remove these imports that are no longer needed in ColumnView:
- `useEffect`, `useState` (useState was only used by PodHeaderNode, already extracted)
- `DndContext`, `useDroppable` (useDroppable was only in PodHeaderNode)
- `useChartLayout`, `useLassoSelect`
- `ChartProvider`
- `DragBadgeOverlay`, `LassoSvgOverlay`
- `useOrg`
- `OrphanGroup`
- `NodeActions`
- `buildOrgTree` (still needed by — wait, no. buildOrgTree is called by ChartShell now. Check if SubtreeNode uses it. No — SubtreeNode receives nodes via props. So remove it.)

Keep: `useMemo`, `useCallback`, `type ReactNode`, `Pod`, `useViewData` (if SubtreeNode still needs pod lookup — check. Actually SubtreeNode gets pods from `useChart()`, not useViewData. But ColumnView's default export doesn't need useViewData since ChartShell calls it. Remove it from the default export, keep only if SubtreeNode needs it. SubtreeNode uses `useChart()` which has pods. So no useViewData needed.)

Wait — the current `ColumnView` default export passes `ghostPeople` and `handleAddToTeam` from `useViewData`. With ChartShell, those are handled internally via the `useGhostPeople` and `includeAddToTeam` boolean props. So ColumnView's default export needs NO hooks at all — just returns JSX.

- [ ] **Step 2: Run tests**

Run: `cd web && npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS — behavior unchanged

- [ ] **Step 3: Commit**

```
refactor: rewrite ColumnView to use ChartShell
```

---

### Task 5: Rewrite ManagerView to use ChartShell

**Files:**
- Modify: `web/src/views/ManagerView.tsx`

- [ ] **Step 1: Extract computeManagerEdges**

The current ManagerView computes edges inline in a `useMemo` (lines 173-203). Extract to a standalone function at the top of the file:

```tsx
import type { ChartEdge } from '../hooks/useChartLayout'

function computeManagerEdges(_people: Person[], roots: OrgNode[]): ChartEdge[] {
  const result: ChartEdge[] = []
  function collectEdges(nodes: OrgNode[]) {
    for (const n of nodes) {
      for (const child of n.children) {
        if (child.children.length > 0) {
          result.push({ fromId: n.person.id, toId: child.person.id })
        }
      }
      collectEdges(n.children)
    }
  }
  collectEdges(roots)
  return result
}
```

Note: `_people` is unused — the function only needs roots. But ChartShell calls `computeEdges(people, roots)`, so the signature must accept both.

- [ ] **Step 2: Rewrite ManagerView**

Remove all outer shell code. Keep `buildStatusGroups`, `SummaryCard`, `ManagerSubtree`, and the default export:

```tsx
// Scenarios: VIEW-002
import { useMemo } from 'react'
import type { Person, Pod } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'
import { useChart } from './ChartContext'
import { DraggableNode, type OrgNode } from './shared'
import ChartShell from './ChartShell'
import styles from './ManagerView.module.css'

function computeManagerEdges(_people: Person[], roots: OrgNode[]): ChartEdge[] {
  // ... as above
}

function buildStatusGroups(people: Person[]): { label: string; count: number }[] {
  // ... unchanged (lines 19-50)
}

function SummaryCard({ ... }: { ... }) {
  // ... unchanged (lines 52-84)
}

function ManagerSubtree({ node }: { node: OrgNode }) {
  // ... unchanged (lines 86-164)
}

export default function ManagerView() {
  return (
    <ChartShell
      computeEdges={computeManagerEdges}
      renderSubtree={(node) => <ManagerSubtree key={node.person.id} node={node} />}
      viewStyles={styles}
      wrapOrphansInIcStack={false}
    />
  )
}
```

Remove these imports:
- `useEffect`, `useCallback`
- `DndContext`
- `useViewData`, `useOrg`
- `useChartLayout`, `useLassoSelect`
- `buildOrgTree`
- `OrphanGroup`
- `ChartProvider`
- `DragBadgeOverlay`, `LassoSvgOverlay`

- [ ] **Step 3: Run tests**

Run: `cd web && npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 4: Commit**

```
refactor: rewrite ManagerView to use ChartShell
```

---

### Task 6: Update golden tests and final verification

Golden tests snapshot HTML structure. The wrapper markup now comes from ChartShell's CSS module class names instead of view-specific ones. The golden snapshots may need regeneration.

**Files:**
- Possibly update: `web/src/views/ColumnView.golden.test.tsx`
- Possibly update: `web/src/views/ManagerView.golden.test.tsx`
- Update golden snapshot files

- [ ] **Step 1: Run all tests**

Run: `cd web && npm test 2>&1 | tail -20`

If golden tests fail because class names changed (container/forest/svgOverlay now come from ChartShell.module.css instead of ColumnView.module.css / ManagerView.module.css), update the golden snapshots:

Run: `cd web && npm test -- --update 2>&1 | tail -20`

- [ ] **Step 2: Verify line count reduction**

Run: `wc -l web/src/views/ColumnView.tsx web/src/views/ManagerView.tsx web/src/views/ChartShell.tsx web/src/views/PodHeaderNode.tsx`

Expected approximately:
- ColumnView: ~200 (down from 337)
- ManagerView: ~170 (down from 269)
- ChartShell: ~110 (new)
- PodHeaderNode: ~75 (extracted)
- Net: ~555 total vs ~606 original = ~50 fewer lines, with the duplication eliminated

- [ ] **Step 3: Run full stack tests**

Run: `go test ./... && cd web && npm test`
Expected: All PASS

- [ ] **Step 4: Commit if golden snapshots changed**

```
test: update golden snapshots for ChartShell extraction
```
