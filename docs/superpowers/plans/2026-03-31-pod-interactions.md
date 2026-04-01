# Pod/Group Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable selection highlighting and group drag on GroupHeaderNode for pods and team groups (#97 already working, #99 selection, #98 drag).

**Architecture:** Thread `selectedPodId` through ChartContext so views can highlight the selected pod header. Add `dragData` prop to GroupHeaderNode carrying member IDs. Detect group drags in `useDragDrop` via `memberIds` in drag data and bulk-move all members.

**Tech Stack:** TypeScript, React, @dnd-kit/core, Vitest

---

### Task 1: Close #97 — collapsible pods already working

**Files:**
- None (verification only)

- [ ] **Step 1: Verify pod collapse wiring exists**

Check that ColumnView passes `collapsed` and `onToggleCollapse` to GroupHeaderNode for pod groups. Confirm BaseNode renders the collapse toggle button. This is already wired.

- [ ] **Step 2: Close the issue**

```bash
gh issue close 97 -c "Pod collapse already works — wired through GroupHeaderNode → BaseNode collapse toggle in the BaseNode hierarchy refactor."
```

---

### Task 2: Thread `selectedPodId` through ChartContext (#99)

**Files:**
- Modify: `web/src/views/ChartContext.tsx:7-32`
- Modify: `web/src/views/ChartShell.tsx:85-107`

- [ ] **Step 1: Add `selectedPodId` to ChartContextValue**

In `web/src/views/ChartContext.tsx`, add to the interface:

```typescript
export interface ChartContextValue {
  selectedIds: Set<string>
  selectedPodId?: string | null
  changes?: Map<string, PersonChange>
  // ... rest unchanged
}
```

- [ ] **Step 2: Thread it in ChartShell**

In `web/src/views/ChartShell.tsx`, add `selectedPodId` to the chart value object (around line 86):

```typescript
  const chartValue = useMemo(() => ({
    selectedIds: selection.selectedIds, selectedPodId: selection.selectedPodId, changes, managerSet, pods,
```

- [ ] **Step 3: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS (additive change, no consumers yet).

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: thread selectedPodId through ChartContext for pod selection highlighting (#99)"
jj new
```

---

### Task 3: Wire selection highlighting to GroupHeaderNode (#99)

**Files:**
- Modify: `web/src/views/ColumnView.tsx:49-78` — pod group selection
- Modify: `web/src/views/ColumnView.tsx:173-214` — team group selection

- [ ] **Step 1: Add `selectedPodId` to useChart destructure in LayoutSubtree**

In `web/src/views/ColumnView.tsx`, in the `LayoutSubtree` component (line 13), add `selectedPodId` to the destructure:

```typescript
  const { selectedIds, selectedPodId, onSelect, changes, managerSet, pods, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onAddToTeam, onDeletePerson, onInfo, onFocus, onEditMode, onPodSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef, collapsedIds, onToggleCollapse } = useChart()
```

- [ ] **Step 2: Pass `selected` to pod GroupHeaderNode**

In the `renderPodGroup` callback (around line 49-78), add `selected` prop to GroupHeaderNode:

```typescript
          <GroupHeaderNode
            nodeId={group.collapseKey}
            name={group.podName}
            count={group.members.length}
            noteText={pod?.publicNote}
            selected={selectedPodId != null && selectedPodId === pod?.id}
            onAdd={onAddToTeam ? () => onAddToTeam(group.managerId, pod?.team ?? group.podName, group.podName) : undefined}
            onInfo={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            cardRef={setNodeRef(group.collapseKey)}
            droppableId={group.collapseKey}
            collapsed={podCollapsed}
            onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
          />
```

Add `selectedPodId` to the `renderPodGroup` dependency array:

```typescript
  }, [pods, selectedPodId, onAddToTeam, onPodSelect, setNodeRef, collapsedIds, onToggleCollapse, renderIC])
```

- [ ] **Step 3: Wire team group selection**

In the `LayoutTeamGroup` component (around line 173), add `onSelect` to the destructure (already there). Pass `onClick` to the team group's `GroupHeaderNode`:

```typescript
        <GroupHeaderNode
          nodeId={group.collapseKey}
          name={group.teamName}
          count={group.members.length}
          collapsed={isCollapsed}
          onClick={(e) => onSelect(group.collapseKey, e)}
          selected={selectedIds.has(group.collapseKey)}
          onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
        />
```

- [ ] **Step 4: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS. Golden snapshots may need updating if selection attributes changed.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: highlight selected pod/team group headers (#99)"
jj new
```

---

### Task 4: Add `dragData` prop to GroupHeaderNode and wire member IDs (#98)

**Files:**
- Modify: `web/src/components/GroupHeaderNode.tsx` — add `dragData` prop
- Modify: `web/src/views/ColumnView.tsx` — pass `dragData` with member IDs
- Modify: `web/src/hooks/useDragDrop.ts` — detect group drags

- [ ] **Step 1: Add `dragData` prop to GroupHeaderNode**

In `web/src/components/GroupHeaderNode.tsx`, add `dragData` to the Props interface and pass it to BaseNode:

```typescript
interface Props {
  nodeId: string
  name: string
  count: number
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  onAdd?: () => void
  onInfo?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  droppableId?: string
  dragData?: Record<string, unknown>
}

export default function GroupHeaderNode({ nodeId, name, count, noteText, collapsed, onToggleCollapse, selected, onClick, onAdd, onInfo, cardRef, droppableId, dragData }: Props) {
```

Pass `dragData` to BaseNode:

```typescript
    <BaseNode
      nodeId={nodeId}
      variant="group"
      noteText={noteText}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selected={selected}
      onClick={onClick}
      draggable
      droppable
      droppableId={droppableId ?? nodeId}
      dragData={dragData}
      cardRef={cardRef}
      actions={actions}
      testId={`group-${name}`}
      ariaLabel={`${name} group`}
    >
```

- [ ] **Step 2: Pass `dragData` with member IDs in ColumnView**

In `web/src/views/ColumnView.tsx`, in `renderPodGroup`, add `dragData`:

```typescript
          <GroupHeaderNode
            nodeId={group.collapseKey}
            name={group.podName}
            count={group.members.length}
            noteText={pod?.publicNote}
            selected={selectedPodId != null && selectedPodId === pod?.id}
            onAdd={onAddToTeam ? () => onAddToTeam(group.managerId, pod?.team ?? group.podName, group.podName) : undefined}
            onInfo={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            cardRef={setNodeRef(group.collapseKey)}
            droppableId={group.collapseKey}
            dragData={{ memberIds: group.members.map(m => m.person.id) }}
            collapsed={podCollapsed}
            onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
          />
```

In `LayoutTeamGroup`, add `dragData` to the team group's `GroupHeaderNode`:

```typescript
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
```

- [ ] **Step 3: Detect group drags in useDragDrop**

In `web/src/hooks/useDragDrop.ts`, update the `onDragEnd` callback to check for `memberIds` in drag data. Replace the `idsToMove` computation (lines 26-28):

```typescript
    // If dragging a group header, move all members
    const memberIds = active.data.current?.memberIds as string[] | undefined
    const idsToMove = memberIds
      ? memberIds.filter((id) => id !== resolvedTargetId)
      : selectedIds.has(draggedId) && selectedIds.size > 1
        ? [...selectedIds].filter((id) => id !== resolvedTargetId)
        : [draggedId]
```

- [ ] **Step 4: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run --reporter=verbose 2>&1 | tail -10`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: enable group header drag to bulk-move members (#98)"
jj new
```
