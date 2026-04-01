# usePersonNodeProps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated ChartContext-to-PersonNode prop mapping into a `usePersonNodeProps` hook, reducing prop drilling in ColumnView and ManagerView.

**Architecture:** New hook reads from `useChart()`, computes all PersonNode props for a given person ID. Views call the hook and spread the result, adding only view-specific props (`showTeam`, `collapsed`, `onToggleCollapse`).

**Tech Stack:** TypeScript, React, Vitest

---

### Task 1: Create `usePersonNodeProps` hook

**Files:**
- Create: `web/src/hooks/usePersonNodeProps.ts`

- [ ] **Step 1: Create the hook**

Create `web/src/hooks/usePersonNodeProps.ts`:

```typescript
import type { Person } from '../api/types'
import type { PersonChange } from './useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import { useChart } from '../views/ChartContext'

export interface PersonNodeCommonProps {
  selected: boolean
  changes?: PersonChange
  isManager?: boolean
  editing: boolean
  editBuffer: EditBuffer | null
  focusField: 'name' | null
  onAdd?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onEditMode?: () => void
  onClick: (e?: React.MouseEvent) => void
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
  onCommitEdits?: () => void
  cardRef: (el: HTMLDivElement | null) => void
}

export function usePersonNodeProps(person: Person): PersonNodeCommonProps {
  const {
    selectedIds, changes, managerSet, interactionMode,
    editingPersonId, editBuffer, onSelect, onAddReport,
    onAddParent, onDeletePerson, onInfo, onFocus,
    onEditMode, onEnterEditing, onUpdateBuffer, onCommitEdits,
    setNodeRef,
  } = useChart()

  const id = person.id
  const isEditing = interactionMode === 'editing' && editingPersonId === id

  return {
    selected: selectedIds.has(id),
    changes: changes?.get(id),
    isManager: managerSet?.has(id),
    editing: isEditing,
    editBuffer: isEditing ? editBuffer ?? null : null,
    focusField: isEditing ? 'name' : null,
    onAdd: onAddReport ? () => onAddReport(id) : undefined,
    onAddParent: onAddParent ? () => onAddParent(id) : undefined,
    onDelete: onDeletePerson ? () => onDeletePerson(id) : undefined,
    onInfo: onInfo ? () => onInfo(id) : undefined,
    onFocus: onFocus && managerSet?.has(id) ? () => onFocus(id) : undefined,
    onEditMode: onEditMode ? () => onEditMode(id) : undefined,
    onClick: (e?: React.MouseEvent) => onSelect(id, e),
    onEnterEditing: onEnterEditing ? () => onEnterEditing(person) : undefined,
    onUpdateBuffer: onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined,
    onCommitEdits,
    cardRef: setNodeRef(id),
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit 2>&1 | tail -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
jj describe -m "feat: create usePersonNodeProps hook to centralize PersonNode prop mapping (#102)"
jj new
```

---

### Task 2: Use hook in ColumnView

**Files:**
- Modify: `web/src/views/ColumnView.tsx`

- [ ] **Step 1: Replace renderIC with hook-based component**

The current `renderIC` is a `useCallback` that creates inline closures for each prop. Replace it with a small component that uses the hook.

In `web/src/views/ColumnView.tsx`, add the import:

```typescript
import { usePersonNodeProps } from '../hooks/usePersonNodeProps'
```

Replace the `renderIC` useCallback (lines 21-47) with a component:

```typescript
  function ICNode({ ic }: { ic: ICLayout }) {
    const props = usePersonNodeProps(ic.person)
    return (
      <div className={styles.nodeSlot}>
        <PersonNode person={ic.person} {...props} />
      </div>
    )
  }
```

Update all `renderIC(ic)` calls to `<ICNode key={ic.person.id} ic={ic} />`:

- In `renderPodGroup` (around line 73): `{group.members.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}`
- In `childElements` case `'ic'` with non-local affiliation (around line 109): replace `renderIC(child)` with `<ICNode key={child.person.id} ic={child} />`
- In `childElements` ic batch flush (around line 91-95): replace `{icBatch.map((ic) => renderIC(ic))}` with `{icBatch.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}`

- [ ] **Step 2: Replace manager node props with hook**

Replace the `managerNodeEl` block (lines 132-157). Add the hook call and simplify:

```typescript
  function ManagerNode({ node, isCollapsed }: { node: ManagerLayout; isCollapsed: boolean }) {
    const props = usePersonNodeProps(node.person)
    return (
      <div className={styles.nodeSlot}>
        <PersonNode
          person={node.person}
          showTeam={node.children.length > 0 || !!props.isManager}
          collapsed={node.children.length > 0 ? isCollapsed : undefined}
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
          {...props}
        />
      </div>
    )
  }
```

