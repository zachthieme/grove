# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize rendering for orgs up to 500-1000 people — virtualize TableView, cull off-screen edges, and memoize key components.

**Architecture:** Use `@tanstack/react-virtual` for TableView row virtualization (works with `<table>` elements, React 19 compatible). Switch edge computation from `useLayoutEffect` to `useEffect` with viewport culling. Add `React.memo` to unmemoized components.

**Tech Stack:** TypeScript, React 19, @tanstack/react-virtual, Vitest

---

### Task 1: Add `@tanstack/react-virtual` dependency

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd /home/zach/code/grove/web && npm install @tanstack/react-virtual
```

- [ ] **Step 2: Verify install**

```bash
cd /home/zach/code/grove/web && node -e "require('@tanstack/react-virtual')" && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
jj describe -m "chore: add @tanstack/react-virtual for table virtualization (#109)"
jj new
```

---

### Task 2: Virtualize TableView rows

**Files:**
- Modify: `web/src/views/TableView.tsx:250-357`
- Modify: `web/src/views/TableView.module.css`

- [ ] **Step 1: Read the current TableView rendering**

Read `web/src/views/TableView.tsx` lines 250-360 to understand the current `<table>` structure. The rows are at lines 304-317:

```tsx
{filteredPeople.map(person => (
  <TableRow key={person.id} ... />
))}
```

These are plain `<tr>` elements inside a `<tbody>`. Draft rows follow (lines 318-354).

- [ ] **Step 2: Add the virtualizer hook**

In `web/src/views/TableView.tsx`, add the import:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'
```

Inside the component, after `filteredPeople` is computed, add the virtualizer. You need a ref for the scrollable container (the `tableWrapper` div):

```typescript
const tableWrapperRef = useRef<HTMLDivElement>(null)

const rowVirtualizer = useVirtualizer({
  count: filteredPeople.length,
  getScrollElement: () => tableWrapperRef.current,
  estimateSize: () => 36,
  overscan: 20,
})
```

The `estimateSize` of 36px is based on typical table row height. `overscan: 20` renders 20 extra rows above/below the viewport for smooth scrolling.

- [ ] **Step 3: Attach ref to the scroll container**

Find the `<div className={styles.tableWrapper}>` (around line 283) and add the ref:

```tsx
<div className={styles.tableWrapper} ref={tableWrapperRef}>
```

- [ ] **Step 4: Replace the tbody content with virtualized rows**

Replace the `filteredPeople.map()` block (lines 304-317) with virtualized rendering:

```tsx
<tbody>
  {/* Spacer row to position virtual rows correctly */}
  <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }}>
    <td colSpan={visibleColumns.length + 2} />
  </tr>
  {rowVirtualizer.getVirtualItems().map(virtualRow => {
    const person = filteredPeople[virtualRow.index]
    return (
      <TableRow
        key={person.id}
        person={person}
        columns={visibleColumns}
        managers={managers}
        change={changes?.get(person.id)}
        readOnly={readOnly}
        selected={selectedIds.has(person.id)}
        onToggleSelect={handleRowSelect}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    )
  })}
  {/* Bottom spacer */}
  <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0)}px` }}>
    <td colSpan={visibleColumns.length + 2} />
  </tr>
  {/* Draft rows always rendered (small count) */}
  {drafts.map((draft, draftIdx) => (
    <tr key={draft.id} className={styles.rowDraft} ref={draftIdx === drafts.length - 1 ? newestDraftRef : undefined}>
      <td className={styles.actionCell} />
      {visibleColumns.map(col => (
        <td key={col.key} className={`${styles.cell} ${styles.cellEditing}`}>
          {col.cellType === 'dropdown' ? (
            <select
              className={styles.cellInput}
              value={draft.values[col.key]}
              onChange={e => updateDraft(draft.id, col.key, e.target.value)}
              onBlur={() => saveDraft(draft.id)}
            >
              <option value="">--</option>
              {col.key === 'status'
                ? STATUSES.map(s => <option key={s} value={s}>{s}</option>)
                : col.key === 'managerId'
                ? managers.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                : null
              }
            </select>
          ) : (
            <input
              className={styles.cellInput}
              type={col.cellType === 'number' ? 'number' : 'text'}
              value={draft.values[col.key]}
              onChange={e => updateDraft(draft.id, col.key, e.target.value)}
              onBlur={() => saveDraft(draft.id)}
              placeholder={col.label}
            />
          )}
        </td>
      ))}
      <td className={styles.actionCell}>
        <button className={styles.deleteBtn} onClick={() => discardDraft(draft.id)} title="Discard" aria-label="Discard draft row">x</button>
      </td>
    </tr>
  ))}