Wait — `ManagerNode` needs `onToggleCollapse` from ChartContext. Since this is a nested component inside `LayoutSubtree`, it can access `onToggleCollapse` from the parent's scope. But extracting it as a standalone component would be cleaner. Actually, keep it as an inline component within `LayoutSubtree` so it can access `onToggleCollapse` from the closure.

Replace the `managerNodeEl` const with the inline component and use it:

```typescript
  const managerProps = usePersonNodeProps(node.person)
  const managerNodeEl = (
    <div className={styles.nodeSlot}>
      <PersonNode
        person={node.person}
        showTeam={node.children.length > 0 || !!managerProps.isManager}
        collapsed={node.children.length > 0 ? isCollapsed : undefined}
        onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
        {...managerProps}
      />
    </div>
  )
```

- [ ] **Step 3: Clean up unused destructures**

Remove from the `useChart()` destructure in `LayoutSubtree` all properties that are now handled by the hook. Keep only what's still used directly:

```typescript
  const { selectedPodId, pods, onAddToTeam, onPodSelect, setNodeRef, collapsedIds, onToggleCollapse } = useChart()
```

Wait — `ICNode` is now a child component that calls `usePersonNodeProps` (which calls `useChart()`), so it doesn't need the parent's destructured values. The manager node uses `usePersonNodeProps` at the parent level, so `managerProps` covers it. Check what's still needed:

- `selectedPodId` — used in `renderPodGroup` for pod selection highlight
- `pods` — used in `findPod` and `renderPodGroup`
- `onAddToTeam` — used in `renderPodGroup`
- `onPodSelect` — used in `renderPodGroup`
- `setNodeRef` — used in `renderPodGroup` for group header ref
- `collapsedIds` — used for `isCollapsed` and `podCollapsed`
- `onToggleCollapse` — used for manager and pod collapse

Remove all the editing/selection/action properties from the destructure since they're now inside the hook.

- [ ] **Step 4: Update LayoutTeamGroup to use hook**

In `LayoutTeamGroup` (around line 175), the IC rendering manually passes props. Replace with the hook:

```typescript
function LayoutTeamGroup({ group }: { group: TeamGroupLayout }) {
  const { collapsedIds, onToggleCollapse, onSelect, selectedIds } = useChart()
  const isCollapsed = collapsedIds?.has(group.collapseKey) ?? false

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <GroupHeaderNode
          nodeId={group.collapseKey}
          name={group.teamName}
          count={group.members.length}
          collapsed={isCollapsed}
          onClick={(e) => onSelect(group.collapseKey, e)}
          selected={selectedIds.has(group.collapseKey)}
          dragData={{ memberIds: group.members.map(m => m.person.id) }}
          onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
        />
      </div>
      {!isCollapsed && (
        <div className={styles.children}>
          <div className={styles.icStack}>
            {group.members.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}
          </div>
        </div>
      )}
    </div>
  )
}
```

Wait — `ICNode` is defined inside `LayoutSubtree`. It needs to be extracted to file scope so `LayoutTeamGroup` can use it too. Move `ICNode` to before `LayoutSubtree`:

```typescript
function ICNode({ ic }: { ic: ICLayout }) {
  const props = usePersonNodeProps(ic.person)
  return (
    <div className={styles.nodeSlot}>
      <PersonNode person={ic.person} {...props} />
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS. Golden snapshots may need updating.

- [ ] **Step 6: Commit**

```bash
jj describe -m "refactor: use usePersonNodeProps hook in ColumnView (#102)"
jj new
```

---

### Task 3: Use hook in ManagerView

**Files:**
- Modify: `web/src/views/ManagerView.tsx`

- [ ] **Step 1: Add import and use hook in ManagerLayoutSubtree**

Add import:

```typescript
import { usePersonNodeProps } from '../hooks/usePersonNodeProps'
```

In `ManagerLayoutSubtree` (line 115), replace the massive destructure with a focused one. The hook handles all PersonNode props. Keep only what's needed for non-PersonNode concerns:

```typescript
function ManagerLayoutSubtree({ node }: { node: ManagerLayout }) {
  const { collapsedIds, onToggleCollapse } = useChart()
  const managerProps = usePersonNodeProps(node.person)

  const isCollapsed = collapsedIds?.has(node.collapseKey) ?? false
```

Replace the PersonNode in the manager rendering (around line 144-166) with:

```typescript
        <PersonNode
          person={node.person}
          showTeam={node.children.length > 0 || !!managerProps.isManager}
          collapsed={node.children.length > 0 ? isCollapsed : undefined}
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
          {...managerProps}
        />
```

- [ ] **Step 2: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS. Golden snapshots may need updating.

- [ ] **Step 3: Commit**

```bash
jj describe -m "refactor: use usePersonNodeProps hook in ManagerView (#102)"
jj new
```