</tbody>
```

- [ ] **Step 5: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS. If TableView golden snapshots fail, update with `--update`.

- [ ] **Step 6: Commit**

```bash
jj describe -m "perf: virtualize TableView rows with @tanstack/react-virtual (#109)"
jj new
```

---

### Task 3: Edge culling and async computation in useChartLayout

**Files:**
- Modify: `web/src/hooks/useChartLayout.ts:46-81`

- [ ] **Step 1: Switch from useLayoutEffect to useEffect**

In `web/src/hooks/useChartLayout.ts`, change `useLayoutEffect` (line 46) to `useEffect`:

```typescript
  useEffect(() => {
```

This makes edge computation non-blocking — a 1-frame delay for visual decoration lines is imperceptible.

- [ ] **Step 2: Add viewport culling**

Replace the edge computation loop (lines 56-79) with a version that skips edges where both endpoints are off-screen:

```typescript
  useEffect(() => {
    if (!containerRef.current || edges.length === 0) {
      setLines([])
      return
    }
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const sl = container.scrollLeft
    const st = container.scrollTop
    const viewLeft = sl
    const viewRight = sl + rect.width
    const viewTop = st
    const viewBottom = st + rect.height
    const computed: ChartLine[] = []

    for (const { fromId, toId, dashed } of edges) {
      const fromEl = nodeRefs.current.get(fromId)
      const toEl = nodeRefs.current.get(toId)
      if (!fromEl || !toEl) continue
      const fr = fromEl.getBoundingClientRect()
      const tr = toEl.getBoundingClientRect()

      // Convert to container-relative coordinates
      const fx = fr.left - rect.left + sl
      const fy = fr.top - rect.top + st
      const tx = tr.left - rect.left + sl
      const ty = tr.top - rect.top + st

      // Skip edges where both endpoints are off-screen
      const fromVisible = fx + fr.width > viewLeft && fx < viewRight && fy + fr.height > viewTop && fy < viewBottom
      const toVisible = tx + tr.width > viewLeft && tx < viewRight && ty + tr.height > viewTop && ty < viewBottom
      if (!fromVisible && !toVisible) continue

      if (dashed) {
        computed.push({
          x1: fr.left + fr.width / 2 - rect.left + sl,
          y1: fr.bottom - rect.top + st,
          x2: tr.left + tr.width / 2 - rect.left + sl,
          y2: tr.bottom - rect.top + st,
          dashed: true,
        })
      } else {
        computed.push({
          x1: fr.left + fr.width / 2 - rect.left + sl,
          y1: fr.bottom - rect.top + st,
          x2: tr.left + tr.width / 2 - rect.left + sl,
          y2: tr.top - rect.top + st,
        })
      }
    }
    setLines(computed)
  }, [edges, resizeKey, layoutDeps])
```

- [ ] **Step 3: Recompute edges on scroll**

The current code recomputes on `resizeKey` (ResizeObserver) but not on scroll. Add a scroll listener to trigger recomputation so edges update when the user scrolls and new nodes come into view:

```typescript
  const [scrollKey, setScrollKey] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          setScrollKey(k => k + 1)
          ticking = false
        })
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
```

Add `scrollKey` to the edge computation `useEffect` dependency array:

```typescript
  }, [edges, resizeKey, scrollKey, layoutDeps])
```

- [ ] **Step 4: Remove unused useLayoutEffect import**

Update the import line to remove `useLayoutEffect`:

```typescript
import { useRef, useState, useEffect, useCallback } from 'react'
```

- [ ] **Step 5: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
jj describe -m "perf: async edge computation with viewport culling (#109)"
jj new
```

---

### Task 4: React.memo audit

**Files:**
- Modify: `web/src/views/ColumnView.tsx:12-19` — memo ICNode
- Modify: `web/src/views/ColumnView.tsx` — memo LayoutTeamGroup
- Modify: `web/src/views/ManagerView.tsx` — memo ManagerLayoutSubtree
- Modify: `web/src/components/GroupHeaderNode.tsx` — memo export

- [ ] **Step 1: Memoize ICNode in ColumnView**

In `web/src/views/ColumnView.tsx`, add `memo` to the React import:

```typescript
import { useMemo, useCallback, memo, type ReactNode } from 'react'
```

Wrap `ICNode` with `memo`:

```typescript
const ICNode = memo(function ICNode({ ic }: { ic: ICLayout }) {
  const props = usePersonNodeProps(ic.person)
  return (
    <div className={styles.nodeSlot}>
      <PersonNode person={ic.person} {...props} />
    </div>
  )
})
```

- [ ] **Step 2: Memoize LayoutTeamGroup in ColumnView**

Wrap `LayoutTeamGroup` with `memo`:

```typescript
const LayoutTeamGroup = memo(function LayoutTeamGroup({ group }: { group: TeamGroupLayout }) {
```

Close with `)` after the function body.

- [ ] **Step 3: Memoize ManagerLayoutSubtree in ManagerView**

In `web/src/views/ManagerView.tsx`, add `memo` to the React import:

```typescript
import { useCallback, memo, type ReactNode } from 'react'
```

Wrap `ManagerLayoutSubtree`:

```typescript
const ManagerLayoutSubtree = memo(function ManagerLayoutSubtree({ node }: { node: ManagerLayout }) {
```

Close with `)` after the function body.

- [ ] **Step 4: Memoize GroupHeaderNode**

In `web/src/components/GroupHeaderNode.tsx`, add `memo` to the import from React:

```typescript
import { memo } from 'react'
```

Wrap the export:

```typescript
const GroupHeaderNodeInner = function GroupHeaderNode(/* existing props */) {
  // ... existing body unchanged
}

export default memo(GroupHeaderNodeInner)
```

Actually, simpler — just wrap the existing function:

```typescript
export default memo(function GroupHeaderNode({ ... }: Props) {
  // ... existing body
})
```

- [ ] **Step 5: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS. Memo should not change behavior, only skip unnecessary re-renders.

- [ ] **Step 6: Commit**

```bash
jj describe -m "perf: memoize ICNode, LayoutTeamGroup, ManagerLayoutSubtree, GroupHeaderNode (#109)"
jj new
```
